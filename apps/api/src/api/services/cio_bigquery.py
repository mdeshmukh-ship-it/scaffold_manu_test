"""BigQuery client for CIO Dashboard queries.

Mirrors the SQL queries from the Hex CIO Client Reporting project,
adapted for the BigQuery Python client with parameterised queries.

IMPORTANT: All return calculations use the DailyPnL column so that
cash-flow transfers are excluded from performance numbers.
    daily_return = DailyPnL / (MarketValue - DailyPnL)
"""

from __future__ import annotations

import asyncio
import math
from collections import defaultdict
from datetime import date, datetime
from typing import Any

from api.logging_config import get_logger
from api.services.bigquery_client import _get_bq_client, _make_serializable, _run_query

logger = get_logger(__name__)


# ======================================================================
# Helpers
# ======================================================================

def _daily_returns_from_pnl(daily_data: list[dict[str, Any]]) -> tuple[list[str], list[float]]:
    """Build a sorted (dates, returns) pair using DailyPnL / BOD-MV.

    Returns exclude transfers because DailyPnL only captures real P&L.
    Falls back to MV-change with clipping when DailyPnL is not available.
    """
    # Aggregate per date across all accounts
    date_mv: dict[str, float] = defaultdict(float)
    date_pnl: dict[str, float] = defaultdict(float)
    has_pnl = False

    for row in daily_data:
        d = str(row.get("Date", ""))[:10]
        mv = float(row.get("MarketValue", 0) or 0)
        pnl = float(row.get("DailyPnL", 0) or 0)
        date_mv[d] += mv
        date_pnl[d] += pnl
        if pnl != 0:
            has_pnl = True

    sorted_dates = sorted(date_mv.keys())
    if len(sorted_dates) < 2:
        return [], []

    daily_returns: list[float] = []

    if has_pnl:
        # PnL-based return: ret = PnL_today / (MV_today - PnL_today)
        for d in sorted_dates:
            pnl = date_pnl[d]
            mv = date_mv[d]
            bod_mv = mv - pnl  # beginning-of-day MV
            if bod_mv > 0:
                ret = pnl / bod_mv
            else:
                ret = 0.0
            daily_returns.append(ret)
        # First date has no meaningful return; remove it
        sorted_dates = sorted_dates[1:]
        daily_returns = daily_returns[1:]
    else:
        # Fallback: MV change with clipping
        for i in range(1, len(sorted_dates)):
            prev_mv = date_mv[sorted_dates[i - 1]]
            curr_mv = date_mv[sorted_dates[i]]
            if prev_mv > 0:
                ret = (curr_mv - prev_mv) / prev_mv
                ret = max(-0.15, min(0.15, ret))
            else:
                ret = 0.0
            daily_returns.append(ret)
        sorted_dates = sorted_dates[1:]

    return sorted_dates, daily_returns


# ======================================================================
# 1. Account Market Values
# ======================================================================

async def get_account_market_values(
    report_date: str,
    accounts: list[str] | None = None,
) -> list[dict[str, Any]]:
    from google.cloud import bigquery  # type: ignore[import-untyped]

    account_filter = ""
    params = [bigquery.ScalarQueryParameter("report_date", "STRING", report_date)]

    if accounts and len(accounts) > 0:
        account_filter = "AND B.FBSIShortName IN UNNEST(@accounts)"
        params.append(bigquery.ArrayQueryParameter("accounts", "STRING", accounts))

    query = f"""
    SELECT
      A.AccountNumber,
      B.PrimaryAccountHolder,
      B.FBSIShortName,
      B.ClientName,
      B.EstablishedDate,
      A.MarketValue
    FROM `perennial-data-prod.fidelity.daily_account_market_values` A
    JOIN `perennial-data-prod.fidelity.accounts` B
      ON A.AccountNumber = B.AccountNumber
    WHERE A.Date = (
      SELECT MAX(Date)
      FROM `perennial-data-prod.fidelity.daily_account_market_values`
      WHERE Date <= PARSE_DATE('%Y-%m-%d', @report_date)
    )
    {account_filter}
    """
    return await _run_query(query, params)


# ======================================================================
# 2. Daily PnL Data  (NOW includes DailyPnL column!)
# ======================================================================

async def get_daily_pnl_data(
    report_date: str,
    accounts: list[str] | None = None,
) -> list[dict[str, Any]]:
    from google.cloud import bigquery  # type: ignore[import-untyped]

    account_filter = ""
    params = [bigquery.ScalarQueryParameter("report_date", "STRING", report_date)]

    if accounts and len(accounts) > 0:
        account_filter = "AND B.FBSIShortName IN UNNEST(@accounts)"
        params.append(bigquery.ArrayQueryParameter("accounts", "STRING", accounts))

    query = f"""
    SELECT
      A.AccountNumber,
      A.Date,
      B.FBSIShortName,
      B.PrimaryAccountHolder,
      A.MarketValue,
      A.DailyPnL
    FROM `perennial-data-prod.fidelity.daily_account_market_values` A
    JOIN `perennial-data-prod.fidelity.accounts` B
      ON A.AccountNumber = B.AccountNumber
    WHERE A.Date <= PARSE_DATE('%Y-%m-%d', @report_date)
    {account_filter}
    ORDER BY A.Date ASC
    """
    return await _run_query(query, params)


# ======================================================================
# 3. TWROR Data  (correct column names from BigQuery)
# ======================================================================

async def get_twror_data(
    accounts: list[str] | None = None,
) -> list[dict[str, Any]]:
    from google.cloud import bigquery  # type: ignore[import-untyped]

    account_filter = ""
    params: list[Any] = []

    if accounts and len(accounts) > 0:
        account_filter = "WHERE b.FBSIShortName IN UNNEST(@accounts)"
        params.append(bigquery.ArrayQueryParameter("accounts", "STRING", accounts))

    query = f"""
    SELECT
      r.account_number,
      b.FBSIShortName,
      r.qtd_twror,
      r.ytd_twror,
      r.one_year_twror,
      r.three_year_twror,
      r.five_year_twror,
      r.inception_twror
    FROM `perennial-data-prod.fidelity.account_twror` r
    JOIN `perennial-data-prod.fidelity.accounts` b
      ON r.account_number = b.AccountNumber
    {account_filter}
    """
    return await _run_query(query, params)


# ======================================================================
# 4. Entity / Account Options
# ======================================================================

async def get_entity_options(client_name: str) -> list[str]:
    from google.cloud import bigquery  # type: ignore[import-untyped]

    query = """
    SELECT DISTINCT PrimaryAccountHolder AS Entity
    FROM `perennial-data-prod.fidelity.accounts`
    WHERE ClientName = @client_name
      AND PrimaryAccountHolder IS NOT NULL
    ORDER BY PrimaryAccountHolder
    """
    params = [bigquery.ScalarQueryParameter("client_name", "STRING", client_name)]
    rows = await _run_query(query, params)
    return [row["Entity"] for row in rows]


async def get_account_options(client_name: str, entities: list[str]) -> list[dict[str, str]]:
    from google.cloud import bigquery  # type: ignore[import-untyped]

    query = """
    SELECT DISTINCT
      AccountNumber,
      COALESCE(FBSIShortName, AccountNumber) AS AccountName
    FROM `perennial-data-prod.fidelity.accounts`
    WHERE ClientName = @client_name
      AND PrimaryAccountHolder IN UNNEST(@entities)
      AND AccountNumber IS NOT NULL
    ORDER BY AccountName
    """
    params = [
        bigquery.ScalarQueryParameter("client_name", "STRING", client_name),
        bigquery.ArrayQueryParameter("entities", "STRING", entities),
    ]
    return await _run_query(query, params)


# ======================================================================
# 5. RA Fund Holdings / Private Assets
# ======================================================================

async def get_ra_fund_holdings(report_date: str) -> list[dict[str, Any]]:
    """Fetch private-asset valuations and capital calls by fund."""
    from google.cloud import bigquery  # type: ignore[import-untyped]

    query = """
    WITH MaxPrivatesAsOfDate AS (
        SELECT MAX(COALESCE(
            SAFE.PARSE_DATE('%Y-%m-%d', effectivedate),
            SAFE.PARSE_DATE('%m/%d/%Y', effectivedate)
        )) AS max_valuation_date
        FROM `perennial-data-prod.fidelity.private_asset_valuations`
        WHERE COALESCE(
            SAFE.PARSE_DATE('%Y-%m-%d', effectivedate),
            SAFE.PARSE_DATE('%m/%d/%Y', effectivedate)
        ) <= PARSE_DATE('%Y-%m-%d', @report_date)
    ),
    Valuations AS (
        SELECT fund_name, asset_class, investment_type, valuation
        FROM `perennial-data-prod.fidelity.private_asset_valuations`
        WHERE COALESCE(
            SAFE.PARSE_DATE('%Y-%m-%d', effectivedate),
            SAFE.PARSE_DATE('%m/%d/%Y', effectivedate)
        ) = (SELECT max_valuation_date FROM MaxPrivatesAsOfDate)
    ),
    CalledCapital AS (
        SELECT fund_name, SUM(capital_called) AS total_called_capital
        FROM `perennial-data-prod.fidelity.private_asset_capital_calls`
        WHERE COALESCE(
            SAFE.PARSE_DATE('%Y-%m-%d', effectivedate),
            SAFE.PARSE_DATE('%m/%d/%Y', effectivedate)
        ) <= (SELECT max_valuation_date FROM MaxPrivatesAsOfDate)
        GROUP BY fund_name
    )
    SELECT
        v.fund_name,
        v.asset_class,
        v.investment_type,
        v.valuation,
        COALESCE(cc.total_called_capital, 0) AS total_called_capital
    FROM Valuations v
    LEFT JOIN CalledCapital cc ON v.fund_name = cc.fund_name
    """
    params = [bigquery.ScalarQueryParameter("report_date", "STRING", report_date)]
    return await _run_query(query, params)


async def get_capital_calls_timeline(report_date: str) -> list[dict[str, Any]]:
    """Fetch capital call history by fund and month."""
    from google.cloud import bigquery  # type: ignore[import-untyped]

    query = """
    SELECT
        fund_name,
        FORMAT_DATE('%Y-%m',
            COALESCE(
                SAFE.PARSE_DATE('%Y-%m-%d', effectivedate),
                SAFE.PARSE_DATE('%m/%d/%Y', effectivedate)
            )
        ) AS month,
        SUM(capital_called) AS capital_called,
        SUM(COALESCE(distributions, 0)) AS distributions
    FROM `perennial-data-prod.fidelity.private_asset_capital_calls`
    WHERE COALESCE(
        SAFE.PARSE_DATE('%Y-%m-%d', effectivedate),
        SAFE.PARSE_DATE('%m/%d/%Y', effectivedate)
    ) <= PARSE_DATE('%Y-%m-%d', @report_date)
    GROUP BY fund_name, month
    ORDER BY month ASC
    """
    params = [bigquery.ScalarQueryParameter("report_date", "STRING", report_date)]
    return await _run_query(query, params)


# ======================================================================
# 6. Computed Analytics  — ALL using DailyPnL (transfer-free)
# ======================================================================

def compute_monthly_returns(daily_data: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Compute monthly returns using DailyPnL (excludes transfers)."""
    if not daily_data:
        return []

    sorted_dates, daily_returns = _daily_returns_from_pnl(daily_data)
    if not daily_returns:
        return []

    # Ending MV per date (for the table's "ending value" column)
    date_mv: dict[str, float] = defaultdict(float)
    for row in daily_data:
        d = str(row.get("Date", ""))[:10]
        mv = float(row.get("MarketValue", 0) or 0)
        date_mv[d] += mv

    # Aggregate to monthly
    monthly: dict[str, list[float]] = defaultdict(list)
    monthly_end_mv: dict[str, float] = {}
    for d, ret in zip(sorted_dates, daily_returns):
        month_key = d[:7]
        monthly[month_key].append(ret)
    for d in sorted(date_mv.keys()):
        monthly_end_mv[d[:7]] = date_mv[d]

    result = []
    cumulative = 1.0
    for month_key in sorted(monthly.keys()):
        compounded = 1.0
        for r in monthly[month_key]:
            compounded *= (1 + r)
        month_return = (compounded - 1) * 100
        cumulative *= compounded
        cum_return = (cumulative - 1) * 100
        result.append({
            "month": month_key,
            "return_pct": round(month_return, 2),
            "cumulative_pct": round(cum_return, 2),
            "ending_value": round(monthly_end_mv.get(month_key, 0), 2),
        })

    return result


def compute_risk_metrics(daily_data: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute ITD risk metrics using DailyPnL (excludes transfers)."""
    if not daily_data:
        return {}

    sorted_dates, daily_returns = _daily_returns_from_pnl(daily_data)
    if not daily_returns:
        return {}

    n = len(daily_returns)
    total_days = n

    # ITD Return
    cumulative = 1.0
    for r in daily_returns:
        cumulative *= (1 + r)
    itd_return = (cumulative - 1) * 100

    # Annualized Return
    years = total_days / 252
    ann_return = ((cumulative ** (1 / years)) - 1) * 100 if years > 0 else 0

    # Volatility (annualized)
    mean_ret = sum(daily_returns) / n
    variance = sum((r - mean_ret) ** 2 for r in daily_returns) / max(n - 1, 1)
    vol_daily = math.sqrt(variance)
    vol_annual = vol_daily * math.sqrt(252) * 100

    # Sharpe (risk-free = 0)
    sharpe = (ann_return / vol_annual) if vol_annual > 0 else 0

    # Sortino (downside deviation)
    downside = [r for r in daily_returns if r < 0]
    if downside:
        downside_var = sum(r ** 2 for r in downside) / len(downside)
        downside_dev = math.sqrt(downside_var) * math.sqrt(252) * 100
        sortino = (ann_return / downside_dev) if downside_dev > 0 else 0
    else:
        sortino = 0

    # Max Drawdown
    peak = 1.0
    max_dd = 0.0
    max_dd_peak_date = sorted_dates[0] if sorted_dates else "N/A"
    max_dd_trough_date = sorted_dates[0] if sorted_dates else "N/A"
    running = 1.0
    current_peak_date = sorted_dates[0] if sorted_dates else "N/A"

    for i, r in enumerate(daily_returns):
        running *= (1 + r)
        if running > peak:
            peak = running
            current_peak_date = sorted_dates[i]
        dd = (peak - running) / peak if peak > 0 else 0
        if dd > max_dd:
            max_dd = dd
            max_dd_peak_date = current_peak_date
            max_dd_trough_date = sorted_dates[i]

    # Monthly returns for best/worst
    monthly: dict[str, list[float]] = defaultdict(list)
    for i, r in enumerate(daily_returns):
        month_key = sorted_dates[i][:7]
        monthly[month_key].append(r)

    monthly_returns_map = {}
    for mk, rets in monthly.items():
        compounded = 1.0
        for r in rets:
            compounded *= (1 + r)
        monthly_returns_map[mk] = (compounded - 1) * 100

    best_month = max(monthly_returns_map.items(), key=lambda x: x[1]) if monthly_returns_map else ("N/A", 0)
    worst_month = min(monthly_returns_map.items(), key=lambda x: x[1]) if monthly_returns_map else ("N/A", 0)

    return {
        "itd_return_pct": round(itd_return, 2),
        "annualized_return_pct": round(ann_return, 2),
        "volatility_pct": round(vol_annual, 2),
        "sharpe_ratio": round(sharpe, 2),
        "sortino_ratio": round(sortino, 2),
        "max_drawdown_pct": round(max_dd * 100, 2),
        "max_dd_peak_date": max_dd_peak_date,
        "max_dd_trough_date": max_dd_trough_date,
        "best_month": best_month[0],
        "best_month_return_pct": round(best_month[1], 2),
        "worst_month": worst_month[0],
        "worst_month_return_pct": round(worst_month[1], 2),
        "total_days": total_days,
    }


def compute_cumulative_returns(daily_data: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Compute daily cumulative returns using DailyPnL (excludes transfers)."""
    if not daily_data:
        return []

    sorted_dates, daily_returns = _daily_returns_from_pnl(daily_data)
    if not daily_returns:
        return []

    result = []
    cumulative = 1.0
    for d, r in zip(sorted_dates, daily_returns):
        cumulative *= (1 + r)
        result.append({
            "date": d,
            "cumulative_pct": round((cumulative - 1) * 100, 2),
        })

    return result


def compute_rolling_metrics(daily_data: list[dict[str, Any]], window: int = 365) -> list[dict[str, Any]]:
    """Compute rolling 365-day return and volatility using DailyPnL."""
    if not daily_data:
        return []

    sorted_dates, daily_returns = _daily_returns_from_pnl(daily_data)
    if len(daily_returns) < window:
        return []

    result = []
    for i in range(window, len(daily_returns)):
        window_rets = daily_returns[i - window:i]
        # Rolling return
        cum = 1.0
        for r in window_rets:
            cum *= (1 + r)
        rolling_return = (cum - 1) * 100

        # Rolling volatility
        mean_r = sum(window_rets) / len(window_rets)
        var = sum((r - mean_r) ** 2 for r in window_rets) / max(len(window_rets) - 1, 1)
        rolling_vol = math.sqrt(var) * math.sqrt(252) * 100

        result.append({
            "date": sorted_dates[i],
            "return_365d": round(rolling_return, 2),
            "vol_365d": round(rolling_vol, 2),
        })

    return result


def compute_period_vol(daily_data: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute annualised volatility for various lookback periods.

    Returns vol for QTD, YTD, 1Y, 3Y and ITD windows.
    """
    if not daily_data:
        return {}

    sorted_dates, daily_returns = _daily_returns_from_pnl(daily_data)
    if not daily_returns:
        return {}

    def _ann_vol(rets: list[float]) -> float:
        if len(rets) < 2:
            return 0.0
        m = sum(rets) / len(rets)
        var = sum((r - m) ** 2 for r in rets) / (len(rets) - 1)
        return math.sqrt(var) * math.sqrt(252) * 100

    n = len(daily_returns)
    result: dict[str, float] = {}

    # ITD
    result["itd_vol"] = round(_ann_vol(daily_returns), 2)

    # Period lookbacks (approximate trading days)
    periods = {"qtd": 63, "ytd": 252, "1y": 252, "3y": 756}
    for label, days in periods.items():
        window = min(days, n)
        result[f"{label}_vol"] = round(_ann_vol(daily_returns[-window:]), 2)

    return result
