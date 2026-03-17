"""BigQuery client for CIO Dashboard queries.

Mirrors the SQL queries from the Hex CIO Client Reporting project,
adapted for the BigQuery Python client with parameterized queries.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime
from typing import Any

from api.logging_config import get_logger
from api.services.bigquery_client import _get_bq_client, _make_serializable, _run_query

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# 1. Account Market Values (mirrors Hex "Acc market values" cell)
# ---------------------------------------------------------------------------

async def get_account_market_values(
    report_date: str,
    accounts: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Fetch account market values on or before report_date.

    Snaps to the latest available date <= report_date.
    Optionally filters by a list of FBSIShortName values.
    """
    from google.cloud import bigquery  # type: ignore[import-untyped]

    account_filter = ""
    params = [
        bigquery.ScalarQueryParameter("report_date", "STRING", report_date),
    ]

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


# ---------------------------------------------------------------------------
# 2. Daily PnL Data (mirrors Hex "Daily pnl data" cell)
# ---------------------------------------------------------------------------

async def get_daily_pnl_data(
    report_date: str,
    accounts: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Fetch daily market values per account up to report_date."""
    from google.cloud import bigquery  # type: ignore[import-untyped]

    account_filter = ""
    params = [
        bigquery.ScalarQueryParameter("report_date", "STRING", report_date),
    ]

    if accounts and len(accounts) > 0:
        account_filter = "AND B.FBSIShortName IN UNNEST(@accounts)"
        params.append(bigquery.ArrayQueryParameter("accounts", "STRING", accounts))

    query = f"""
    SELECT
      A.AccountNumber,
      A.Date,
      B.FBSIShortName,
      B.PrimaryAccountHolder,
      A.MarketValue
    FROM `perennial-data-prod.fidelity.daily_account_market_values` A
    JOIN `perennial-data-prod.fidelity.accounts` B
      ON A.AccountNumber = B.AccountNumber
    WHERE A.Date <= PARSE_DATE('%Y-%m-%d', @report_date)
    {account_filter}
    ORDER BY A.Date ASC
    """
    return await _run_query(query, params)


# ---------------------------------------------------------------------------
# 3. TWROR Data (mirrors Hex "TWROR data" cell)
# ---------------------------------------------------------------------------

async def get_twror_data(
    accounts: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Fetch time-weighted rate of return data per account."""
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
      r.mtd_twror,
      r.qtd_twror,
      r.ytd_twror,
      r.itd_twror
    FROM `perennial-data-prod.fidelity.account_twror` r
    JOIN `perennial-data-prod.fidelity.accounts` b
      ON r.account_number = b.AccountNumber
    {account_filter}
    """
    return await _run_query(query, params)


# ---------------------------------------------------------------------------
# 4. Entity/Account Options (mirrors Hex filter cells)
# ---------------------------------------------------------------------------

async def get_entity_options(client_name: str) -> list[str]:
    """Return distinct PrimaryAccountHolder values for a client."""
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
    """Return distinct accounts for a client filtered by entities."""
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


# ---------------------------------------------------------------------------
# 5. Computed Analytics (mirrors Hex Python cells)
# ---------------------------------------------------------------------------

def compute_monthly_returns(daily_data: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Compute monthly returns from daily market value data.

    Mirrors the Python logic from Hex Monthly Performance Summary cell.
    Calculates per-account daily returns, clips extremes, then aggregates.
    """
    if not daily_data:
        return []

    # Group by date and sum market values
    from collections import defaultdict

    date_mv: dict[str, float] = defaultdict(float)
    for row in daily_data:
        d = str(row.get("Date", ""))[:10]
        mv = float(row.get("MarketValue", 0) or 0)
        date_mv[d] += mv

    sorted_dates = sorted(date_mv.keys())
    if len(sorted_dates) < 2:
        return []

    # Compute daily returns, clip to [-15%, +15%]
    daily_returns: list[tuple[str, float]] = []
    for i in range(1, len(sorted_dates)):
        prev_mv = date_mv[sorted_dates[i - 1]]
        curr_mv = date_mv[sorted_dates[i]]
        if prev_mv > 0:
            ret = (curr_mv - prev_mv) / prev_mv
            ret = max(-0.15, min(0.15, ret))  # clip
        else:
            ret = 0.0
        daily_returns.append((sorted_dates[i], ret))

    # Aggregate to monthly
    monthly: dict[str, list[float]] = defaultdict(list)
    monthly_end_mv: dict[str, float] = {}
    for d, ret in daily_returns:
        month_key = d[:7]  # YYYY-MM
        monthly[month_key].append(ret)
    for d in sorted_dates:
        month_key = d[:7]
        monthly_end_mv[month_key] = date_mv[d]

    # Compound daily returns per month
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
    """Compute ITD risk metrics from daily market value data.

    Returns volatility, max drawdown, sharpe, sortino, best/worst month, etc.
    """
    from collections import defaultdict
    import math

    if not daily_data:
        return {}

    # Aggregate daily MVs
    date_mv: dict[str, float] = defaultdict(float)
    for row in daily_data:
        d = str(row.get("Date", ""))[:10]
        mv = float(row.get("MarketValue", 0) or 0)
        date_mv[d] += mv

    sorted_dates = sorted(date_mv.keys())
    if len(sorted_dates) < 2:
        return {}

    # Daily returns, clipped
    daily_returns: list[float] = []
    for i in range(1, len(sorted_dates)):
        prev_mv = date_mv[sorted_dates[i - 1]]
        curr_mv = date_mv[sorted_dates[i]]
        if prev_mv > 0:
            ret = (curr_mv - prev_mv) / prev_mv
            ret = max(-0.15, min(0.15, ret))
        else:
            ret = 0.0
        daily_returns.append(ret)

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
    max_dd_peak_date = sorted_dates[0]
    max_dd_trough_date = sorted_dates[0]
    running = 1.0
    current_peak_date = sorted_dates[0]

    for i, r in enumerate(daily_returns):
        running *= (1 + r)
        if running > peak:
            peak = running
            current_peak_date = sorted_dates[i + 1]
        dd = (peak - running) / peak
        if dd > max_dd:
            max_dd = dd
            max_dd_peak_date = current_peak_date
            max_dd_trough_date = sorted_dates[i + 1]

    # Monthly returns for best/worst
    monthly: dict[str, list[float]] = defaultdict(list)
    for i, r in enumerate(daily_returns):
        month_key = sorted_dates[i + 1][:7]
        monthly[month_key].append(r)

    monthly_returns = {}
    for mk, rets in monthly.items():
        compounded = 1.0
        for r in rets:
            compounded *= (1 + r)
        monthly_returns[mk] = (compounded - 1) * 100

    best_month = max(monthly_returns.items(), key=lambda x: x[1]) if monthly_returns else ("N/A", 0)
    worst_month = min(monthly_returns.items(), key=lambda x: x[1]) if monthly_returns else ("N/A", 0)

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
    """Compute daily cumulative returns for total portfolio."""
    from collections import defaultdict

    if not daily_data:
        return []

    date_mv: dict[str, float] = defaultdict(float)
    for row in daily_data:
        d = str(row.get("Date", ""))[:10]
        mv = float(row.get("MarketValue", 0) or 0)
        date_mv[d] += mv

    sorted_dates = sorted(date_mv.keys())
    if len(sorted_dates) < 2:
        return []

    result = [{"date": sorted_dates[0], "cumulative_pct": 0.0}]
    cumulative = 1.0
    for i in range(1, len(sorted_dates)):
        prev_mv = date_mv[sorted_dates[i - 1]]
        curr_mv = date_mv[sorted_dates[i]]
        if prev_mv > 0:
            ret = (curr_mv - prev_mv) / prev_mv
            ret = max(-0.15, min(0.15, ret))
        else:
            ret = 0.0
        cumulative *= (1 + ret)
        result.append({
            "date": sorted_dates[i],
            "cumulative_pct": round((cumulative - 1) * 100, 2),
        })

    return result


def compute_rolling_metrics(daily_data: list[dict[str, Any]], window: int = 365) -> list[dict[str, Any]]:
    """Compute rolling return and volatility (365-day window)."""
    from collections import defaultdict
    import math

    if not daily_data:
        return []

    date_mv: dict[str, float] = defaultdict(float)
    for row in daily_data:
        d = str(row.get("Date", ""))[:10]
        mv = float(row.get("MarketValue", 0) or 0)
        date_mv[d] += mv

    sorted_dates = sorted(date_mv.keys())
    if len(sorted_dates) < window + 1:
        return []

    # Daily returns
    daily_returns: list[tuple[str, float]] = []
    for i in range(1, len(sorted_dates)):
        prev_mv = date_mv[sorted_dates[i - 1]]
        curr_mv = date_mv[sorted_dates[i]]
        if prev_mv > 0:
            ret = (curr_mv - prev_mv) / prev_mv
            ret = max(-0.15, min(0.15, ret))
        else:
            ret = 0.0
        daily_returns.append((sorted_dates[i], ret))

    result = []
    for i in range(window, len(daily_returns)):
        window_returns = [r for _, r in daily_returns[i - window:i]]
        # Rolling return
        cum = 1.0
        for r in window_returns:
            cum *= (1 + r)
        rolling_return = (cum - 1) * 100

        # Rolling volatility
        mean_r = sum(window_returns) / len(window_returns)
        var = sum((r - mean_r) ** 2 for r in window_returns) / max(len(window_returns) - 1, 1)
        rolling_vol = math.sqrt(var) * math.sqrt(252) * 100

        result.append({
            "date": daily_returns[i][0],
            "return_365d": round(rolling_return, 2),
            "vol_365d": round(rolling_vol, 2),
        })

    return result
