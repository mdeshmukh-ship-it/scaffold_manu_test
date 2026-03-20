"""BigQuery client for CIO Dashboard queries.

Mirrors the SQL queries from the Hex CIO Client Reporting project,
adapted for the BigQuery Python client with parameterised queries.

Data sources:
  - ``fidelity.accounts``  – account master data
  - ``fidelity.daily_account_market_values``  – daily AUM snapshots
  - ``returns.daily_liquid_returns``  – pre-computed daily TWROR
  - ``returns.periodic_liquid_returns``  – QTD / YTD / 1Y / 3Y / ITD TWROR
  - ``fidelity.private_asset_*``  – private asset valuations & capital calls
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

    params = [bigquery.ScalarQueryParameter("report_date", "STRING", report_date)]

    if accounts and len(accounts) > 0:
        # Use LEFT JOIN so accounts without MV data still appear with $0
        params.append(bigquery.ArrayQueryParameter("accounts", "STRING", accounts))
        query = """
        WITH MaxDate AS (
          SELECT MAX(Date) AS max_date
          FROM `perennial-data-prod.fidelity.daily_account_market_values`
          WHERE Date <= PARSE_DATE('%Y-%m-%d', @report_date)
        )
        SELECT
          B.AccountNumber,
          B.PrimaryAccountHolder,
          B.FBSIShortName,
          B.ClientName,
          B.EstablishedDate,
          COALESCE(A.MarketValue, 0) AS MarketValue
        FROM `perennial-data-prod.fidelity.accounts` B
        CROSS JOIN MaxDate MD
        LEFT JOIN `perennial-data-prod.fidelity.daily_account_market_values` A
          ON A.AccountNumber = B.AccountNumber
          AND A.Date = MD.max_date
        WHERE B.AccountNumber IN UNNEST(@accounts)
        """
    else:
        query = """
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
        """
    return await _run_query(query, params)


# ======================================================================
# 2. Daily PnL Data  (from returns.daily_liquid_returns)
# ======================================================================

async def get_daily_pnl_data(
    report_date: str,
    accounts: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Fetch daily return data from the returns schema.

    Uses ``returns.daily_liquid_returns`` which has pre-computed
    ``daily_twror`` and ``beginning_market_value``.  We derive
    ``DailyPnL = daily_twror * beginning_market_value`` so the
    existing ``_daily_returns_from_pnl`` helper works unchanged.
    """
    from google.cloud import bigquery  # type: ignore[import-untyped]

    account_filter = ""
    params = [bigquery.ScalarQueryParameter("report_date", "STRING", report_date)]

    if accounts and len(accounts) > 0:
        account_filter = "AND A.account_number IN UNNEST(@accounts)"
        params.append(bigquery.ArrayQueryParameter("accounts", "STRING", accounts))

    query = f"""
    SELECT
      A.account_number  AS AccountNumber,
      A.date            AS Date,
      B.FBSIShortName,
      B.PrimaryAccountHolder,
      A.ending_market_value                                       AS MarketValue,
      COALESCE(A.daily_twror * A.beginning_market_value, 0)       AS DailyPnL
    FROM `perennial-data-prod.returns.daily_liquid_returns` A
    JOIN `perennial-data-prod.fidelity.accounts` B
      ON A.account_number = B.AccountNumber
    WHERE A.date <= PARSE_DATE('%Y-%m-%d', @report_date)
    {account_filter}
    ORDER BY A.date ASC
    """
    return await _run_query(query, params)


# ======================================================================
# 3. TWROR Data  (from returns.periodic_liquid_returns)
# ======================================================================

async def get_twror_data(
    accounts: list[str] | None = None,
) -> list[dict[str, Any]]:
    from google.cloud import bigquery  # type: ignore[import-untyped]

    account_filter = ""
    params: list[Any] = []

    if accounts and len(accounts) > 0:
        account_filter = "AND r.account_number IN UNNEST(@accounts)"
        params.append(bigquery.ArrayQueryParameter("accounts", "STRING", accounts))

    query = f"""
    WITH LatestDate AS (
      SELECT MAX(date) AS max_date
      FROM `perennial-data-prod.returns.periodic_liquid_returns`
    )
    SELECT
      r.account_number,
      b.FBSIShortName,
      r.qtd_twror,
      r.ytd_twror,
      r.trailing_1yr_annualized_twror AS one_year_twror,
      r.trailing_3yr_annualized_twror AS three_year_twror,
      CAST(NULL AS FLOAT64) AS five_year_twror,
      r.itd_annualized_twror AS inception_twror
    FROM `perennial-data-prod.returns.periodic_liquid_returns` r
    CROSS JOIN LatestDate LD
    JOIN `perennial-data-prod.fidelity.accounts` b
      ON r.account_number = b.AccountNumber
    WHERE r.date = LD.max_date
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
# 5. Account Summary (QTD: beginning value, ending value, flows, earnings)
# ======================================================================

async def get_account_summary(
    report_date: str,
    client_name: str,
    accounts: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Compute QTD account summary across all fund types.

    Exact replica of the Hex CIO Client Reporting queries:
      - **Liquid**: ``fidelity.daily_account_market_values`` + ``client_reporting.daily_account_activity``
      - **VC**: ``ssc.vc_capital_register``
      - **DI**: ``ssc.di_capital_register``  (ARRAY_AGG + GROUP BY pattern)
      - **RA**: ``ssc.ra_capital_roll``

    Key date-logic differences from a naïve implementation:
      - Beginning MV MAX(Date): filters by ALL family accounts (via ClientName)
      - Ending MV MAX(Date): NO account filter at all (global max in quarter)
      - Fund investment earnings are hardcoded to 0 (per Hex)

    Returns per-fund rows; the API handler computes totals.
    """
    from google.cloud import bigquery  # type: ignore[import-untyped]

    params = [
        bigquery.ScalarQueryParameter("report_date", "STRING", report_date),
        bigquery.ScalarQueryParameter("client_name", "STRING", client_name),
    ]

    # Account filter for selected accounts (used in outer SUM / net-flows only)
    acct_filter = ""
    if accounts and len(accounts) > 0:
        acct_filter = "AND AccountNumber IN UNNEST(@accounts)"
        params.append(bigquery.ArrayQueryParameter("accounts", "STRING", accounts))

    query = f"""
    WITH Params AS (
      SELECT
        PARSE_DATE('%Y-%m-%d', @report_date) AS report_end_date,
        DATE_TRUNC(PARSE_DATE('%Y-%m-%d', @report_date), QUARTER) AS report_start_date
    ),

    -- ===== LIQUID: Beginning Value =====
    -- MAX(Date) uses ALL family accounts; SUM uses selected accounts
    LiquidBeginning AS (
      SELECT COALESCE(SUM(MarketValue), 0) AS beginning_value
      FROM `perennial-data-prod.fidelity.daily_account_market_values`
      WHERE Date = (
        SELECT MAX(Date)
        FROM `perennial-data-prod.fidelity.daily_account_market_values`
        WHERE Date < (SELECT report_start_date FROM Params)
          AND AccountNumber IN (
            SELECT DISTINCT AccountNumber
            FROM `perennial-data-prod.fidelity.accounts`
            WHERE ClientName = @client_name
          )
      )
      {acct_filter}
    ),

    -- ===== LIQUID: Ending Value =====
    -- MAX(Date) has NO account filter; SUM uses selected accounts
    LiquidEnding AS (
      SELECT COALESCE(SUM(MarketValue), 0) AS ending_value
      FROM `perennial-data-prod.fidelity.daily_account_market_values`
      WHERE Date = (
        SELECT MAX(Date)
        FROM `perennial-data-prod.fidelity.daily_account_market_values`
        WHERE Date BETWEEN (SELECT report_start_date FROM Params)
                        AND (SELECT report_end_date FROM Params)
      )
      {acct_filter}
    ),

    -- ===== LIQUID: Net Flows =====
    LiquidNetFlows AS (
      SELECT COALESCE(SUM(Deposits), 0) + COALESCE(SUM(Withdrawals), 0) AS net_flows
      FROM `perennial-data-prod.client_reporting.daily_account_activity`
      WHERE Date BETWEEN (SELECT report_start_date FROM Params)
                      AND (SELECT report_end_date FROM Params)
        {acct_filter}
    ),

    -- ===== PRIVATE FUND setup =====
    MaxPrivatesAsOfDate AS (
      SELECT MAX(quarter_end_date) AS max_date
      FROM `perennial-data-prod.ssc.vc_capital_register`
      WHERE TRIM(id) = 'USD Total'
        AND name IS NULL
        AND entity = 'PVCFLP'
        AND quarter_end_date <= (SELECT report_end_date FROM Params)
    ),

    PrivateEntities AS (
      SELECT DISTINCT ssc_entity_name
      FROM `perennial-data-prod.client_reporting.fidelity_ssc_mapping`
      WHERE fidelity_client_name = @client_name
    ),

    FundData AS (
      -- VC
      SELECT
        'VC' AS fund,
        name,
        quarter_opening_net_capital AS beginning_balance,
        qtd_contributions AS contributions,
        qtd_redemptions AS distributions,
        ending_net_balance AS ending_balance
      FROM `perennial-data-prod.ssc.vc_capital_register`
      WHERE name IN (SELECT ssc_entity_name FROM PrivateEntities)
        AND quarter_end_date = (SELECT max_date FROM MaxPrivatesAsOfDate)
      QUALIFY ROW_NUMBER() OVER(PARTITION BY name, quarter_end_date ORDER BY add_timestamp DESC) = 1

      UNION ALL

      -- DI  (ARRAY_AGG pattern – matches Hex exactly)
      SELECT
        fund,
        name,
        COALESCE(
          ARRAY_AGG(month_opening_net_capital IGNORE NULLS
                    ORDER BY month_end_date ASC LIMIT 1)[OFFSET(0)], 0
        ) AS beginning_balance,
        SUM(COALESCE(mtd_contributions, 0)) AS contributions,
        SUM(COALESCE(mtd_redemptions, 0)) AS distributions,
        COALESCE(
          ARRAY_AGG(ending_net_balance IGNORE NULLS
                    ORDER BY month_end_date DESC LIMIT 1)[OFFSET(0)], 0
        ) AS ending_balance
      FROM (
        SELECT
          'DI' AS fund,
          name,
          month_end_date,
          month_opening_net_capital,
          mtd_contributions,
          mtd_redemptions,
          ending_net_balance
        FROM `perennial-data-prod.ssc.di_capital_register`
        CROSS JOIN (SELECT max_date FROM MaxPrivatesAsOfDate)
        WHERE name IN (SELECT ssc_entity_name FROM PrivateEntities)
          AND month_end_date > LAST_DAY(DATE_SUB((SELECT report_end_date FROM Params), INTERVAL 3 MONTH))
          AND month_end_date <= (SELECT report_end_date FROM Params)
        QUALIFY ROW_NUMBER() OVER(PARTITION BY name, month_end_date ORDER BY add_timestamp DESC) = 1
      )
      GROUP BY fund, name

      UNION ALL

      -- RA
      SELECT
        'RA' AS fund,
        partner_name,
        beginning_balance,
        call_investments,
        0 AS distributions,
        ending_balance
      FROM `perennial-data-prod.ssc.ra_capital_roll`
      WHERE partner_name IN (SELECT ssc_entity_name FROM PrivateEntities)
        AND end_date = (SELECT max_date FROM MaxPrivatesAsOfDate)
      QUALIFY ROW_NUMBER() OVER(PARTITION BY partner_name, end_date ORDER BY add_timestamp DESC) = 1
    ),

    -- ===== Aggregate fund totals =====
    FundTotals AS (
      SELECT
        COALESCE(SUM(beginning_balance), 0) AS fund_beginning,
        COALESCE(SUM(contributions) + SUM(distributions), 0) AS fund_net_flows,
        COALESCE(SUM(ending_balance), 0) AS fund_ending
      FROM FundData
    ),

    -- ===== Liquid earnings (ending - net_flows - beginning) =====
    LiquidEarnings AS (
      SELECT
        (SELECT ending_value FROM LiquidEnding)
        - COALESCE((SELECT net_flows FROM LiquidNetFlows), 0)
        - (SELECT beginning_value FROM LiquidBeginning) AS earnings
    )

    -- Return Liquid + Fund rows
    SELECT
      'Liquid' AS fund,
      (SELECT beginning_value FROM LiquidBeginning) AS beginning_value,
      (SELECT ending_value FROM LiquidEnding) AS ending_value,
      (SELECT net_flows FROM LiquidNetFlows) AS net_contributions_withdrawals,
      COALESCE((SELECT earnings FROM LiquidEarnings), 0) AS investment_earnings

    UNION ALL

    SELECT
      fund,
      COALESCE(SUM(beginning_balance), 0) AS beginning_value,
      COALESCE(SUM(ending_balance), 0) AS ending_value,
      COALESCE(SUM(contributions) + SUM(distributions), 0) AS net_contributions_withdrawals,
      0 AS investment_earnings  -- Fund earnings = 0 per Hex
    FROM FundData
    GROUP BY fund
    """
    return await _run_query(query, params)


# ======================================================================
# 6. Asset Class Breakdown (positions classified by security type)
# ======================================================================

async def get_asset_class_breakdown(
    report_date: str,
    accounts: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Classify positions by asset class and sum market values.

    Uses the same symbol/SecurityType mapping as the Hex CIO project.
    """
    from google.cloud import bigquery  # type: ignore[import-untyped]

    account_filter = ""
    params = [bigquery.ScalarQueryParameter("report_date", "STRING", report_date)]

    if accounts and len(accounts) > 0:
        account_filter = "AND dp.AccountNumber IN UNNEST(@accounts)"
        params.append(bigquery.ArrayQueryParameter("accounts", "STRING", accounts))

    query = f"""
    WITH LatestPositionDate AS (
      SELECT MAX(Date) AS max_date
      FROM `perennial-data-prod.fidelity.daily_positions`
      WHERE Date <= PARSE_DATE('%Y-%m-%d', @report_date)
    ),

    ClassifiedPositions AS (
      SELECT
        CASE
          WHEN TRIM(dp.Symbol) IN ('QJXAQ','FRGXX','QIWSQ') THEN 'Cash'
          WHEN TRIM(dp.Symbol) IN ('ISHUF','MUB','VTEB','NUVBX','NVHIX','PRIMX','VMLUX','AGG','CMF') THEN 'Fixed Income'
          WHEN dp.SecurityType IN ('0','1','2','9') THEN 'Equity'
          WHEN dp.SecurityType IN ('5','6','7') THEN 'Fixed Income'
          WHEN dp.SecurityType IN ('F','C') THEN 'Cash'
          ELSE 'Other'
        END AS asset_class,
        dp.PositionMarketValue
      FROM `perennial-data-prod.fidelity.daily_positions` dp
      CROSS JOIN LatestPositionDate lpd
      WHERE dp.Date = lpd.max_date
        AND dp.SecurityType NOT IN (' ', '8')
        {account_filter}
    )

    SELECT
      asset_class,
      SUM(PositionMarketValue) AS market_value
    FROM ClassifiedPositions
    GROUP BY asset_class
    ORDER BY market_value DESC
    """
    return await _run_query(query, params)


# ======================================================================
# 7. RA Fund Holdings / Private Assets
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
