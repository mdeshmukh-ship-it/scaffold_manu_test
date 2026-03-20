"""BigQuery client for Portfolio Rebalancer queries.

Mirrors the SQL queries from the Hex Rebalancer_v3_redesigned project,
adapted for the BigQuery Python client with parameterized queries.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from decimal import Decimal
from typing import Any

from api.logging_config import get_logger
from api.settings import get_settings

logger = get_logger(__name__)

_bq_client: Any = None
_bq_available: bool | None = None  # None = not yet checked


def _get_bq_client() -> Any:
    """Lazy-init a BigQuery client singleton."""
    global _bq_client, _bq_available

    if _bq_client is not None:
        return _bq_client
    if _bq_available is False:
        return None

    try:
        import json
        import os
        import tempfile

        from google.cloud import bigquery  # type: ignore[import-untyped]
        from google.oauth2 import service_account  # type: ignore[import-untyped]

        settings = get_settings()
        project = settings.gcp_project_id or None
        creds_path = settings.google_application_credentials or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
        creds_json = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON", "")

        if creds_path and os.path.isfile(creds_path):
            # Load from a file path (local dev / GCP)
            credentials = service_account.Credentials.from_service_account_file(creds_path)
            _bq_client = bigquery.Client(project=project, credentials=credentials)
            logger.info(
                "BigQuery client initialised with service account file",
                event_type="bigquery.init",
                severity="INFO",
                credentials_path=creds_path,
                project=project,
            )
        elif creds_json:
            # Load from inline JSON string (Replit Secrets / env var)
            info = json.loads(creds_json)
            credentials = service_account.Credentials.from_service_account_info(info)
            project = project or info.get("project_id")
            _bq_client = bigquery.Client(project=project, credentials=credentials)
            logger.info(
                "BigQuery client initialised with inline JSON credentials",
                event_type="bigquery.init",
                severity="INFO",
                project=project,
            )
        else:
            # Fall back to ADC (Application Default Credentials)
            _bq_client = bigquery.Client(project=project)
            logger.info(
                "BigQuery client initialised with default credentials",
                event_type="bigquery.init",
                severity="INFO",
                project=project,
            )

        _bq_available = True
        return _bq_client
    except Exception as exc:
        logger.warning(
            "BigQuery client initialisation failed",
            event_type="bigquery.init_failed",
            severity="WARNING",
            error_type=exc.__class__.__name__,
            error_message=str(exc)[:256],
        )
        _bq_available = False
        return None


def _make_serializable(value: Any) -> Any:
    """Convert BigQuery row values into JSON-safe Python types."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    try:
        import datetime as dt

        if isinstance(value, dt.date):
            return value.isoformat()
    except Exception:
        pass
    return value


def _run_query_sync(query: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
    """Execute a BigQuery SQL query synchronously (blocking)."""
    from google.cloud import bigquery  # type: ignore[import-untyped]

    client = _get_bq_client()
    if client is None:
        raise RuntimeError(
            "BigQuery is not configured. "
            "Set GOOGLE_APPLICATION_CREDENTIALS env var to a service-account JSON path."
        )

    job_config = bigquery.QueryJobConfig()
    if params:
        job_config.query_parameters = params

    result = client.query(query, job_config=job_config).result()
    return [{k: _make_serializable(v) for k, v in dict(row).items()} for row in result]


async def _run_query(query: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
    """Run a BigQuery query in a thread so we don't block the event loop."""
    return await asyncio.to_thread(_run_query_sync, query, params)


# ---------------------------------------------------------------------------
# Public query functions (each mirrors a Hex cell)
# ---------------------------------------------------------------------------


_clients_cache: list[str] | None = None
_clients_cache_ts: float = 0.0
_CLIENTS_CACHE_TTL = 600  # 10 minutes


async def get_all_clients() -> list[str]:
    """Return distinct client family names from fidelity.accounts (cached)."""
    global _clients_cache, _clients_cache_ts
    import time

    now = time.time()
    if _clients_cache is not None and (now - _clients_cache_ts) < _CLIENTS_CACHE_TTL:
        return _clients_cache

    query = """
    SELECT DISTINCT ClientName
    FROM `perennial-data-prod.fidelity.accounts`
    WHERE ClientName IS NOT NULL
    ORDER BY ClientName
    """
    rows = await _run_query(query)
    _clients_cache = [row["ClientName"] for row in rows]
    _clients_cache_ts = now
    return _clients_cache


async def get_existing_targets(family_name: str) -> list[dict[str, Any]]:
    """Return the most recent target allocations for *family_name*."""
    from google.cloud import bigquery  # type: ignore[import-untyped]

    query = """
    SELECT
        family_name,
        category,
        label,
        target_weight,
        run_by,
        CAST(load_timestamp AS STRING) AS load_timestamp
    FROM `perennial-data-prod.rebalancer.portfolio_targets`
    WHERE family_name = @family_name
      AND load_timestamp = (
          SELECT MAX(load_timestamp)
          FROM `perennial-data-prod.rebalancer.portfolio_targets`
          WHERE family_name = @family_name
      )
    ORDER BY
        CASE category
            WHEN 'Entity' THEN 1
            WHEN 'Account' THEN 2
            WHEN 'Ticker'  THEN 3
            WHEN 'Asset Class' THEN 4
        END,
        target_weight DESC
    """
    params = [bigquery.ScalarQueryParameter("family_name", "STRING", family_name)]
    return await _run_query(query, params)


async def get_entity_options(family_name: str) -> list[str]:
    """Return distinct PrimaryAccountHolder values for *family_name*."""
    from google.cloud import bigquery  # type: ignore[import-untyped]

    query = """
    SELECT DISTINCT PrimaryAccountHolder AS Entity
    FROM `perennial-data-prod.fidelity.accounts`
    WHERE ClientName = @family_name
      AND PrimaryAccountHolder IS NOT NULL
    ORDER BY PrimaryAccountHolder
    """
    params = [bigquery.ScalarQueryParameter("family_name", "STRING", family_name)]
    rows = await _run_query(query, params)
    return [row["Entity"] for row in rows]


async def get_account_options(family_name: str, entities: list[str]) -> list[dict[str, str]]:
    """Return distinct accounts for *family_name* filtered by *entities*."""
    from google.cloud import bigquery  # type: ignore[import-untyped]

    query = """
    SELECT DISTINCT
      AccountNumber,
      COALESCE(FBSIShortName, AccountNumber) AS AccountName
    FROM `perennial-data-prod.fidelity.accounts`
    WHERE ClientName = @family_name
      AND PrimaryAccountHolder IN UNNEST(@entities)
      AND AccountNumber IS NOT NULL
    ORDER BY AccountName
    """
    params = [
        bigquery.ScalarQueryParameter("family_name", "STRING", family_name),
        bigquery.ArrayQueryParameter("entities", "STRING", entities),
    ]
    return await _run_query(query, params)


async def get_actual_market_values(
    family_name: str,
    accounts: list[str],
    tickers: list[str],
    portfolio_date: str,
) -> list[dict[str, Any]]:
    """Fetch actual market values per account / ticker / asset-class."""
    from google.cloud import bigquery  # type: ignore[import-untyped]

    query = """
    WITH
    ClassifiedPositions AS (
      SELECT
        a.FBSIShortName AS Account,
        TRIM(dp.Symbol) AS Symbol,
        CASE
          WHEN TRIM(dp.Symbol) IN ('QJXAQ','FRGXX','QIWSQ') THEN 'Cash'
          WHEN TRIM(dp.Symbol) IN ('ISHUF','MUB','VTEB','NUVBX','NVHIX','PRIMX','VMLUX','AGG','CMF') THEN 'Fixed Income'
          WHEN dp.SecurityType IN ('0','1','2','9') THEN 'Equity'
          WHEN dp.SecurityType IN ('5','6','7') THEN 'Fixed Income'
          WHEN dp.SecurityType IN ('F','C') THEN 'Cash'
          ELSE 'Undefined'
        END AS SecurityType,
        dp.PositionMarketValue AS MarketValue
      FROM `perennial-data-prod.fidelity.accounts` a
      INNER JOIN `perennial-data-prod.fidelity.daily_positions` dp
        ON a.AccountNumber = dp.AccountNumber
      WHERE
        a.ClientName = @family_name
        AND dp.Date = @portfolio_date
    ),
    TickerList AS (
      SELECT TRIM(ticker) AS ticker
      FROM UNNEST(@tickers) AS ticker
      WHERE TRIM(ticker) != ''
    ),
    PortfolioTotal AS (
      SELECT SUM(MarketValue) AS TotalMV
      FROM ClassifiedPositions
    ),
    TickerMV AS (
      SELECT Symbol AS Name, 'Ticker' AS Type, SUM(MarketValue) AS ActualMV
      FROM ClassifiedPositions
      WHERE Symbol IN (SELECT ticker FROM TickerList)
      GROUP BY Symbol
    ),
    AccountMV AS (
      SELECT Account AS Name, 'Account' AS Type,
        SUM(CASE WHEN Symbol NOT IN (SELECT ticker FROM TickerList) THEN MarketValue ELSE 0 END) AS ActualMV
      FROM ClassifiedPositions
      WHERE Account IN UNNEST(@accounts)
      GROUP BY Account
    ),
    AssetClassMV AS (
      SELECT SecurityType AS Name, 'Asset Class' AS Type,
        SUM(CASE WHEN Symbol NOT IN (SELECT ticker FROM TickerList) THEN MarketValue ELSE 0 END) AS ActualMV
      FROM ClassifiedPositions
      WHERE SecurityType IN ('Cash', 'Equity', 'Fixed Income')
        AND Account NOT IN UNNEST(@accounts)
      GROUP BY SecurityType
    )

    SELECT Name, Type, ActualMV, pt.TotalMV
    FROM TickerMV CROSS JOIN PortfolioTotal pt
    UNION ALL
    SELECT Name, Type, ActualMV, pt.TotalMV
    FROM AccountMV CROSS JOIN PortfolioTotal pt
    UNION ALL
    SELECT Name, Type, ActualMV, pt.TotalMV
    FROM AssetClassMV CROSS JOIN PortfolioTotal pt
    """

    date_obj = datetime.strptime(portfolio_date, "%Y-%m-%d").date()

    params = [
        bigquery.ScalarQueryParameter("family_name", "STRING", family_name),
        bigquery.ArrayQueryParameter("accounts", "STRING", accounts),
        bigquery.ArrayQueryParameter("tickers", "STRING", tickers),
        bigquery.ScalarQueryParameter("portfolio_date", "DATE", date_obj),
    ]
    return await _run_query(query, params)


# ---------------------------------------------------------------------------
# Yahoo Finance price lookup (via httpx — avoids curl_cffi SSL issues)
# ---------------------------------------------------------------------------

_YF_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
_YF_HEADERS = {"User-Agent": "Mozilla/5.0"}


def _fetch_single_price_sync(ticker: str) -> float:
    """Fetch the current price for a single ticker from Yahoo Finance."""
    import httpx

    clean = (ticker or "").strip().upper()
    if not clean:
        return 0.0
    try:
        url = _YF_CHART_URL.format(ticker=clean)
        resp = httpx.get(url, headers=_YF_HEADERS, params={"interval": "1d", "range": "1d"}, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        meta = data.get("chart", {}).get("result", [{}])[0].get("meta", {})
        price = meta.get("regularMarketPrice", 0.0)
        logger.info(
            "Yahoo Finance price fetched",
            event_type="yfinance.price",
            severity="INFO",
            ticker=clean,
            price=price,
        )
        return float(price) if price else 0.0
    except Exception as exc:
        logger.warning(
            "Yahoo Finance price fetch failed",
            event_type="yfinance.error",
            severity="WARNING",
            ticker=clean,
            error_message=str(exc)[:256],
        )
        return 0.0


def _fetch_stock_prices_sync(tickers: list[str]) -> dict[str, float]:
    """Fetch current prices from Yahoo Finance for multiple tickers."""
    prices: dict[str, float] = {}
    for ticker in tickers:
        clean = (ticker or "").strip().upper()
        if not clean:
            continue
        prices[clean] = _fetch_single_price_sync(clean)
    return prices


async def fetch_stock_prices(tickers: list[str]) -> dict[str, float]:
    """Async wrapper around Yahoo Finance price lookup."""
    return await asyncio.to_thread(_fetch_stock_prices_sync, tickers)


# ---------------------------------------------------------------------------
# Save targets back to BigQuery
# ---------------------------------------------------------------------------


async def save_targets(
    family_name: str,
    targets: list[dict[str, Any]],
    run_by: str,
) -> bool:
    """Insert target rows into ``rebalancer.portfolio_targets``."""
    client = _get_bq_client()
    if client is None:
        raise RuntimeError("BigQuery is not configured.")

    now = datetime.utcnow().isoformat()
    rows = [
        {
            "family_name": family_name,
            "category": t["category"],
            "label": t["label"],
            "target_weight": float(t["target_weight"]),
            "run_by": run_by,
            "load_timestamp": now,
        }
        for t in targets
    ]

    table_id = "perennial-data-prod.rebalancer.portfolio_targets"

    def _insert() -> None:
        errors = client.insert_rows_json(table_id, rows)
        if errors:
            raise RuntimeError(f"BigQuery insert errors: {errors}")

    await asyncio.to_thread(_insert)
    return True
