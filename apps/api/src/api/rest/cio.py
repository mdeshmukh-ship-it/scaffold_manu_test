"""REST handlers for the CIO Dashboard.

Each handler proxies a BigQuery query so the frontend never talks to GCP directly.
Data transformations (monthly returns, risk metrics, etc.) are computed server-side.
"""

from __future__ import annotations

import json
from typing import Any

from api.logging_config import get_logger
from api.middleware import BaseAPIHandler

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
