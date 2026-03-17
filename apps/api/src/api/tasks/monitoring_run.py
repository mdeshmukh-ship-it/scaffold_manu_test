"""Daily monitoring run: check all families for drift breaches and record results."""

from __future__ import annotations

import random

from sqlalchemy import select

from api.db import operation
from api.logging_config import get_logger
from api.models import (
    Alert,
    DriftSnapshot,
    Family,
    FamilyRunResult,
    FamilyTarget,
    MonitoringRun,
    utcnow,
)
from api.notifications.slack import send_slack_alert
from api.tasks.base import TaskExecutionContext

logger = get_logger(__name__)


async def run_monitoring(context: TaskExecutionContext) -> None:
    """Execute a monitoring run: iterate over all enabled families, compute drift, detect breaches."""

    await context.mark_running(message="Starting monitoring run")

    # Create the run record
    async with operation("monitoring.create_run") as op:
        run = MonitoringRun(status="running", started_at=utcnow())
        op.session.add(run)
        await op.session.commit()
        await op.session.refresh(run)
        run_id = run.id

    # Fetch all enabled families
    async with operation("monitoring.fetch_families") as op:
        families = list(
            (await op.session.execute(select(Family).where(Family.monitoring_enabled.is_(True)))).scalars().all()
        )

    total = len(families)
    breach_count = 0
    error_count = 0

    await context.update_progress(progress_current=0, progress_total=total, message=f"Checking {total} families")

    for idx, family in enumerate(families):
        try:
            family_breached = await _check_family(run_id, family)
            if family_breached:
                breach_count += 1
        except Exception as exc:
            error_count += 1
            logger.exception(
                "monitoring family check failed",
                event_type="monitoring.error",
                severity="ERROR",
                family_id=family.id,
                family_name=family.name,
                error_type=exc.__class__.__name__,
                error_message=str(exc)[:256],
            )
            # Record error result
            async with operation("monitoring.record_error") as op:
                result = FamilyRunResult(
                    run_id=run_id,
                    family_id=family.id,
                    status="error",
                    error_message=str(exc)[:256],
                )
                op.session.add(result)
                await op.session.commit()

        await context.update_progress(
            progress_current=idx + 1,
            progress_total=total,
            message=f"Checked {idx + 1}/{total} families ({breach_count} breaches, {error_count} errors)",
        )

    # Finalize the run
    async with operation("monitoring.finalize_run") as op:
        run = (await op.session.execute(select(MonitoringRun).where(MonitoringRun.id == run_id))).scalar_one()
        run.status = "completed"
        run.completed_at = utcnow()
        run.total_families = total
        run.breach_count = breach_count
        run.error_count = error_count
        await op.session.commit()

    logger.info(
        "monitoring run completed",
        event_type="monitoring.completed",
        severity="INFO",
        run_id=run_id,
        total_families=total,
        breach_count=breach_count,
        error_count=error_count,
    )


async def _check_family(run_id: str, family: Family) -> bool:
    """Check a single family's drift and record the result. Returns True if breached."""

    async with operation("monitoring.check_family") as op:
        targets = list(
            (await op.session.execute(select(FamilyTarget).where(FamilyTarget.family_id == family.id))).scalars().all()
        )

        if not targets:
            # No targets configured: mark as in_balance
            result = FamilyRunResult(
                run_id=run_id,
                family_id=family.id,
                status="in_balance",
            )
            op.session.add(result)
            await op.session.commit()
            return False

        # Compute actual values for each target
        # TODO: Replace this placeholder with real market data integration.
        #       Currently generates simulated actuals for demonstration purposes.
        #       In production, this would fetch from a portfolio data source
        #       (e.g., custodian API, internal holdings database, or BigQuery).
        actuals = _simulate_actuals(targets)

        # Detect breaches
        is_any_breach = False
        snapshots: list[DriftSnapshot] = []

        result = FamilyRunResult(
            run_id=run_id,
            family_id=family.id,
            status="in_balance",
        )
        op.session.add(result)
        await op.session.flush()

        for target, actual_pct in zip(targets, actuals):
            drift = actual_pct - target.target_weight_pct
            breach = abs(drift) > family.drift_threshold_pct

            if breach:
                is_any_breach = True

            snapshot = DriftSnapshot(
                result_id=result.id,
                target_id=target.id,
                target_name=target.name,
                target_type=target.target_type,
                target_weight_pct=target.target_weight_pct,
                actual_market_value=0.0,  # TODO: populate with real market value
                actual_pct=round(actual_pct, 2),
                drift_pct=round(drift, 2),
                is_breach=breach,
            )
            snapshots.append(snapshot)
            op.session.add(snapshot)

        if is_any_breach:
            result.status = "breach"
            # Create an alert record
            breached_items = [s for s in snapshots if s.is_breach]
            summary_lines = [f"Family: {family.name}", f"Threshold: {family.drift_threshold_pct}%", ""]
            for snap in breached_items:
                summary_lines.append(
                    f"  {snap.target_name} ({snap.target_type}): "
                    f"Target {snap.target_weight_pct:.1f}% → Actual {snap.actual_pct:.1f}% "
                    f"(drift {snap.drift_pct:+.1f} pp)"
                )
            summary_lines.append("")
            summary_lines.append("⚠ Rebalance recommended")

            alert = Alert(
                family_id=family.id,
                result_id=result.id,
                pm_email=family.pm_email,
                summary_text="\n".join(summary_lines),
                delivery_status="pending",
            )
            op.session.add(alert)
            await op.session.commit()
            await op.session.refresh(alert)
            alert_id = alert.id
            alert_summary = alert.summary_text
        else:
            alert_id = None
            alert_summary = None

        await op.session.commit()

    # Send Slack notification outside the DB operation
    if is_any_breach and alert_id and alert_summary:
        delivered = await send_slack_alert(
            family_id=family.id,
            family_name=family.name,
            pm_email=family.pm_email,
            summary_text=alert_summary,
        )
        # Update alert delivery status
        async with operation("monitoring.update_alert_delivery") as op:
            alert_row = (await op.session.execute(select(Alert).where(Alert.id == alert_id))).scalar_one_or_none()
            if alert_row:
                alert_row.delivery_status = "sent" if delivered else "failed"
                await op.session.commit()

    return is_any_breach


def _simulate_actuals(targets: list[FamilyTarget]) -> list[float]:
    """Generate simulated actual weights that may drift from target weights.

    This is a placeholder. Replace with real portfolio data integration.
    """
    actuals = []
    for target in targets:
        # Add random drift between -15% and +15%
        noise = random.uniform(-15, 15)  # noqa: S311
        actual = max(0, target.target_weight_pct + noise)
        actuals.append(actual)

    # Normalize to sum to 100%
    total = sum(actuals)
    if total > 0:
        actuals = [a * 100 / total for a in actuals]

    return actuals
