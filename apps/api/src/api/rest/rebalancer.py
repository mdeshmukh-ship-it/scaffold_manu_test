"""REST handlers for the Portfolio Rebalancer page.

Each handler proxies a BigQuery query or Yahoo Finance lookup
so the frontend never talks to GCP directly.
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


class RebalancerClientsHandler(BaseAPIHandler):
    """GET /api/rebalancer/clients — list all client family names."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        try:
            from api.services.bigquery_client import get_all_clients

            clients = await get_all_clients()
            self.write_json(200, {"clients": clients})
        except Exception as exc:
            logger.error(
                "rebalancer.clients failed",
                event_type="rebalancer.error",
                severity="ERROR",
                error_message=str(exc)[:256],
            )
            self.write_json(500, {"error": {"message": str(exc)}})


class RebalancerTargetsHandler(BaseAPIHandler):
    """GET /api/rebalancer/targets?family_name=X — existing saved targets."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        family_name = self.get_argument("family_name", "")
        if not family_name:
            self.write_json(400, {"error": {"message": "family_name is required."}})
            return
        try:
            from api.services.bigquery_client import get_existing_targets

            targets = await get_existing_targets(family_name)
            self.write_json(200, {"targets": targets})
        except Exception as exc:
            logger.error(
                "rebalancer.targets failed",
                event_type="rebalancer.error",
                severity="ERROR",
                error_message=str(exc)[:256],
            )
            self.write_json(500, {"error": {"message": str(exc)}})


class RebalancerEntitiesHandler(BaseAPIHandler):
    """GET /api/rebalancer/entities?family_name=X — entity multi-select options."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        family_name = self.get_argument("family_name", "")
        if not family_name:
            self.write_json(400, {"error": {"message": "family_name is required."}})
            return
        try:
            from api.services.bigquery_client import get_entity_options

            entities = await get_entity_options(family_name)
            self.write_json(200, {"entities": entities})
        except Exception as exc:
            logger.error(
                "rebalancer.entities failed",
                event_type="rebalancer.error",
                severity="ERROR",
                error_message=str(exc)[:256],
            )
            self.write_json(500, {"error": {"message": str(exc)}})


class RebalancerAccountsHandler(BaseAPIHandler):
    """GET /api/rebalancer/accounts?family_name=X&entities=E1,E2 — account options."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        family_name = self.get_argument("family_name", "")
        entities_csv = self.get_argument("entities", "")
        if not family_name:
            self.write_json(400, {"error": {"message": "family_name is required."}})
            return
        if not entities_csv:
            self.write_json(200, {"accounts": []})
            return

        entities = [e.strip() for e in entities_csv.split(",") if e.strip()]
        try:
            from api.services.bigquery_client import get_account_options

            accounts = await get_account_options(family_name, entities)
            self.write_json(200, {"accounts": accounts})
        except Exception as exc:
            logger.error(
                "rebalancer.accounts failed",
                event_type="rebalancer.error",
                severity="ERROR",
                error_message=str(exc)[:256],
            )
            self.write_json(500, {"error": {"message": str(exc)}})


class RebalancerDriftHandler(BaseAPIHandler):
    """POST /api/rebalancer/drift — calculate drift (BigQuery + Yahoo Finance)."""

    async def post(self) -> None:
        if not _require_auth(self):
            return
        try:
            body: dict[str, Any] = json.loads(self.request.body or b"{}")
        except json.JSONDecodeError:
            self.write_json(400, {"error": {"message": "Invalid JSON body."}})
            return

        family_name: str = body.get("family_name", "")
        portfolio_date: str = body.get("date", "")
        accounts: list[str] = body.get("accounts", [])
        tickers: list[str] = body.get("tickers", [])
        targets: list[dict[str, Any]] = body.get("targets", [])

        if not family_name or not portfolio_date:
            self.write_json(400, {"error": {"message": "family_name and date are required."}})
            return

        try:
            from api.services.bigquery_client import fetch_stock_prices, get_actual_market_values

            # 1. Actual MVs from BigQuery
            actual_data = await get_actual_market_values(family_name, accounts, tickers, portfolio_date)

            # 2. Live stock prices
            ticker_prices = await fetch_stock_prices(tickers) if tickers else {}

            # 3. Build lookup
            actual_lookup: dict[str, float] = {}
            total_mv = 0.0
            for row in actual_data:
                actual_lookup[row["Name"]] = float(row["ActualMV"]) if row["ActualMV"] is not None else 0.0
                if row["TotalMV"] is not None:
                    total_mv = float(row["TotalMV"])

            # 4. Merge with targets
            drift_rows: list[dict[str, Any]] = []
            for target in targets:
                t_name: str = target["name"]
                t_type: str = target["type"]
                t_weight: float = float(target["weight_pct"])

                actual_mv = actual_lookup.get(t_name, 0.0)
                actual_pct = (actual_mv / total_mv * 100) if total_mv > 0 else 0.0
                target_mv = (t_weight / 100.0) * total_mv
                drift_mv = actual_mv - target_mv
                drift_pct = actual_pct - t_weight

                price = 1.0
                if t_type == "Ticker":
                    price = ticker_prices.get(t_name, 0.0)

                drift_rows.append(
                    {
                        "name": t_name,
                        "type": t_type,
                        "target_pct": round(t_weight, 2),
                        "actual_mv": round(actual_mv, 2),
                        "actual_pct": round(actual_pct, 2),
                        "target_mv": round(target_mv, 2),
                        "drift_mv": round(drift_mv, 2),
                        "drift_pct": round(drift_pct, 2),
                        "price": round(price, 2),
                    }
                )

            self.write_json(
                200,
                {
                    "total_mv": round(total_mv, 2),
                    "date": portfolio_date,
                    "ticker_prices": {k: round(v, 2) for k, v in ticker_prices.items()},
                    "rows": drift_rows,
                },
            )
        except Exception as exc:
            logger.error(
                "rebalancer.drift failed",
                event_type="rebalancer.error",
                severity="ERROR",
                error_message=str(exc)[:256],
            )
            self.write_json(500, {"error": {"message": str(exc)}})


class RebalancerSaveTargetsHandler(BaseAPIHandler):
    """POST /api/rebalancer/save-targets — persist targets to BigQuery."""

    async def post(self) -> None:
        if not _require_auth(self):
            return
        try:
            body: dict[str, Any] = json.loads(self.request.body or b"{}")
        except json.JSONDecodeError:
            self.write_json(400, {"error": {"message": "Invalid JSON body."}})
            return

        family_name: str = body.get("family_name", "")
        targets: list[dict[str, Any]] = body.get("targets", [])

        if not family_name or not targets:
            self.write_json(400, {"error": {"message": "family_name and targets are required."}})
            return

        try:
            from api.services.bigquery_client import save_targets

            await save_targets(family_name, targets, self.current_user_email or "unknown")
            self.write_json(200, {"status": "saved", "count": len(targets)})
        except Exception as exc:
            logger.error(
                "rebalancer.save_targets failed",
                event_type="rebalancer.error",
                severity="ERROR",
                error_message=str(exc)[:256],
            )
            self.write_json(500, {"error": {"message": str(exc)}})
