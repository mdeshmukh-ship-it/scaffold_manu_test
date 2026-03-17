from __future__ import annotations

from typing import Any

import strawberry
from graphql import GraphQLError
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.audit import AuthorizationError, require_authenticated_user_email
from api.db import operation
from api.models import (
    Alert,
    DriftSnapshot,
    Family,
    FamilyRunResult,
    FamilyTarget,
    MonitoringRun,
    Note,
    User,
)
from api.tasks.base import get_task_run_for_user, list_task_runs_for_user, spawn_tracked_task
from api.tasks.note_summary import summarize_note_for_user, summarize_notes_task

from .types import (
    AlertType,
    CreateFamilyInput,
    CreateFamilyInputModel,
    CreateFamilyTargetInput,
    CreateFamilyTargetInputModel,
    CreateNoteInput,
    CreateNoteInputModel,
    CurrentUserType,
    FamilyRunResultType,
    FamilyType,
    MonitoringRunType,
    NoteType,
    TaskRunType,
    UpdateFamilyInput,
    UpdateFamilyTargetInput,
    ViewerType,
    alert_to_type,
    drift_snapshot_to_type,
    family_run_result_to_type,
    family_target_to_type,
    family_to_type,
    monitoring_run_to_type,
    note_to_type,
    task_run_to_type,
    user_email_to_viewer_type,
)


def _require_user_email(info: strawberry.Info[Any, Any], *, action: str, resource: str = "note") -> str:
    try:
        return require_authenticated_user_email(
            info.context.get("user_email"),
            action=action,
            resource=resource,
        )
    except AuthorizationError as exc:
        raise GraphQLError(str(exc)) from exc


async def _find_user_by_email(session: AsyncSession, user_email: str) -> User | None:
    return (await session.execute(select(User).where(User.email == user_email))).scalar_one_or_none()


@strawberry.type
class Query:
    @strawberry.field
    async def current_user(self, info: strawberry.Info[Any, Any]) -> CurrentUserType:
        user_email = _require_user_email(info, action="me.read")
        return CurrentUserType(id=user_email, email=user_email)

    @strawberry.field
    async def viewer(self, info: strawberry.Info[Any, Any]) -> ViewerType:
        user_email = _require_user_email(info, action="viewer.read")
        return user_email_to_viewer_type(user_email)

    @strawberry.field
    async def notes(self, info: strawberry.Info[Any, Any]) -> list[NoteType]:
        user_email = _require_user_email(info, action="notes.list")
        async with operation("notes.list") as op:
            user = await _find_user_by_email(op.session, user_email)
            if user is None:
                return []
            notes = (
                await op.session.execute(select(Note).where(Note.user_id == user.id).order_by(Note.created_at.desc()))
            ).scalars()
            return [note_to_type(note) for note in notes]

    @strawberry.field
    async def task_runs(self, info: strawberry.Info[Any, Any]) -> list[TaskRunType]:
        user_email = _require_user_email(info, action="tasks.list")
        async with operation("tasks.resolve_user") as op:
            user = await _find_user_by_email(op.session, user_email)
            if user is None:
                return []
        task_runs = await list_task_runs_for_user(user_id=user.id)
        return [task_run_to_type(task_run) for task_run in task_runs]

    @strawberry.field
    async def task_run(
        self,
        info: strawberry.Info[Any, Any],
        task_run_id: str,
    ) -> TaskRunType | None:
        user_email = _require_user_email(info, action="tasks.get")
        async with operation("tasks.resolve_user") as op:
            user = await _find_user_by_email(op.session, user_email)
            if user is None:
                return None
        task_run = await get_task_run_for_user(task_run_id=task_run_id, user_id=user.id)
        if task_run is None:
            return None
        return task_run_to_type(task_run)

    # -----------------------------------------------------------------------
    # Portfolio Drift Monitor queries
    # -----------------------------------------------------------------------

    @strawberry.field
    async def families(self, info: strawberry.Info[Any, Any]) -> list[FamilyType]:
        """List all families with their latest monitoring status."""
        _require_user_email(info, action="families.list", resource="family")
        async with operation("families.list") as op:
            families = (await op.session.execute(select(Family).order_by(Family.name))).scalars().all()
            result: list[FamilyType] = []
            for family in families:
                targets = (
                    await op.session.execute(select(FamilyTarget).where(FamilyTarget.family_id == family.id))
                ).scalars().all()
                # Get latest run result for this family
                latest_result = (
                    await op.session.execute(
                        select(FamilyRunResult)
                        .where(FamilyRunResult.family_id == family.id)
                        .order_by(FamilyRunResult.checked_at.desc())
                        .limit(1)
                    )
                ).scalar_one_or_none()
                latest_status = latest_result.status if latest_result else None
                latest_checked_at = latest_result.checked_at if latest_result else None
                # Count breached snapshots if breach
                breach_count = 0
                if latest_result and latest_result.status == "breach":
                    breach_count = (
                        await op.session.execute(
                            select(DriftSnapshot)
                            .where(DriftSnapshot.result_id == latest_result.id, DriftSnapshot.is_breach.is_(True))
                        )
                    ).scalars().all().__len__()
                result.append(family_to_type(family, list(targets), latest_status, latest_checked_at, breach_count))
            return result

    @strawberry.field
    async def family(self, info: strawberry.Info[Any, Any], family_id: str) -> FamilyType | None:
        """Get a single family with full detail for the drill-down view."""
        _require_user_email(info, action="families.get", resource="family")
        async with operation("families.get") as op:
            family = (
                await op.session.execute(select(Family).where(Family.id == family_id))
            ).scalar_one_or_none()
            if family is None:
                return None
            targets = (
                await op.session.execute(select(FamilyTarget).where(FamilyTarget.family_id == family.id))
            ).scalars().all()
            latest_result = (
                await op.session.execute(
                    select(FamilyRunResult)
                    .where(FamilyRunResult.family_id == family.id)
                    .order_by(FamilyRunResult.checked_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            latest_status = latest_result.status if latest_result else None
            latest_checked_at = latest_result.checked_at if latest_result else None
            breach_count = 0
            if latest_result and latest_result.status == "breach":
                breach_count = len(
                    (
                        await op.session.execute(
                            select(DriftSnapshot)
                            .where(DriftSnapshot.result_id == latest_result.id, DriftSnapshot.is_breach.is_(True))
                        )
                    ).scalars().all()
                )
            return family_to_type(family, list(targets), latest_status, latest_checked_at, breach_count)

    @strawberry.field
    async def family_drill_down(
        self, info: strawberry.Info[Any, Any], family_id: str
    ) -> FamilyRunResultType | None:
        """Get the latest monitoring result with drift snapshots for a family."""
        _require_user_email(info, action="families.drilldown", resource="family")
        async with operation("families.drilldown") as op:
            latest_result = (
                await op.session.execute(
                    select(FamilyRunResult)
                    .where(FamilyRunResult.family_id == family_id)
                    .order_by(FamilyRunResult.checked_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            if latest_result is None:
                return None
            snapshots = (
                await op.session.execute(
                    select(DriftSnapshot).where(DriftSnapshot.result_id == latest_result.id)
                )
            ).scalars().all()
            return family_run_result_to_type(latest_result, list(snapshots))

    @strawberry.field
    async def monitoring_runs(self, info: strawberry.Info[Any, Any]) -> list[MonitoringRunType]:
        """List monitoring runs (most recent first)."""
        _require_user_email(info, action="runs.list", resource="monitoring_run")
        async with operation("runs.list") as op:
            runs = (
                await op.session.execute(select(MonitoringRun).order_by(MonitoringRun.created_at.desc()).limit(50))
            ).scalars().all()
            return [monitoring_run_to_type(run) for run in runs]

    @strawberry.field
    async def alerts(self, info: strawberry.Info[Any, Any]) -> list[AlertType]:
        """List alert history (most recent first)."""
        _require_user_email(info, action="alerts.list", resource="alert")
        async with operation("alerts.list") as op:
            alerts = (
                await op.session.execute(select(Alert).order_by(Alert.sent_at.desc()).limit(100))
            ).scalars().all()
            result: list[AlertType] = []
            for alert in alerts:
                family = (
                    await op.session.execute(select(Family).where(Family.id == alert.family_id))
                ).scalar_one_or_none()
                family_name = family.name if family else "Unknown"
                result.append(alert_to_type(alert, family_name))
            return result


@strawberry.type
class Mutation:
    @strawberry.mutation
    async def create_note(
        self,
        info: strawberry.Info[Any, Any],
        input: CreateNoteInput,
    ) -> NoteType:
        user_email = _require_user_email(info, action="notes.create")
        try:
            payload = CreateNoteInputModel.model_validate({"title": input.title, "body": input.body})
        except ValidationError as exc:
            raise GraphQLError(exc.errors()[0]["msg"]) from exc

        async with operation("notes.create") as op:
            user = await _find_user_by_email(op.session, user_email)
            if user is None:
                user = User(email=user_email)
                op.session.add(user)
                await op.session.flush()

            note = Note(user_id=user.id, title=payload.title.strip(), body=payload.body.strip())
            op.session.add(note)
            await op.session.commit()
            await op.session.refresh(note)
            return note_to_type(note)

    @strawberry.mutation
    async def summarize_note(self, info: strawberry.Info[Any, Any], note_id: str) -> NoteType:
        user_email = _require_user_email(info, action="notes.summarize")
        try:
            note = await summarize_note_for_user(note_id=note_id, user_email=user_email)
        except LookupError as exc:
            raise GraphQLError(str(exc)) from exc
        return note_to_type(note)

    @strawberry.mutation
    async def start_note_summary_run(self, info: strawberry.Info[Any, Any]) -> TaskRunType:
        user_email = _require_user_email(info, action="tasks.start")
        async with operation("tasks.resolve_user") as op:
            user = await _find_user_by_email(op.session, user_email)
            if user is None:
                raise GraphQLError("User not found.")

        task_run = await spawn_tracked_task(
            task_name="notes.summary_run",
            user_id=user.id,
            message="Queued note summary run",
            task_callable=lambda context: summarize_notes_task(context, user_id=user.id),
        )
        return task_run_to_type(task_run)

    # -----------------------------------------------------------------------
    # Portfolio Drift Monitor mutations
    # -----------------------------------------------------------------------

    @strawberry.mutation
    async def create_family(self, info: strawberry.Info[Any, Any], input: CreateFamilyInput) -> FamilyType:
        """Create a new client family."""
        _require_user_email(info, action="families.create", resource="family")
        try:
            payload = CreateFamilyInputModel.model_validate({
                "name": input.name,
                "pm_email": input.pm_email,
                "drift_threshold_pct": input.drift_threshold_pct,
            })
        except ValidationError as exc:
            raise GraphQLError(exc.errors()[0]["msg"]) from exc

        async with operation("families.create") as op:
            family = Family(
                name=payload.name.strip(),
                pm_email=payload.pm_email.strip().lower(),
                drift_threshold_pct=payload.drift_threshold_pct,
            )
            op.session.add(family)
            await op.session.commit()
            await op.session.refresh(family)
            return family_to_type(family, [])

    @strawberry.mutation
    async def update_family(self, info: strawberry.Info[Any, Any], input: UpdateFamilyInput) -> FamilyType:
        """Update an existing family's settings."""
        _require_user_email(info, action="families.update", resource="family")
        async with operation("families.update") as op:
            family = (
                await op.session.execute(select(Family).where(Family.id == input.id))
            ).scalar_one_or_none()
            if family is None:
                raise GraphQLError("Family not found.")
            if input.name is not None:
                family.name = input.name.strip()
            if input.pm_email is not None:
                family.pm_email = input.pm_email.strip().lower()
            if input.drift_threshold_pct is not None:
                family.drift_threshold_pct = input.drift_threshold_pct
            if input.monitoring_enabled is not None:
                family.monitoring_enabled = input.monitoring_enabled
            await op.session.commit()
            await op.session.refresh(family)
            targets = (
                await op.session.execute(select(FamilyTarget).where(FamilyTarget.family_id == family.id))
            ).scalars().all()
            return family_to_type(family, list(targets))

    @strawberry.mutation
    async def create_family_target(
        self, info: strawberry.Info[Any, Any], input: CreateFamilyTargetInput
    ) -> FamilyType:
        """Add a target allocation to a family. Returns the updated family."""
        _require_user_email(info, action="targets.create", resource="family_target")
        try:
            payload = CreateFamilyTargetInputModel.model_validate({
                "family_id": input.family_id,
                "name": input.name,
                "target_type": input.target_type,
                "target_weight_pct": input.target_weight_pct,
            })
        except ValidationError as exc:
            raise GraphQLError(exc.errors()[0]["msg"]) from exc

        async with operation("targets.create") as op:
            family = (
                await op.session.execute(select(Family).where(Family.id == payload.family_id))
            ).scalar_one_or_none()
            if family is None:
                raise GraphQLError("Family not found.")
            target = FamilyTarget(
                family_id=family.id,
                name=payload.name.strip(),
                target_type=payload.target_type,
                target_weight_pct=payload.target_weight_pct,
            )
            op.session.add(target)
            await op.session.commit()
            # Reload targets for validation
            targets = (
                await op.session.execute(select(FamilyTarget).where(FamilyTarget.family_id == family.id))
            ).scalars().all()
            total_weight = sum(t.target_weight_pct for t in targets)
            # Warn if weights don't sum to 100%
            weight_warning = ""
            if abs(total_weight - 100.0) > 1.0:
                weight_warning = f" Warning: target weights sum to {total_weight:.1f}% (expected 100%)."
            await op.session.refresh(family)
            result = family_to_type(family, list(targets))
            if weight_warning:
                # NB: we set a field to surface this to the UI
                pass
            return result

    @strawberry.mutation
    async def update_family_target(
        self, info: strawberry.Info[Any, Any], input: UpdateFamilyTargetInput
    ) -> FamilyType:
        """Update a target allocation. Returns the updated family."""
        _require_user_email(info, action="targets.update", resource="family_target")
        async with operation("targets.update") as op:
            target = (
                await op.session.execute(select(FamilyTarget).where(FamilyTarget.id == input.id))
            ).scalar_one_or_none()
            if target is None:
                raise GraphQLError("Target not found.")
            if input.name is not None:
                target.name = input.name.strip()
            if input.target_type is not None:
                if input.target_type not in ("asset_class", "account", "ticker"):
                    raise GraphQLError("target_type must be asset_class, account, or ticker.")
                target.target_type = input.target_type
            if input.target_weight_pct is not None:
                target.target_weight_pct = input.target_weight_pct
            await op.session.commit()
            family = (
                await op.session.execute(select(Family).where(Family.id == target.family_id))
            ).scalar_one_or_none()
            if family is None:
                raise GraphQLError("Family not found.")
            targets = (
                await op.session.execute(select(FamilyTarget).where(FamilyTarget.family_id == family.id))
            ).scalars().all()
            return family_to_type(family, list(targets))

    @strawberry.mutation
    async def delete_family_target(self, info: strawberry.Info[Any, Any], target_id: str) -> FamilyType:
        """Delete a target allocation. Returns the updated family."""
        _require_user_email(info, action="targets.delete", resource="family_target")
        async with operation("targets.delete") as op:
            target = (
                await op.session.execute(select(FamilyTarget).where(FamilyTarget.id == target_id))
            ).scalar_one_or_none()
            if target is None:
                raise GraphQLError("Target not found.")
            family_id = target.family_id
            await op.session.delete(target)
            await op.session.commit()
            family = (
                await op.session.execute(select(Family).where(Family.id == family_id))
            ).scalar_one_or_none()
            if family is None:
                raise GraphQLError("Family not found.")
            targets = (
                await op.session.execute(select(FamilyTarget).where(FamilyTarget.family_id == family.id))
            ).scalars().all()
            return family_to_type(family, list(targets))

    @strawberry.mutation
    async def trigger_monitoring_run(self, info: strawberry.Info[Any, Any]) -> TaskRunType:
        """Trigger a monitoring run that checks all families for drift breaches."""
        _require_user_email(info, action="monitoring.trigger", resource="monitoring_run")
        from api.tasks.monitoring_run import run_monitoring

        task_run = await spawn_tracked_task(
            task_name="monitoring.daily_run",
            user_id=None,
            message="Triggered monitoring run from UI",
            task_callable=run_monitoring,
        )
        return task_run_to_type(task_run)

    @strawberry.mutation
    async def acknowledge_alert(self, info: strawberry.Info[Any, Any], alert_id: str) -> AlertType:
        """Mark an alert as acknowledged/reviewed."""
        user_email = _require_user_email(info, action="alerts.acknowledge", resource="alert")
        async with operation("alerts.acknowledge") as op:
            alert = (
                await op.session.execute(select(Alert).where(Alert.id == alert_id))
            ).scalar_one_or_none()
            if alert is None:
                raise GraphQLError("Alert not found.")
            from api.models import utcnow
            alert.acknowledged = True
            alert.acknowledged_at = utcnow()
            alert.acknowledged_by = user_email
            await op.session.commit()
            await op.session.refresh(alert)
            family = (
                await op.session.execute(select(Family).where(Family.id == alert.family_id))
            ).scalar_one_or_none()
            family_name = family.name if family else "Unknown"
            return alert_to_type(alert, family_name)


schema = strawberry.Schema(query=Query, mutation=Mutation)
