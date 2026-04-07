"""REST handlers for the CIO Dashboard.

Each handler proxies a BigQuery query so the frontend never talks to GCP directly.
Data transformations (monthly returns, risk metrics, etc.) are computed server-side.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import delete, select

from api.db import operation
from api.logging_config import get_logger
from api.middleware import BaseAPIHandler
from api.models import BalanceSheetEntry

logger = get_logger(__name__)


def _require_auth(handler: BaseAPIHandler) -> bool:
    """Return True if authenticated, else write 401 and return False."""
    if handler.current_user_email:
        return True
    handler.write_json(401, {"error": {"message": "Authentication required."}})
    return False


class CIOClientsHandler(BaseAPIHandler):
    """GET /api/cio/clients — list all client family names."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        try:
            from api.services.bigquery_client import get_all_clients

            clients = await get_all_clients()
            self.write_json(200, {"clients": clients})
        except Exception as exc:
            logger.error("cio.clients failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIOEntitiesHandler(BaseAPIHandler):
    """GET /api/cio/entities?client_name=X — entity options for a client."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        client_name = self.get_argument("client_name", "")
        if not client_name:
            self.write_json(400, {"error": {"message": "client_name is required."}})
            return
        try:
            from api.services.cio_bigquery import get_entity_options

            entities = await get_entity_options(client_name)
            self.write_json(200, {"entities": entities})
        except Exception as exc:
            logger.error("cio.entities failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIOAccountsHandler(BaseAPIHandler):
    """GET /api/cio/accounts?client_name=X&entities=E1,E2 — account options."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        client_name = self.get_argument("client_name", "")
        entities_csv = self.get_argument("entities", "")
        if not client_name:
            self.write_json(400, {"error": {"message": "client_name is required."}})
            return
        if not entities_csv:
            self.write_json(200, {"accounts": []})
            return
        entities = [e.strip() for e in entities_csv.split(",") if e.strip()]
        try:
            from api.services.cio_bigquery import get_account_options

            accounts = await get_account_options(client_name, entities)
            self.write_json(200, {"accounts": accounts})
        except Exception as exc:
            logger.error("cio.accounts failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIOMarketValuesHandler(BaseAPIHandler):
    """GET /api/cio/market-values?report_date=YYYY-MM-DD&accounts=A1,A2 — account MVs."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        report_date = self.get_argument("report_date", "")
        accounts_csv = self.get_argument("accounts", "")
        if not report_date:
            self.write_json(400, {"error": {"message": "report_date is required."}})
            return

        accounts = [a.strip() for a in accounts_csv.split(",") if a.strip()] if accounts_csv else None
        try:
            from api.services.cio_bigquery import get_account_market_values

            rows = await get_account_market_values(report_date, accounts)
            total_mv = sum(float(r.get("MarketValue", 0) or 0) for r in rows)
            self.write_json(200, {"rows": rows, "total_mv": round(total_mv, 2), "count": len(rows)})
        except Exception as exc:
            logger.error("cio.market_values failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIODailyPnlHandler(BaseAPIHandler):
    """GET /api/cio/daily-pnl?report_date=YYYY-MM-DD&accounts=A1,A2 — daily MV data."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        report_date = self.get_argument("report_date", "")
        accounts_csv = self.get_argument("accounts", "")
        if not report_date:
            self.write_json(400, {"error": {"message": "report_date is required."}})
            return

        accounts = [a.strip() for a in accounts_csv.split(",") if a.strip()] if accounts_csv else None
        try:
            from api.services.cio_bigquery import get_daily_pnl_data

            rows = await get_daily_pnl_data(report_date, accounts)
            self.write_json(200, {"rows": rows, "count": len(rows)})
        except Exception as exc:
            logger.error("cio.daily_pnl failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIOTwrorHandler(BaseAPIHandler):
    """GET /api/cio/twror?accounts=A1,A2 — TWROR data."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        accounts_csv = self.get_argument("accounts", "")
        accounts = [a.strip() for a in accounts_csv.split(",") if a.strip()] if accounts_csv else None
        try:
            from api.services.cio_bigquery import get_twror_data

            rows = await get_twror_data(accounts)
            self.write_json(200, {"rows": rows, "count": len(rows)})
        except Exception as exc:
            logger.error("cio.twror failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIOMonthlyReturnsHandler(BaseAPIHandler):
    """GET /api/cio/monthly-returns?report_date=...&accounts=... — computed monthly returns."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        report_date = self.get_argument("report_date", "")
        accounts_csv = self.get_argument("accounts", "")
        if not report_date:
            self.write_json(400, {"error": {"message": "report_date is required."}})
            return

        accounts = [a.strip() for a in accounts_csv.split(",") if a.strip()] if accounts_csv else None
        try:
            from api.services.cio_bigquery import compute_monthly_returns, get_daily_pnl_data

            daily = await get_daily_pnl_data(report_date, accounts)
            monthly = compute_monthly_returns(daily)
            self.write_json(200, {"months": monthly})
        except Exception as exc:
            logger.error("cio.monthly_returns failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIORiskMetricsHandler(BaseAPIHandler):
    """GET /api/cio/risk-metrics?report_date=...&accounts=... — risk analytics."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        report_date = self.get_argument("report_date", "")
        accounts_csv = self.get_argument("accounts", "")
        if not report_date:
            self.write_json(400, {"error": {"message": "report_date is required."}})
            return

        accounts = [a.strip() for a in accounts_csv.split(",") if a.strip()] if accounts_csv else None
        try:
            from api.services.cio_bigquery import compute_risk_metrics, get_daily_pnl_data

            daily = await get_daily_pnl_data(report_date, accounts)
            metrics = compute_risk_metrics(daily)
            self.write_json(200, {"metrics": metrics})
        except Exception as exc:
            logger.error("cio.risk_metrics failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIOCumulativeReturnsHandler(BaseAPIHandler):
    """GET /api/cio/cumulative-returns?report_date=...&accounts=... — cumulative returns."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        report_date = self.get_argument("report_date", "")
        accounts_csv = self.get_argument("accounts", "")
        if not report_date:
            self.write_json(400, {"error": {"message": "report_date is required."}})
            return

        accounts = [a.strip() for a in accounts_csv.split(",") if a.strip()] if accounts_csv else None
        try:
            from api.services.cio_bigquery import compute_cumulative_returns, get_daily_pnl_data

            daily = await get_daily_pnl_data(report_date, accounts)
            cumulative = compute_cumulative_returns(daily)
            self.write_json(200, {"series": cumulative})
        except Exception as exc:
            logger.error("cio.cumulative failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIORollingMetricsHandler(BaseAPIHandler):
    """GET /api/cio/rolling-metrics?report_date=...&accounts=... — 365-day rolling return/vol."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        report_date = self.get_argument("report_date", "")
        accounts_csv = self.get_argument("accounts", "")
        if not report_date:
            self.write_json(400, {"error": {"message": "report_date is required."}})
            return

        accounts = [a.strip() for a in accounts_csv.split(",") if a.strip()] if accounts_csv else None
        try:
            from api.services.cio_bigquery import compute_rolling_metrics, get_daily_pnl_data

            daily = await get_daily_pnl_data(report_date, accounts)
            rolling = compute_rolling_metrics(daily)
            self.write_json(200, {"series": rolling})
        except Exception as exc:
            logger.error("cio.rolling failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIOPeriodVolHandler(BaseAPIHandler):
    """GET /api/cio/period-vol?report_date=...&accounts=... — period volatilities."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        report_date = self.get_argument("report_date", "")
        accounts_csv = self.get_argument("accounts", "")
        if not report_date:
            self.write_json(400, {"error": {"message": "report_date is required."}})
            return

        accounts = [a.strip() for a in accounts_csv.split(",") if a.strip()] if accounts_csv else None
        try:
            from api.services.cio_bigquery import compute_period_vol, get_daily_pnl_data

            daily = await get_daily_pnl_data(report_date, accounts)
            vol = compute_period_vol(daily)
            self.write_json(200, {"vol": vol})
        except Exception as exc:
            logger.error("cio.period_vol failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIOAccountSummaryHandler(BaseAPIHandler):
    """GET /api/cio/account-summary?report_date=...&client_name=...&accounts=... — QTD + YTD account summary."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        report_date = self.get_argument("report_date", "")
        client_name = self.get_argument("client_name", "")
        accounts_csv = self.get_argument("accounts", "")
        if not report_date or not client_name:
            self.write_json(400, {"error": {"message": "report_date and client_name are required."}})
            return

        accounts = [a.strip() for a in accounts_csv.split(",") if a.strip()] if accounts_csv else None
        try:
            import asyncio
            from api.services.cio_bigquery import get_account_summary

            # Fetch QTD and YTD in parallel
            qtd_rows, ytd_rows = await asyncio.gather(
                get_account_summary(report_date, client_name, accounts, period="QTD"),
                get_account_summary(report_date, client_name, accounts, period="YTD"),
            )

            def _totals(rows: list) -> dict:
                return {
                    "beginning_value": sum(float(r.get("beginning_value", 0) or 0) for r in rows),
                    "ending_value": sum(float(r.get("ending_value", 0) or 0) for r in rows),
                    "net_contributions_withdrawals": sum(float(r.get("net_contributions_withdrawals", 0) or 0) for r in rows),
                    "investment_earnings": sum(float(r.get("investment_earnings", 0) or 0) for r in rows),
                }

            self.write_json(200, {
                "funds": qtd_rows,
                "totals": _totals(qtd_rows),
                "ytd_funds": ytd_rows,
                "ytd_totals": _totals(ytd_rows),
            })
        except Exception as exc:
            logger.error("cio.account_summary failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIOAssetClassHandler(BaseAPIHandler):
    """GET /api/cio/asset-class?report_date=...&accounts=... — asset class breakdown."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        report_date = self.get_argument("report_date", "")
        accounts_csv = self.get_argument("accounts", "")
        if not report_date:
            self.write_json(400, {"error": {"message": "report_date is required."}})
            return

        accounts = [a.strip() for a in accounts_csv.split(",") if a.strip()] if accounts_csv else None
        try:
            from api.services.cio_bigquery import get_asset_class_breakdown

            rows = await get_asset_class_breakdown(report_date, accounts)
            self.write_json(200, {"rows": rows})
        except Exception as exc:
            logger.error("cio.asset_class failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIORaFundHoldingsHandler(BaseAPIHandler):
    """GET /api/cio/ra-fund-holdings?report_date=...&client_name=... — private fund holdings."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        report_date = self.get_argument("report_date", "")
        client_name = self.get_argument("client_name", "")
        if not report_date:
            self.write_json(400, {"error": {"message": "report_date is required."}})
            return
        try:
            from api.services.cio_bigquery import get_ra_fund_holdings

            rows = await get_ra_fund_holdings(report_date, client_name or None)
            self.write_json(200, {"rows": rows, "count": len(rows)})
        except Exception as exc:
            logger.error("cio.ra_fund_holdings failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIOCapitalCallsTimelineHandler(BaseAPIHandler):
    """GET /api/cio/capital-calls-timeline?report_date=...&client_name=... — capital call & distribution timeline."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        report_date = self.get_argument("report_date", "")
        client_name = self.get_argument("client_name", "")
        if not report_date:
            self.write_json(400, {"error": {"message": "report_date is required."}})
            return
        try:
            from api.services.cio_bigquery import get_capital_calls_timeline

            rows = await get_capital_calls_timeline(report_date, client_name or None)
            self.write_json(200, {"rows": rows, "count": len(rows)})
        except Exception as exc:
            logger.error("cio.capital_calls_timeline failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIOCashFlowForecastHandler(BaseAPIHandler):
    """GET /api/cio/cash-flow-forecast — cash flow & liquidity forecasting."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        report_date = self.get_argument("report_date", "")
        client_name = self.get_argument("client_name", "")
        accounts_csv = self.get_argument("accounts", "")
        if not report_date or not client_name:
            self.write_json(400, {"error": {"message": "report_date and client_name are required."}})
            return

        accounts = [a.strip() for a in accounts_csv.split(",") if a.strip()] if accounts_csv else None
        try:
            from api.services.cio_bigquery import (
                compute_liquidity_forecast,
                get_account_market_values,
                get_capital_call_pacing,
                get_cash_positions,
                get_historical_monthly_flows,
                get_unfunded_commitments,
            )

            # Fetch each data source independently so one failure doesn't break the tab
            cash_data: dict[str, Any] = {"cash_balance": 0.0}
            flows: list[dict[str, Any]] = []
            unfunded: list[dict[str, Any]] = []
            pacing: list[dict[str, Any]] = []
            mv_rows: list[dict[str, Any]] = []
            warnings: list[str] = []

            try:
                cash_data = await get_cash_positions(report_date, accounts)
            except Exception as e:
                warnings.append(f"Cash positions unavailable: {str(e)[:120]}")
                logger.warning("cash_positions query failed", event_type="cio.warn", severity="WARNING", error_message=str(e)[:256])

            try:
                flows = await get_historical_monthly_flows(report_date, accounts)
            except Exception as e:
                warnings.append(f"Historical flows unavailable: {str(e)[:120]}")
                logger.warning("historical_flows query failed", event_type="cio.warn", severity="WARNING", error_message=str(e)[:256])

            try:
                unfunded = await get_unfunded_commitments(report_date, client_name)
            except Exception as e:
                warnings.append(f"Unfunded commitments unavailable: {str(e)[:120]}")
                logger.warning("unfunded_commitments query failed", event_type="cio.warn", severity="WARNING", error_message=str(e)[:256])

            try:
                pacing = await get_capital_call_pacing(report_date, client_name)
            except Exception as e:
                warnings.append(f"Capital call pacing unavailable: {str(e)[:120]}")
                logger.warning("capital_call_pacing query failed", event_type="cio.warn", severity="WARNING", error_message=str(e)[:256])

            try:
                mv_rows = await get_account_market_values(report_date, accounts)
            except Exception as e:
                warnings.append(f"Market values unavailable: {str(e)[:120]}")
                logger.warning("market_values query failed", event_type="cio.warn", severity="WARNING", error_message=str(e)[:256])

            total_mv = sum(float(r.get("MarketValue", 0) or 0) for r in mv_rows)

            forecast = compute_liquidity_forecast(
                cash_balance=cash_data["cash_balance"],
                monthly_flows=flows,
                unfunded=unfunded,
                capital_call_pacing=pacing,
                total_portfolio_mv=total_mv,
            )
            # Add cash breakdown (pure cash vs short-term bonds)
            forecast["cash_only"] = round(cash_data.get("cash_only", cash_data["cash_balance"]), 2)
            forecast["short_term_bonds"] = round(cash_data.get("short_term_bonds", 0), 2)
            forecast["historical_flows"] = [
                {
                    "month": f.get("month", ""),
                    "deposits": round(float(f.get("deposits", 0) or 0), 2),
                    "withdrawals": round(float(f.get("withdrawals", 0) or 0), 2),
                    "net_flow": round(float(f.get("net_flow", 0) or 0), 2),
                }
                for f in flows
            ]
            if warnings:
                forecast["warnings"] = warnings
            self.write_json(200, forecast)
        except Exception as exc:
            logger.error("cio.cash_flow_forecast failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIOTopPositionsHandler(BaseAPIHandler):
    """GET /api/cio/top-positions?report_date=...&accounts=... — top holdings."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        report_date = self.get_argument("report_date", "")
        accounts_csv = self.get_argument("accounts", "")
        if not report_date:
            self.write_json(400, {"error": {"message": "report_date is required."}})
            return
        accounts = [a.strip() for a in accounts_csv.split(",") if a.strip()] if accounts_csv else None
        try:
            from api.services.cio_bigquery import get_top_positions
            rows = await get_top_positions(report_date, accounts)
            self.write_json(200, {"rows": rows, "count": len(rows)})
        except Exception as exc:
            logger.error("cio.top_positions failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIORecentTransactionsHandler(BaseAPIHandler):
    """GET /api/cio/recent-transactions?report_date=...&accounts=... — QTD transactions."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        report_date = self.get_argument("report_date", "")
        accounts_csv = self.get_argument("accounts", "")
        if not report_date:
            self.write_json(400, {"error": {"message": "report_date is required."}})
            return
        accounts = [a.strip() for a in accounts_csv.split(",") if a.strip()] if accounts_csv else None
        try:
            from api.services.cio_bigquery import get_recent_transactions
            rows = await get_recent_transactions(report_date, accounts)
            self.write_json(200, {"rows": rows, "count": len(rows)})
        except Exception as exc:
            logger.error("cio.recent_transactions failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIOBalanceSheetHandler(BaseAPIHandler):
    """GET /api/cio/balance-sheet — consolidated balance sheet."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        report_date = self.get_argument("report_date", "")
        client_name = self.get_argument("client_name", "")
        accounts_csv = self.get_argument("accounts", "")
        if not report_date or not client_name:
            self.write_json(400, {"error": {"message": "report_date and client_name are required."}})
            return

        accounts = [a.strip() for a in accounts_csv.split(",") if a.strip()] if accounts_csv else None
        try:
            from api.services.cio_bigquery import get_balance_sheet_data

            bs_data = await get_balance_sheet_data(report_date, client_name, accounts)

            # Fetch manual entries from SQLite
            async with operation("cio.balance_sheet_manual") as op:
                rows = (await op.session.execute(
                    select(BalanceSheetEntry).where(BalanceSheetEntry.client_name == client_name)
                )).scalars().all()

            manual_assets = []
            manual_liabilities = []
            for row in rows:
                entry = {
                    "id": row.id,
                    "category": row.category,
                    "description": row.description,
                    "value": row.value,
                    "as_of_date": row.as_of_date,
                    "notes": row.notes,
                }
                if row.entry_type == "asset":
                    manual_assets.append(entry)
                else:
                    manual_liabilities.append(entry)

            manual_assets_total = sum(a["value"] for a in manual_assets)
            manual_liabilities_total = sum(el["value"] for el in manual_liabilities)

            bs_data["manual_assets"] = manual_assets
            bs_data["manual_assets_total"] = round(manual_assets_total, 2)
            bs_data["manual_liabilities"] = manual_liabilities
            bs_data["manual_liabilities_total"] = round(manual_liabilities_total, 2)
            bs_data["total_assets"] = round(
                bs_data["financial_total"] + manual_assets_total, 2
            )
            bs_data["total_liabilities"] = round(manual_liabilities_total, 2)
            bs_data["net_worth"] = round(
                bs_data["financial_total"] + manual_assets_total - manual_liabilities_total, 2
            )

            self.write_json(200, bs_data)
        except Exception as exc:
            logger.error("cio.balance_sheet failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIOBalanceSheetManualHandler(BaseAPIHandler):
    """POST/DELETE /api/cio/balance-sheet/manual — manage manual balance sheet entries."""

    async def post(self) -> None:
        if not _require_auth(self):
            return
        try:
            body = json.loads(self.request.body.decode("utf-8")) if self.request.body else {}
        except json.JSONDecodeError:
            self.write_json(400, {"error": {"message": "Body must be valid JSON."}})
            return

        client_name = body.get("client_name", "")
        entry_type = body.get("entry_type", "")
        category = body.get("category", "")
        description = body.get("description", "")
        value = body.get("value", 0)
        as_of_date = body.get("as_of_date", "")
        notes = body.get("notes", "")

        if not all([client_name, entry_type, category, description, as_of_date]):
            self.write_json(400, {"error": {"message": "client_name, entry_type, category, description, and as_of_date are required."}})
            return
        if entry_type not in ("asset", "liability"):
            self.write_json(400, {"error": {"message": "entry_type must be 'asset' or 'liability'."}})
            return

        try:
            async with operation("cio.balance_sheet_manual_create") as op:
                entry = BalanceSheetEntry(
                    client_name=client_name,
                    entry_type=entry_type,
                    category=category,
                    description=description,
                    value=float(value),
                    as_of_date=as_of_date,
                    notes=notes or None,
                    created_by=self.current_user_email or "unknown",
                )
                op.session.add(entry)
                await op.session.commit()
                self.write_json(201, {"ok": True, "id": entry.id})
        except Exception as exc:
            logger.error("cio.balance_sheet_manual_create failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})

    async def delete(self) -> None:
        if not _require_auth(self):
            return
        entry_id = self.get_argument("id", "")
        if not entry_id:
            self.write_json(400, {"error": {"message": "id is required."}})
            return
        try:
            async with operation("cio.balance_sheet_manual_delete") as op:
                await op.session.execute(
                    delete(BalanceSheetEntry).where(BalanceSheetEntry.id == entry_id)
                )
                await op.session.commit()
            self.write_json(200, {"ok": True})
        except Exception as exc:
            logger.error("cio.balance_sheet_manual_delete failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIOPrivateFundTypesHandler(BaseAPIHandler):
    """GET /api/cio/private-fund-types?client_name=X — which fund types a family is invested in."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        client_name = self.get_argument("client_name", "")
        if not client_name:
            self.write_json(400, {"error": {"message": "client_name is required."}})
            return
        try:
            from api.services.cio_bigquery import get_private_fund_types

            fund_types = await get_private_fund_types(client_name)
            self.write_json(200, {"fund_types": fund_types})
        except Exception as exc:
            logger.error("cio.private_fund_types failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIOPrivateFundDetailHandler(BaseAPIHandler):
    """GET /api/cio/private-fund-detail?report_date=...&client_name=...&fund_type=VC|DI|RA — fund detail."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        report_date = self.get_argument("report_date", "")
        client_name = self.get_argument("client_name", "")
        fund_type = self.get_argument("fund_type", "").upper()
        if not report_date or not client_name or not fund_type:
            self.write_json(400, {"error": {"message": "report_date, client_name, and fund_type are required."}})
            return
        if fund_type not in ("VC", "DI", "RA"):
            self.write_json(400, {"error": {"message": "fund_type must be VC, DI, or RA."}})
            return
        try:
            if fund_type == "VC":
                from api.services.cio_bigquery import get_private_fund_vc_detail
                result = await get_private_fund_vc_detail(report_date, client_name)
            elif fund_type == "DI":
                from api.services.cio_bigquery import get_private_fund_di_detail
                result = await get_private_fund_di_detail(report_date, client_name)
            else:
                from api.services.cio_bigquery import get_private_fund_ra_detail
                result = await get_private_fund_ra_detail(report_date, client_name)
            self.write_json(200, result)
        except Exception as exc:
            logger.error("cio.private_fund_detail failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class CIOAgentChatHandler(BaseAPIHandler):
    """POST /api/cio/agent/chat — AI agent for portfolio Q&A."""

    async def post(self) -> None:
        if not _require_auth(self):
            return
        try:
            body = json.loads(self.request.body.decode("utf-8")) if self.request.body else {}
        except json.JSONDecodeError:
            self.write_json(400, {"error": {"message": "Body must be valid JSON."}})
            return

        message = body.get("message", "").strip()
        report_date = body.get("report_date", "")
        client_name = body.get("client_name", "")
        accounts_raw = body.get("accounts", [])
        context_data = body.get("context_data", None)
        images_raw = body.get("images", [])
        history = body.get("history", [])

        if not message:
            self.write_json(400, {"error": {"message": "message is required."}})
            return
        if not report_date or not client_name:
            self.write_json(400, {"error": {"message": "report_date and client_name are required."}})
            return

        accounts = [a.strip() for a in accounts_raw if a.strip()] if accounts_raw else None

        # Parse image attachments (base64)
        images = None
        if images_raw and isinstance(images_raw, list):
            images = [
                {"data": img.get("data", ""), "media_type": img.get("media_type", "image/png")}
                for img in images_raw[:3]
                if isinstance(img, dict) and img.get("data")
            ]
            if not images:
                images = None

        try:
            from api.services.agent import run_agent

            result = await run_agent(
                user_message=message,
                report_date=report_date,
                client_name=client_name,
                accounts=accounts,
                context_data=context_data,
                images=images,
                conversation_history=history,
            )
            self.write_json(200, result)
        except Exception as exc:
            logger.error("cio.agent_chat failed", event_type="cio.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})
