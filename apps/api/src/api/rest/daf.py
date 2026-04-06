"""REST handlers for the DAF Lot Selector.

Each handler proxies a BigQuery query so the frontend never talks to GCP directly.
"""

from __future__ import annotations

from api.logging_config import get_logger
from api.middleware import BaseAPIHandler

logger = get_logger(__name__)


def _require_auth(handler: BaseAPIHandler) -> bool:
    """Return True if authenticated, else write 401 and return False."""
    if handler.current_user_email:
        return True
    handler.write_json(401, {"error": {"message": "Authentication required."}})
    return False


class DAFFamiliesHandler(BaseAPIHandler):
    """GET /api/daf/families — list all Quantinno client families."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        try:
            from api.services.daf_bigquery import get_quantinno_families

            families = await get_quantinno_families()
            self.write_json(200, {"families": families})
        except Exception as exc:
            logger.error("daf.families failed", event_type="daf.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class DAFAccountsHandler(BaseAPIHandler):
    """GET /api/daf/accounts?family=X — Quantinno accounts for a family."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        family = self.get_argument("family", "")
        if not family:
            self.write_json(400, {"error": {"message": "family is required."}})
            return
        try:
            from api.services.daf_bigquery import get_family_accounts

            accounts = await get_family_accounts(family)
            self.write_json(200, {"accounts": accounts})
        except Exception as exc:
            logger.error("daf.accounts failed", event_type="daf.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class DAFTransactionsHandler(BaseAPIHandler):
    """GET /api/daf/transactions?accounts=A1,A2&start_date=...&end_date=... — transactions."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        accounts_csv = self.get_argument("accounts", "")
        start_date = self.get_argument("start_date", "")
        end_date = self.get_argument("end_date", "")

        if not accounts_csv or not start_date or not end_date:
            self.write_json(400, {"error": {"message": "accounts, start_date, and end_date are required."}})
            return

        account_numbers = [a.strip() for a in accounts_csv.split(",") if a.strip()]
        try:
            from api.services.daf_bigquery import get_transactions

            rows = await get_transactions(account_numbers, start_date, end_date)

            # Compute summary stats
            total = len(rows)
            net_amount = sum(float(r.get("Amount", 0) or 0) for r in rows)
            buys = sum(1 for r in rows if r.get("TransactionType") == "BOT")
            sells = sum(1 for r in rows if r.get("TransactionType") == "SLD")

            self.write_json(200, {
                "rows": rows,
                "count": total,
                "net_amount": round(net_amount, 2),
                "buy_count": buys,
                "sell_count": sells,
            })
        except Exception as exc:
            logger.error("daf.transactions failed", event_type="daf.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})


class DAFLotsHandler(BaseAPIHandler):
    """GET /api/daf/lots?accounts=A1,A2 — enriched lot analysis for DAF."""

    async def get(self) -> None:
        if not _require_auth(self):
            return
        accounts_csv = self.get_argument("accounts", "")
        if not accounts_csv:
            self.write_json(400, {"error": {"message": "accounts is required."}})
            return

        account_numbers = [a.strip() for a in accounts_csv.split(",") if a.strip()]
        try:
            from api.services.daf_bigquery import get_buy_transactions

            rows = await get_buy_transactions(account_numbers)

            # Summary stats
            total_cost = sum(float(r.get("CostBasis", 0) or 0) for r in rows)
            total_current_mv = sum(float(r.get("CurrentMV", 0) or 0) for r in rows)
            total_unrealized_gl = sum(float(r.get("UnrealizedGL", 0) or 0) for r in rows)
            total_gains = sum(float(r.get("UnrealizedGL", 0) or 0) for r in rows if (r.get("UnrealizedGL", 0) or 0) > 0)
            total_losses = sum(float(r.get("UnrealizedGL", 0) or 0) for r in rows if (r.get("UnrealizedGL", 0) or 0) < 0)
            daf_candidates = sum(1 for r in rows if r.get("Category", "").startswith("DAF"))
            tlh_candidates = sum(1 for r in rows if r.get("Category") == "Tax-Loss Harvest")
            unique_securities = len({r.get("CUSIP") for r in rows if r.get("CUSIP")})

            self.write_json(200, {
                "rows": rows,
                "count": len(rows),
                "total_cost_basis": round(total_cost, 2),
                "total_current_mv": round(total_current_mv, 2),
                "total_unrealized_gl": round(total_unrealized_gl, 2),
                "total_gains": round(total_gains, 2),
                "total_losses": round(total_losses, 2),
                "daf_candidates": daf_candidates,
                "tlh_candidates": tlh_candidates,
                "unique_securities": unique_securities,
            })
        except Exception as exc:
            logger.error("daf.lots failed", event_type="daf.error", severity="ERROR", error_message=str(exc)[:256])
            self.write_json(500, {"error": {"message": str(exc)}})
