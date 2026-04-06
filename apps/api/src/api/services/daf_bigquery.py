"""BigQuery queries for the DAF Lot Selector.

Fetches Quantinno-managed accounts and their transaction history
to identify which lots to sell for DAF funding.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from api.logging_config import get_logger
from api.services.bigquery_client import _run_query

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Caches
# ---------------------------------------------------------------------------

_quantinno_accounts_cache: list[dict[str, Any]] | None = None
_quantinno_accounts_ts: float = 0.0
_CACHE_TTL = 300  # 5 minutes


# ---------------------------------------------------------------------------
# Public query functions
# ---------------------------------------------------------------------------


async def get_quantinno_accounts() -> list[dict[str, Any]]:
    """Return all Quantinno-managed accounts (cached)."""
    global _quantinno_accounts_cache, _quantinno_accounts_ts

    now = time.time()
    if _quantinno_accounts_cache is not None and (now - _quantinno_accounts_ts) < _CACHE_TTL:
        return _quantinno_accounts_cache

    query = """
    SELECT
        AccountNumber,
        PrimaryAccountHolder,
        FBSIShortName,
        CustomShortName,
        ClientName,
        CAST(EstablishedDate AS STRING) AS EstablishedDate,
        InvestmentProgram,
        Benchmark
    FROM `perennial-data-prod.fidelity.accounts`
    WHERE CustomShortName LIKE '%Quantinno%'
    ORDER BY ClientName, AccountNumber
    """
    rows = await _run_query(query)
    _quantinno_accounts_cache = rows
    _quantinno_accounts_ts = now
    return rows


async def get_quantinno_families() -> list[str]:
    """Return distinct client family names that have Quantinno accounts."""
    accounts = await get_quantinno_accounts()
    families = sorted({a["ClientName"] for a in accounts if a.get("ClientName")})
    return families


async def get_family_accounts(family_name: str) -> list[dict[str, Any]]:
    """Return Quantinno accounts for a specific family."""
    accounts = await get_quantinno_accounts()
    return [a for a in accounts if a.get("ClientName") == family_name]


async def get_transactions(
    account_numbers: list[str],
    start_date: str,
    end_date: str,
) -> list[dict[str, Any]]:
    """Fetch transactions for given accounts within a date range."""
    from google.cloud import bigquery  # type: ignore[import-untyped]

    if not account_numbers:
        return []

    query = """
    SELECT
        CAST(Date AS STRING) AS Date,
        AccountNumber,
        KeyCode,
        TransactionType,
        TransactionCategory,
        TransactionSubcategory,
        BuySellCode,
        SecurityType,
        CUSIP,
        Description,
        Quantity,
        Amount,
        MarketValue,
        Commission,
        CAST(RunDate AS STRING) AS RunDate,
        CAST(TradeDate AS STRING) AS TradeDate,
        CAST(EntryDate AS STRING) AS EntryDate
    FROM `perennial-data-prod.fidelity.daily_transactions`
    WHERE AccountNumber IN UNNEST(@account_numbers)
      AND Date >= @start_date
      AND Date <= @end_date
    ORDER BY Date DESC, AccountNumber, Description
    """

    from datetime import datetime

    start_obj = datetime.strptime(start_date, "%Y-%m-%d").date()
    end_obj = datetime.strptime(end_date, "%Y-%m-%d").date()

    params = [
        bigquery.ArrayQueryParameter("account_numbers", "STRING", account_numbers),
        bigquery.ScalarQueryParameter("start_date", "DATE", start_obj),
        bigquery.ScalarQueryParameter("end_date", "DATE", end_obj),
    ]
    return await _run_query(query, params)


async def _discover_position_columns() -> list[str]:
    """Return column names of the daily_positions table."""
    query = """
    SELECT column_name
    FROM `perennial-data-prod.fidelity.INFORMATION_SCHEMA.COLUMNS`
    WHERE table_name = 'daily_positions'
    ORDER BY ordinal_position
    """
    try:
        rows = await _run_query(query)
        cols = [r["column_name"] for r in rows]
        logger.info("daily_positions schema", event_type="daf.schema", severity="INFO", columns=cols)
        return cols
    except Exception as exc:
        logger.warning("Schema discovery failed, falling back", event_type="daf.schema_fail", severity="WARNING", error_message=str(exc)[:256])
        return []


_position_columns_cache: list[str] | None = None


async def get_buy_transactions(
    account_numbers: list[str],
) -> list[dict[str, Any]]:
    """Build enriched open-lot data for DAF analysis.

    Step 0: discover the daily_positions schema to find the right join key.
    Then match positions with transactions and compute gain/loss.
    """
    from google.cloud import bigquery  # type: ignore[import-untyped]

    if not account_numbers:
        return []

    # ── Step 0: discover positions columns once ──
    global _position_columns_cache
    if _position_columns_cache is None:
        _position_columns_cache = await _discover_position_columns()
    pos_cols = _position_columns_cache
    has_cusip = "CUSIP" in pos_cols
    logger.info("Position schema info", event_type="daf.debug", severity="INFO", has_cusip=has_cusip, columns=pos_cols)

    params = [bigquery.ArrayQueryParameter("account_numbers", "STRING", account_numbers)]

    # ── Step 1: Get positions with current MV ──
    if has_cusip:
        pos_query = """
        WITH LatestDate AS (
          SELECT MAX(Date) AS max_date
          FROM `perennial-data-prod.fidelity.daily_positions`
          WHERE AccountNumber IN UNNEST(@account_numbers)
        )
        SELECT
          dp.AccountNumber,
          dp.CUSIP AS JoinKey,
          TRIM(dp.Symbol) AS Symbol,
          dp.Description,
          SUM(dp.PositionMarketValue) AS CurrentMV
        FROM `perennial-data-prod.fidelity.daily_positions` dp
        CROSS JOIN LatestDate ld
        WHERE dp.Date = ld.max_date
          AND dp.AccountNumber IN UNNEST(@account_numbers)
          AND dp.PositionMarketValue > 0
          AND dp.SecurityType IN ('0', '1', '2', '3', '4', '5', '6', '7', '9')
          AND TRIM(COALESCE(dp.Symbol, '')) NOT IN ('QJXAQ', 'FRGXX', 'QIWSQ', 'SPAXX', 'FDRXX', 'FCASH', 'CORE', '')
        GROUP BY dp.AccountNumber, dp.CUSIP, TRIM(dp.Symbol), dp.Description
        """
    else:
        pos_query = """
        WITH LatestDate AS (
          SELECT MAX(Date) AS max_date
          FROM `perennial-data-prod.fidelity.daily_positions`
          WHERE AccountNumber IN UNNEST(@account_numbers)
        )
        SELECT
          dp.AccountNumber,
          TRIM(dp.Symbol) AS Symbol,
          dp.Description,
          SUM(dp.PositionMarketValue) AS CurrentMV
        FROM `perennial-data-prod.fidelity.daily_positions` dp
        CROSS JOIN LatestDate ld
        WHERE dp.Date = ld.max_date
          AND dp.AccountNumber IN UNNEST(@account_numbers)
          AND dp.PositionMarketValue > 0
          AND dp.SecurityType IN ('0', '1', '2', '3', '4', '5', '6', '7', '9')
          AND TRIM(COALESCE(dp.Symbol, '')) NOT IN ('QJXAQ', 'FRGXX', 'QIWSQ', 'SPAXX', 'FDRXX', 'FCASH', 'CORE', '')
        GROUP BY dp.AccountNumber, TRIM(dp.Symbol), dp.Description
        """

    # ── Step 2: Get acquisitions (BOT + REC) ──
    acq_query = """
    SELECT
      CAST(Date AS STRING) AS Date, AccountNumber, CUSIP, Description,
      ABS(Quantity) AS Quantity, ABS(Amount) AS CostBasis,
      TransactionType,
      DATE_DIFF(CURRENT_DATE(), Date, DAY) AS HoldingDays,
      CASE WHEN DATE_DIFF(CURRENT_DATE(), Date, DAY) > 365
           THEN 'Long-Term' ELSE 'Short-Term' END AS TermLabel
    FROM `perennial-data-prod.fidelity.daily_transactions`
    WHERE AccountNumber IN UNNEST(@account_numbers)
      AND TransactionType IN ('BOT', 'REC')
      AND COALESCE(TransactionCategory, '') != 'Money Market'
      AND COALESCE(TransactionSubcategory, '') NOT LIKE '%money market%'
      AND SecurityType NOT IN ('F', 'C')
    ORDER BY AccountNumber, CUSIP, Date ASC
    """

    # ── Step 3: Get disposals (SLD + DEL) ──
    disp_query = """
    SELECT AccountNumber, CUSIP, SUM(ABS(Quantity)) AS TotalDisposed
    FROM `perennial-data-prod.fidelity.daily_transactions`
    WHERE AccountNumber IN UNNEST(@account_numbers)
      AND TransactionType IN ('SLD', 'DEL')
      AND COALESCE(TransactionCategory, '') != 'Money Market'
      AND SecurityType NOT IN ('F', 'C')
    GROUP BY AccountNumber, CUSIP
    """

    # ── Step 4: If no CUSIP in positions, build CUSIP→Symbol mapping ──
    if not has_cusip:
        # Get all distinct (AccountNumber, CUSIP) → Symbol from transactions
        # by looking at what symbol each CUSIP corresponds to in positions history
        map_query = """
        SELECT DISTINCT
          t.AccountNumber, t.CUSIP,
          TRIM(dp.Symbol) AS Symbol
        FROM `perennial-data-prod.fidelity.daily_transactions` t
        JOIN `perennial-data-prod.fidelity.daily_positions` dp
          ON t.AccountNumber = dp.AccountNumber
          AND LOWER(TRIM(
            REGEXP_REPLACE(
              SPLIT(t.Description, ' ')[SAFE_OFFSET(0)], r'[^A-Za-z0-9.]', ''
            )
          )) = LOWER(TRIM(dp.Symbol))
        WHERE t.AccountNumber IN UNNEST(@account_numbers)
          AND t.CUSIP IS NOT NULL
          AND dp.Symbol IS NOT NULL
        """
        # Simpler approach: just use Description matching
        map_query = """
        SELECT DISTINCT
          t.AccountNumber, t.CUSIP,
          dp.Symbol, dp.Description AS PosDesc
        FROM (
          SELECT AccountNumber, CUSIP,
            MIN(Description) AS TxDesc
          FROM `perennial-data-prod.fidelity.daily_transactions`
          WHERE AccountNumber IN UNNEST(@account_numbers)
            AND CUSIP IS NOT NULL
            AND TransactionType IN ('BOT', 'REC', 'SLD', 'DEL')
            AND SecurityType NOT IN ('F', 'C')
          GROUP BY AccountNumber, CUSIP
        ) t
        JOIN (
          SELECT DISTINCT AccountNumber, TRIM(Symbol) AS Symbol, Description
          FROM `perennial-data-prod.fidelity.daily_positions`
          WHERE AccountNumber IN UNNEST(@account_numbers)
            AND Symbol IS NOT NULL
            AND Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        ) dp
          ON t.AccountNumber = dp.AccountNumber
          AND t.TxDesc = dp.Description
        """
        map_rows = await _run_query(map_query, params)
        cusip_to_symbol: dict[tuple[str, str], str] = {}
        for r in map_rows:
            cusip_to_symbol[(r["AccountNumber"], r["CUSIP"])] = r["Symbol"]
        logger.info("CUSIP→Symbol mapping built", event_type="daf.debug", severity="INFO", mappings=len(cusip_to_symbol))

    positions, acquisitions, disposals = await asyncio.gather(
        _run_query(pos_query, params),
        _run_query(acq_query, params),
        _run_query(disp_query, params),
    )

    if not positions:
        return []

    # ── Build position map keyed by (Account, matching_key) ──
    pos_map: dict[tuple[str, str], dict[str, Any]] = {}
    for p in positions:
        acct = p["AccountNumber"]
        key_val = str(p.get("JoinKey") or p.get("Symbol") or "").strip()
        if key_val:
            k = (acct, key_val)
            if k not in pos_map:
                pos_map[k] = {"current_mv": float(p.get("CurrentMV", 0) or 0), "description": p.get("Description", ""), "symbol": p.get("Symbol", "")}
            else:
                pos_map[k]["current_mv"] += float(p.get("CurrentMV", 0) or 0)

    # ── Build disposal map keyed by (Account, CUSIP) ──
    disp_map: dict[tuple[str, str], float] = {}
    for d in disposals:
        disp_map[(d["AccountNumber"], d["CUSIP"])] = float(d.get("TotalDisposed", 0) or 0)

    # ── Group acquisitions by (Account, CUSIP) ──
    from collections import defaultdict
    acq_by_cusip: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for a in acquisitions:
        acq_by_cusip[(a["AccountNumber"], a["CUSIP"])].append(a)

    # ── Map acquisitions CUSIP → position key for MV lookup ──
    def _get_pos_key(acct: str, cusip: str) -> tuple[str, str] | None:
        """Find the position map key for a given (account, cusip)."""
        if has_cusip:
            k = (acct, cusip)
            return k if k in pos_map else None
        else:
            sym = cusip_to_symbol.get((acct, cusip))
            if sym:
                k = (acct, sym)
                return k if k in pos_map else None
            return None

    # ── FIFO netting + enrichment ──
    open_lots: list[dict[str, Any]] = []
    matched_pos_keys: set[tuple[str, str]] = set()

    for (acct, cusip), lots in acq_by_cusip.items():
        pos_key = _get_pos_key(acct, cusip)
        if pos_key is None:
            continue  # Security not currently held
        matched_pos_keys.add(pos_key)

        current_mv = pos_map[pos_key]["current_mv"]
        total_disposed = disp_map.get((acct, cusip), 0.0)

        surviving: list[dict[str, Any]] = []
        total_surviving_qty = 0.0
        remaining = total_disposed

        for lot in lots:
            qty = float(lot.get("Quantity", 0) or 0)
            if qty <= 0:
                continue
            if remaining >= qty:
                remaining -= qty
                continue
            elif remaining > 0:
                kept = qty - remaining
                ratio = kept / qty
                p = dict(lot)
                p["Quantity"] = round(kept, 6)
                p["CostBasis"] = round(float(lot.get("CostBasis", 0) or 0) * ratio, 2)
                surviving.append(p)
                total_surviving_qty += kept
                remaining = 0
            else:
                surviving.append(dict(lot))
                total_surviving_qty += qty

        for lot in surviving:
            qty = float(lot.get("Quantity", 0) or 0)
            cost = abs(float(lot.get("CostBasis", 0) or 0))
            lot_mv = round(current_mv * (qty / total_surviving_qty), 2) if total_surviving_qty > 0 else 0.0
            gl = round(lot_mv - cost, 2)
            pct = round((gl / cost) * 100, 2) if cost > 0 else 0.0
            term = lot.get("TermLabel", "Unknown")

            if gl > 0 and term == "Long-Term":
                cat = "DAF Gift (LT Appreciated)"
            elif gl > 0:
                cat = "Appreciated (Short-Term)"
            elif gl < 0:
                cat = "Tax-Loss Harvest"
            else:
                cat = "Neutral"

            open_lots.append({
                "Date": lot.get("Date", ""),
                "AccountNumber": acct,
                "CUSIP": cusip,
                "Description": lot.get("Description", pos_map[pos_key]["description"]),
                "Quantity": round(qty, 4),
                "CostBasis": round(cost, 2),
                "CurrentMV": lot_mv,
                "UnrealizedGL": gl,
                "GainPct": pct,
                "HoldingDays": lot.get("HoldingDays") or 0,
                "TermLabel": term,
                "Category": cat,
                "TransactionType": lot.get("TransactionType", ""),
            })

    # ── Positions with no matching acquisitions (transferred in, no tx history) ──
    for pos_key, info in pos_map.items():
        if pos_key in matched_pos_keys:
            continue
        open_lots.append({
            "Date": "N/A",
            "AccountNumber": pos_key[0],
            "CUSIP": pos_key[1],
            "Description": info["description"],
            "Quantity": 0,
            "CostBasis": 0.0,
            "CurrentMV": round(info["current_mv"], 2),
            "UnrealizedGL": round(info["current_mv"], 2),
            "GainPct": 100.0,
            "HoldingDays": 0,
            "TermLabel": "Unknown",
            "Category": "Unknown Cost Basis",
            "TransactionType": "UNKNOWN",
        })

    cat_order = {"DAF Gift (LT Appreciated)": 0, "Appreciated (Short-Term)": 1, "Neutral": 2, "Tax-Loss Harvest": 3, "Unknown Cost Basis": 4}
    open_lots.sort(key=lambda x: (cat_order.get(x.get("Category", ""), 9), -(x.get("UnrealizedGL", 0) or 0)))
    return open_lots
