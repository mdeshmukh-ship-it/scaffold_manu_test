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
# 5. Account Summary (QTD or YTD: beginning value, ending value, flows, earnings)
# ======================================================================

async def get_account_summary(
    report_date: str,
    client_name: str,
    accounts: list[str] | None = None,
    period: str = "QTD",
) -> list[dict[str, Any]]:
    """Compute QTD or YTD account summary across all fund types.

    Exact replica of the Hex CIO Client Reporting queries:
      - **Liquid**: ``fidelity.daily_account_market_values`` + ``client_reporting.daily_account_activity``
      - **VC**: ``ssc.vc_capital_register``
      - **DI**: ``ssc.di_capital_register``  (ARRAY_AGG + GROUP BY pattern)
      - **RA**: ``ssc.ra_capital_roll``

    Key date-logic differences from a naïve implementation:
      - Beginning MV MAX(Date): filters by ALL family accounts (via ClientName)
      - Ending MV MAX(Date): NO account filter at all (global max in period)
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

    # Date truncation unit determines whether we compute QTD or YTD
    trunc_unit = "QUARTER" if period == "QTD" else "YEAR"

    # Private fund sections differ between QTD and YTD
    if period == "QTD":
        vc_fund_sql = """
      -- VC (QTD: single row at latest quarter)
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
      QUALIFY ROW_NUMBER() OVER(PARTITION BY name, quarter_end_date ORDER BY add_timestamp DESC) = 1"""

        di_date_filter = "AND month_end_date > LAST_DAY(DATE_SUB((SELECT report_end_date FROM Params), INTERVAL 3 MONTH))"

        ra_fund_sql = """
      -- RA (QTD: single row at latest quarter)
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
      QUALIFY ROW_NUMBER() OVER(PARTITION BY partner_name, end_date ORDER BY add_timestamp DESC) = 1"""
    else:
        # YTD: aggregate across all quarters/months within the current year
        vc_fund_sql = """
      -- VC (YTD: aggregate across all quarters in the year)
      SELECT
        'VC' AS fund,
        name,
        COALESCE(
          ARRAY_AGG(quarter_opening_net_capital IGNORE NULLS ORDER BY quarter_end_date ASC LIMIT 1)[OFFSET(0)], 0
        ) AS beginning_balance,
        SUM(COALESCE(qtd_contributions, 0)) AS contributions,
        SUM(COALESCE(qtd_redemptions, 0)) AS distributions,
        COALESCE(
          ARRAY_AGG(ending_net_balance IGNORE NULLS ORDER BY quarter_end_date DESC LIMIT 1)[OFFSET(0)], 0
        ) AS ending_balance
      FROM (
        SELECT name, quarter_end_date, quarter_opening_net_capital, qtd_contributions, qtd_redemptions, ending_net_balance
        FROM `perennial-data-prod.ssc.vc_capital_register`
        WHERE name IN (SELECT ssc_entity_name FROM PrivateEntities)
          AND quarter_end_date >= DATE_TRUNC((SELECT report_end_date FROM Params), YEAR)
          AND quarter_end_date <= (SELECT max_date FROM MaxPrivatesAsOfDate)
        QUALIFY ROW_NUMBER() OVER(PARTITION BY name, quarter_end_date ORDER BY add_timestamp DESC) = 1
      )
      GROUP BY fund, name"""

        di_date_filter = "AND month_end_date >= DATE_TRUNC((SELECT report_end_date FROM Params), YEAR)"

        ra_fund_sql = """
      -- RA (YTD: aggregate across all quarters in the year)
      SELECT
        'RA' AS fund,
        partner_name,
        COALESCE(
          ARRAY_AGG(beginning_balance IGNORE NULLS ORDER BY end_date ASC LIMIT 1)[OFFSET(0)], 0
        ) AS beginning_balance,
        SUM(COALESCE(call_investments, 0)) AS contributions,
        0 AS distributions,
        COALESCE(
          ARRAY_AGG(ending_balance IGNORE NULLS ORDER BY end_date DESC LIMIT 1)[OFFSET(0)], 0
        ) AS ending_balance
      FROM (
        SELECT partner_name, end_date, beginning_balance, call_investments, ending_balance
        FROM `perennial-data-prod.ssc.ra_capital_roll`
        WHERE partner_name IN (SELECT ssc_entity_name FROM PrivateEntities)
          AND end_date >= DATE_TRUNC((SELECT report_end_date FROM Params), YEAR)
          AND end_date <= (SELECT max_date FROM MaxPrivatesAsOfDate)
        QUALIFY ROW_NUMBER() OVER(PARTITION BY partner_name, end_date ORDER BY add_timestamp DESC) = 1
      )
      GROUP BY fund, partner_name"""

    query = f"""
    WITH Params AS (
      SELECT
        PARSE_DATE('%Y-%m-%d', @report_date) AS report_end_date,
        DATE_TRUNC(PARSE_DATE('%Y-%m-%d', @report_date), {trunc_unit}) AS report_start_date
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
      {vc_fund_sql}

      UNION ALL

      -- DI  (ARRAY_AGG pattern)
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
          {di_date_filter}
          AND month_end_date <= (SELECT report_end_date FROM Params)
        QUALIFY ROW_NUMBER() OVER(PARTITION BY name, month_end_date ORDER BY add_timestamp DESC) = 1
      )
      GROUP BY fund, name

      UNION ALL

      {ra_fund_sql}
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

async def get_ra_fund_holdings(report_date: str, client_name: str | None = None) -> list[dict[str, Any]]:
    """Fetch private-fund holdings from SSC capital registers.

    Uses ``ssc.vc_capital_register``, ``ssc.di_capital_register``, and
    ``ssc.ra_capital_roll`` via the ``fidelity_ssc_mapping`` bridge table
    so data is correctly scoped to a client family.

    Falls back to ``fidelity.private_asset_valuations`` if no client_name
    is provided (legacy behaviour).
    """
    from google.cloud import bigquery  # type: ignore[import-untyped]

    if not client_name:
        # Legacy path — kept for backward compatibility
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

    # SSC-based path — scoped to client family via fidelity_ssc_mapping
    params = [
        bigquery.ScalarQueryParameter("report_date", "STRING", report_date),
        bigquery.ScalarQueryParameter("client_name", "STRING", client_name),
    ]

    query = """
    WITH PrivateEntities AS (
      SELECT DISTINCT ssc_entity_name, fund
      FROM `perennial-data-prod.client_reporting.fidelity_ssc_mapping`
      WHERE fidelity_client_name = @client_name
        AND ssc_entity_name <> 'No match found'
        AND fund IN ('VC', 'DI', 'RA')
    ),
    MaxVCDate AS (
      SELECT MAX(quarter_end_date) AS max_date
      FROM `perennial-data-prod.ssc.vc_capital_register`
      WHERE TRIM(id) = 'USD Total' AND name IS NULL AND entity = 'PVCFLP'
        AND quarter_end_date <= PARSE_DATE('%Y-%m-%d', @report_date)
    ),
    MaxDIDate AS (
      SELECT MAX(month_end_date) AS max_date
      FROM `perennial-data-prod.ssc.di_capital_register`
      WHERE month_end_date <= PARSE_DATE('%Y-%m-%d', @report_date)
    ),
    MaxRADate AS (
      SELECT MAX(end_date) AS max_date
      FROM `perennial-data-prod.ssc.ra_capital_roll`
      WHERE end_date <= PARSE_DATE('%Y-%m-%d', @report_date)
    ),

    VCHoldings AS (
      SELECT
        cr.entity AS fund_name,
        'Private Equity' AS asset_class,
        'VC' AS investment_type,
        cr.ending_net_balance AS valuation,
        COALESCE(cr.commitment, 0) - COALESCE(cr.unfunded_commitment, 0) AS total_called_capital
      FROM `perennial-data-prod.ssc.vc_capital_register` cr
      WHERE cr.name IN (SELECT ssc_entity_name FROM PrivateEntities WHERE fund = 'VC')
        AND cr.quarter_end_date = (SELECT max_date FROM MaxVCDate)
      QUALIFY ROW_NUMBER() OVER(PARTITION BY cr.name, cr.entity ORDER BY cr.add_timestamp DESC) = 1
    ),

    DIHoldings AS (
      SELECT
        cr.entity AS fund_name,
        'Diversifying' AS asset_class,
        'DI' AS investment_type,
        cr.ending_net_balance AS valuation,
        0 AS total_called_capital
      FROM `perennial-data-prod.ssc.di_capital_register` cr
      WHERE cr.name IN (SELECT ssc_entity_name FROM PrivateEntities WHERE fund = 'DI')
        AND cr.month_end_date = (SELECT max_date FROM MaxDIDate)
      QUALIFY ROW_NUMBER() OVER(PARTITION BY cr.name, cr.entity ORDER BY cr.add_timestamp DESC) = 1
    ),

    RAHoldings AS (
      SELECT
        cr.entity AS fund_name,
        'Real Assets' AS asset_class,
        'RA' AS investment_type,
        cr.ending_balance AS valuation,
        COALESCE(cr.commitment, 0) - COALESCE(cr.unfunded_commitment, 0) AS total_called_capital
      FROM `perennial-data-prod.ssc.ra_capital_roll` cr
      WHERE cr.partner_name IN (SELECT ssc_entity_name FROM PrivateEntities WHERE fund = 'RA')
        AND cr.end_date = (SELECT max_date FROM MaxRADate)
      QUALIFY ROW_NUMBER() OVER(PARTITION BY cr.partner_name, cr.entity ORDER BY cr.add_timestamp DESC) = 1
    )

    SELECT * FROM VCHoldings
    UNION ALL
    SELECT * FROM DIHoldings
    UNION ALL
    SELECT * FROM RAHoldings
    """
    return await _run_query(query, params)


async def get_capital_calls_timeline(report_date: str, client_name: str | None = None) -> list[dict[str, Any]]:
    """Fetch capital call & distribution history by fund and quarter/month.

    Uses SSC capital registers when ``client_name`` is provided (scoped to
    the family).  Falls back to the ``fidelity.private_asset_capital_calls``
    table (legacy) otherwise.
    """
    from google.cloud import bigquery  # type: ignore[import-untyped]

    if not client_name:
        # Legacy path
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

    # SSC-based path
    params = [
        bigquery.ScalarQueryParameter("report_date", "STRING", report_date),
        bigquery.ScalarQueryParameter("client_name", "STRING", client_name),
    ]

    query = """
    WITH PrivateEntities AS (
      SELECT DISTINCT ssc_entity_name, fund
      FROM `perennial-data-prod.client_reporting.fidelity_ssc_mapping`
      WHERE fidelity_client_name = @client_name
        AND ssc_entity_name <> 'No match found'
        AND fund IN ('VC', 'DI', 'RA')
    ),

    -- VC quarterly contributions/distributions (dedup then aggregate)
    VCCalls AS (
      SELECT
        'VC' AS fund_name,
        FORMAT_DATE('%Y-%m', quarter_end_date) AS month,
        COALESCE(SUM(qtd_contributions), 0) AS capital_called,
        ABS(COALESCE(SUM(qtd_redemptions), 0)) AS distributions
      FROM (
        SELECT name, quarter_end_date, qtd_contributions, qtd_redemptions
        FROM `perennial-data-prod.ssc.vc_capital_register`
        WHERE name IN (SELECT ssc_entity_name FROM PrivateEntities WHERE fund = 'VC')
          AND quarter_end_date <= PARSE_DATE('%Y-%m-%d', @report_date)
        QUALIFY ROW_NUMBER() OVER(PARTITION BY name, quarter_end_date ORDER BY add_timestamp DESC) = 1
      )
      GROUP BY fund_name, month
    ),

    -- DI monthly contributions/distributions (dedup then aggregate)
    DICalls AS (
      SELECT
        'DI' AS fund_name,
        FORMAT_DATE('%Y-%m', month_end_date) AS month,
        COALESCE(SUM(mtd_contributions), 0) AS capital_called,
        ABS(COALESCE(SUM(mtd_redemptions), 0)) AS distributions
      FROM (
        SELECT name, month_end_date, mtd_contributions, mtd_redemptions
        FROM `perennial-data-prod.ssc.di_capital_register`
        WHERE name IN (SELECT ssc_entity_name FROM PrivateEntities WHERE fund = 'DI')
          AND month_end_date <= PARSE_DATE('%Y-%m-%d', @report_date)
        QUALIFY ROW_NUMBER() OVER(PARTITION BY name, month_end_date ORDER BY add_timestamp DESC) = 1
      )
      GROUP BY fund_name, month
    ),

    -- RA quarterly capital calls (dedup then aggregate)
    RACalls AS (
      SELECT
        'RA' AS fund_name,
        FORMAT_DATE('%Y-%m', end_date) AS month,
        COALESCE(SUM(call_investments), 0) AS capital_called,
        0 AS distributions
      FROM (
        SELECT partner_name, end_date, call_investments
        FROM `perennial-data-prod.ssc.ra_capital_roll`
        WHERE partner_name IN (SELECT ssc_entity_name FROM PrivateEntities WHERE fund = 'RA')
          AND end_date <= PARSE_DATE('%Y-%m-%d', @report_date)
        QUALIFY ROW_NUMBER() OVER(PARTITION BY partner_name, end_date ORDER BY add_timestamp DESC) = 1
      )
      GROUP BY fund_name, month
    ),

    AllCalls AS (
      SELECT * FROM VCCalls
      UNION ALL
      SELECT * FROM DICalls
      UNION ALL
      SELECT * FROM RACalls
    )

    SELECT fund_name, month,
      SUM(capital_called) AS capital_called,
      SUM(distributions) AS distributions
    FROM AllCalls
    GROUP BY fund_name, month
    ORDER BY month ASC
    """
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

    # Also capture beginning MV per month (first date's MV in each month)
    monthly_beg_mv: dict[str, float] = {}
    for d in sorted(date_mv.keys()):
        mk = d[:7]
        if mk not in monthly_beg_mv:
            monthly_beg_mv[mk] = date_mv[d]

    result = []
    cumulative = 1.0
    sorted_months = sorted(monthly.keys())
    for i, month_key in enumerate(sorted_months):
        compounded = 1.0
        for r in monthly[month_key]:
            compounded *= (1 + r)
        month_return = (compounded - 1) * 100
        cumulative *= compounded
        cum_return = (cumulative - 1) * 100

        # Beginning value: use prior month's ending value if available,
        # otherwise use the first date's MV in this month
        if i > 0:
            beg_val = monthly_end_mv.get(sorted_months[i - 1], 0)
        else:
            beg_val = monthly_beg_mv.get(month_key, 0)

        result.append({
            "month": month_key,
            "beginning_value": round(beg_val, 2),
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


# ======================================================================
# 8. Cash Flow & Liquidity Forecasting
# ======================================================================

async def get_cash_positions(
    report_date: str,
    accounts: list[str] | None = None,
) -> dict[str, Any]:
    """Current cash + short-term bond balance from daily_positions.

    Returns cash (money market/sweep) and short-term bonds (fixed income
    SecurityType 5/6/7) separately so the frontend can show the breakdown.
    """
    from google.cloud import bigquery  # type: ignore[import-untyped]

    account_filter = ""
    params = [bigquery.ScalarQueryParameter("report_date", "STRING", report_date)]

    if accounts and len(accounts) > 0:
        account_filter = "AND dp.AccountNumber IN UNNEST(@accounts)"
        params.append(bigquery.ArrayQueryParameter("accounts", "STRING", accounts))

    query = f"""
    WITH LatestDate AS (
      SELECT MAX(Date) AS max_date
      FROM `perennial-data-prod.fidelity.daily_positions`
      WHERE Date <= PARSE_DATE('%Y-%m-%d', @report_date)
    )
    SELECT
      COALESCE(SUM(CASE
        WHEN TRIM(dp.Symbol) IN ('QJXAQ','FRGXX','QIWSQ') OR dp.SecurityType IN ('F','C')
        THEN dp.PositionMarketValue ELSE 0 END), 0) AS cash_balance,
      COALESCE(SUM(CASE
        WHEN dp.SecurityType IN ('5','6','7')
          AND TRIM(dp.Symbol) NOT IN ('QJXAQ','FRGXX','QIWSQ')
          AND dp.SecurityType NOT IN ('F','C')
        THEN dp.PositionMarketValue ELSE 0 END), 0) AS short_term_bonds
    FROM `perennial-data-prod.fidelity.daily_positions` dp
    CROSS JOIN LatestDate ld
    WHERE dp.Date = ld.max_date
      AND dp.SecurityType NOT IN (' ', '8')
      AND (
        TRIM(dp.Symbol) IN ('QJXAQ','FRGXX','QIWSQ')
        OR dp.SecurityType IN ('F','C','5','6','7')
      )
      {account_filter}
    """
    rows = await _run_query(query, params)
    cash = float(rows[0]["cash_balance"]) if rows else 0.0
    bonds = float(rows[0]["short_term_bonds"]) if rows else 0.0
    return {
        "cash_balance": cash + bonds,  # Total liquid = cash + short-term bonds
        "cash_only": cash,
        "short_term_bonds": bonds,
    }


async def get_historical_monthly_flows(
    report_date: str,
    accounts: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Monthly net flows (deposits + withdrawals) from daily_account_activity."""
    from google.cloud import bigquery  # type: ignore[import-untyped]

    account_filter = ""
    params = [bigquery.ScalarQueryParameter("report_date", "STRING", report_date)]

    if accounts and len(accounts) > 0:
        account_filter = "AND AccountNumber IN UNNEST(@accounts)"
        params.append(bigquery.ArrayQueryParameter("accounts", "STRING", accounts))

    query = f"""
    SELECT
      FORMAT_DATE('%Y-%m', Date) AS month,
      COALESCE(SUM(Deposits), 0) AS deposits,
      COALESCE(SUM(Withdrawals), 0) AS withdrawals,
      COALESCE(SUM(Deposits), 0) + COALESCE(SUM(Withdrawals), 0) AS net_flow
    FROM `perennial-data-prod.client_reporting.daily_account_activity`
    WHERE Date <= PARSE_DATE('%Y-%m-%d', @report_date)
      AND Date >= DATE_SUB(PARSE_DATE('%Y-%m-%d', @report_date), INTERVAL 24 MONTH)
      {account_filter}
    GROUP BY month
    ORDER BY month ASC
    """
    return await _run_query(query, params)


async def get_unfunded_commitments(
    report_date: str,
    client_name: str,
) -> list[dict[str, Any]]:
    """Compute unfunded commitments from private fund capital registers.

    Unfunded = total commitment - total called capital.
    """
    from google.cloud import bigquery  # type: ignore[import-untyped]

    params = [
        bigquery.ScalarQueryParameter("report_date", "STRING", report_date),
        bigquery.ScalarQueryParameter("client_name", "STRING", client_name),
    ]

    query = """
    WITH PrivateEntities AS (
      SELECT DISTINCT ssc_entity_name, fund
      FROM `perennial-data-prod.client_reporting.fidelity_ssc_mapping`
      WHERE fidelity_client_name = @client_name
        AND ssc_entity_name <> 'No match found'
    ),
    MaxVCDate AS (
      SELECT MAX(quarter_end_date) AS max_date
      FROM `perennial-data-prod.ssc.vc_capital_register`
      WHERE TRIM(id) = 'USD Total'
        AND name IS NULL
        AND entity = 'PVCFLP'
        AND quarter_end_date <= PARSE_DATE('%Y-%m-%d', @report_date)
    ),
    MaxRADate AS (
      SELECT MAX(end_date) AS max_date
      FROM `perennial-data-prod.ssc.ra_capital_roll`
      WHERE end_date <= PARSE_DATE('%Y-%m-%d', @report_date)
    ),

    -- VC unfunded
    VCCommitments AS (
      SELECT
        'VC' AS fund_type,
        entity AS fund_name,
        COALESCE(commitment, 0) AS total_commitment,
        COALESCE(commitment, 0) - COALESCE(unfunded_commitment, 0) AS total_called,
        COALESCE(unfunded_commitment, 0) AS unfunded
      FROM `perennial-data-prod.ssc.vc_capital_register`
      WHERE name IN (SELECT ssc_entity_name FROM PrivateEntities WHERE fund = 'VC')
        AND quarter_end_date = (SELECT max_date FROM MaxVCDate)
        AND commitment IS NOT NULL AND commitment > 0
      QUALIFY ROW_NUMBER() OVER(PARTITION BY name, entity ORDER BY add_timestamp DESC) = 1
    ),

    -- RA unfunded
    RACommitments AS (
      SELECT
        'RA' AS fund_type,
        entity AS fund_name,
        COALESCE(commitment, 0) AS total_commitment,
        COALESCE(commitment, 0) - COALESCE(unfunded_commitment, 0) AS total_called,
        COALESCE(unfunded_commitment, 0) AS unfunded
      FROM `perennial-data-prod.ssc.ra_capital_roll`
      WHERE partner_name IN (SELECT ssc_entity_name FROM PrivateEntities WHERE fund = 'RA')
        AND end_date = (SELECT max_date FROM MaxRADate)
      QUALIFY ROW_NUMBER() OVER(PARTITION BY partner_name, end_date ORDER BY add_timestamp DESC) = 1
    ),

    AllCommitments AS (
      SELECT * FROM VCCommitments
      UNION ALL
      SELECT * FROM RACommitments
    )

    SELECT fund_type, fund_name, total_commitment, total_called, unfunded
    FROM AllCommitments
    WHERE unfunded > 0
    ORDER BY unfunded DESC
    """
    return await _run_query(query, params)


async def get_capital_call_pacing(
    report_date: str,
    client_name: str,
) -> list[dict[str, Any]]:
    """Quarterly capital call totals from SSC capital registers (VC + DI).

    Uses the same SSC tables as get_account_summary since
    fidelity.private_asset_capital_calls does not exist.
    Returns per-quarter contribution/distribution data for pacing.
    """
    from google.cloud import bigquery  # type: ignore[import-untyped]

    params = [
        bigquery.ScalarQueryParameter("report_date", "STRING", report_date),
        bigquery.ScalarQueryParameter("client_name", "STRING", client_name),
    ]

    query = """
    WITH PrivateEntities AS (
      SELECT DISTINCT ssc_entity_name, fund
      FROM `perennial-data-prod.client_reporting.fidelity_ssc_mapping`
      WHERE fidelity_client_name = @client_name
        AND ssc_entity_name <> 'No match found'
    ),

    -- VC quarterly contributions/distributions
    VCQuarterly AS (
      SELECT
        FORMAT_DATE('%Y-%m', quarter_end_date) AS month,
        COALESCE(SUM(qtd_contributions), 0) AS total_called,
        COALESCE(SUM(qtd_redemptions), 0) AS total_distributions
      FROM `perennial-data-prod.ssc.vc_capital_register`
      WHERE name IN (SELECT ssc_entity_name FROM PrivateEntities WHERE fund = 'VC')
        AND quarter_end_date BETWEEN DATE_SUB(PARSE_DATE('%Y-%m-%d', @report_date), INTERVAL 24 MONTH)
                                AND PARSE_DATE('%Y-%m-%d', @report_date)
      QUALIFY ROW_NUMBER() OVER(PARTITION BY name, quarter_end_date ORDER BY add_timestamp DESC) = 1
      GROUP BY month
    ),

    -- DI monthly contributions/distributions
    DIMonthly AS (
      SELECT
        FORMAT_DATE('%Y-%m', month_end_date) AS month,
        COALESCE(SUM(mtd_contributions), 0) AS total_called,
        COALESCE(SUM(mtd_redemptions), 0) AS total_distributions
      FROM `perennial-data-prod.ssc.di_capital_register`
      WHERE name IN (SELECT ssc_entity_name FROM PrivateEntities WHERE fund = 'DI')
        AND month_end_date BETWEEN DATE_SUB(PARSE_DATE('%Y-%m-%d', @report_date), INTERVAL 24 MONTH)
                               AND PARSE_DATE('%Y-%m-%d', @report_date)
      QUALIFY ROW_NUMBER() OVER(PARTITION BY name, month_end_date ORDER BY add_timestamp DESC) = 1
      GROUP BY month
    ),

    -- RA quarterly capital calls
    RAQuarterly AS (
      SELECT
        FORMAT_DATE('%Y-%m', end_date) AS month,
        COALESCE(SUM(call_investments), 0) AS total_called,
        0 AS total_distributions
      FROM `perennial-data-prod.ssc.ra_capital_roll`
      WHERE partner_name IN (SELECT ssc_entity_name FROM PrivateEntities WHERE fund = 'RA')
        AND end_date BETWEEN DATE_SUB(PARSE_DATE('%Y-%m-%d', @report_date), INTERVAL 24 MONTH)
                        AND PARSE_DATE('%Y-%m-%d', @report_date)
      QUALIFY ROW_NUMBER() OVER(PARTITION BY partner_name, end_date ORDER BY add_timestamp DESC) = 1
      GROUP BY month
    ),

    -- Combine all funds
    AllCalls AS (
      SELECT * FROM VCQuarterly
      UNION ALL
      SELECT * FROM DIMonthly
      UNION ALL
      SELECT * FROM RAQuarterly
    )

    SELECT
      month,
      SUM(total_called) AS total_called,
      SUM(total_distributions) AS total_distributions
    FROM AllCalls
    GROUP BY month
    ORDER BY month ASC
    """
    return await _run_query(query, params)


def _percentile(values: list[float], pct: float) -> float:
    """Compute the pct-th percentile of a sorted list."""
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * pct / 100.0
    f = int(k)
    c = f + 1
    if c >= len(s):
        return s[f]
    return s[f] + (k - f) * (s[c] - s[f])


def compute_liquidity_forecast(
    cash_balance: float,
    monthly_flows: list[dict[str, Any]],
    unfunded: list[dict[str, Any]],
    capital_call_pacing: list[dict[str, Any]],
    total_portfolio_mv: float,
) -> dict[str, Any]:
    """Build a 12-month forward liquidity projection with 3 scenarios.

    Method:
    - **Base case**: Weighted moving average of trailing 12 months
      (recent months weighted 2x) for net flows. Median used as anchor.
    - **Optimistic**: 75th percentile of monthly net flows.
    - **Pessimistic**: 25th percentile of monthly net flows.
    - **Portfolio return overlay**: Applies trailing annualised return
      to the non-cash portfolio to project investment income.
    - Capital calls use trailing avg across VC + DI + RA.
    """
    # --- Net flow analysis (trailing 12 months, fall back to 6) ---
    lookback = monthly_flows[-12:] if len(monthly_flows) >= 12 else monthly_flows
    flow_values = [float(f.get("net_flow", 0) or 0) for f in lookback]

    if flow_values:
        # Weighted moving average: last 3 months get 2x weight
        n = len(flow_values)
        weights = [1.0] * n
        for i in range(max(0, n - 3), n):
            weights[i] = 2.0
        total_weight = sum(weights)
        avg_net_flow = sum(v * w for v, w in zip(flow_values, weights)) / total_weight

        median_flow = _percentile(flow_values, 50)
        p25_flow = _percentile(flow_values, 25)
        p75_flow = _percentile(flow_values, 75)
    else:
        avg_net_flow = 0.0
        median_flow = 0.0
        p25_flow = 0.0
        p75_flow = 0.0

    # --- Capital calls & distributions (trailing, across VC + DI + RA) ---
    recent_calls = capital_call_pacing[-12:] if len(capital_call_pacing) >= 12 else capital_call_pacing
    avg_monthly_call = (
        sum(float(c.get("total_called", 0) or 0) for c in recent_calls) / len(recent_calls)
        if recent_calls else 0.0
    )
    avg_monthly_dist = (
        sum(float(c.get("total_distributions", 0) or 0) for c in recent_calls) / len(recent_calls)
        if recent_calls else 0.0
    )

    total_unfunded = sum(float(u.get("unfunded", 0) or 0) for u in unfunded)

    # --- Portfolio return overlay (monthly) ---
    # Estimate monthly return from trailing flows:
    # Use the portfolio MV growth implied by the data if available
    non_cash_mv = max(total_portfolio_mv - cash_balance, 0)
    # Conservative assumption: 6% annual return on non-cash → 0.487%/mo
    monthly_return_rate = 0.06 / 12  # TODO: could compute from actual trailing TWROR

    # --- Build 3 scenario projections ---
    scenarios = {
        "base": avg_net_flow,       # Weighted moving average
        "optimistic": p75_flow,     # 75th percentile
        "pessimistic": p25_flow,    # 25th percentile
    }

    all_projections: dict[str, list[dict[str, Any]]] = {}

    for scenario_name, scenario_flow in scenarios.items():
        projection: list[dict[str, Any]] = []
        running_cash = cash_balance
        running_non_cash = non_cash_mv
        remaining_unfunded = total_unfunded

        for month_offset in range(1, 13):
            # Projected capital call (don't exceed remaining unfunded)
            projected_call = min(abs(avg_monthly_call), remaining_unfunded)
            remaining_unfunded = max(0, remaining_unfunded - projected_call)

            # Estimated investment return on non-cash portfolio
            est_return = running_non_cash * monthly_return_rate
            running_non_cash += est_return

            net_change = scenario_flow - projected_call + avg_monthly_dist + est_return
            running_cash += net_change

            projection.append({
                "month_offset": month_offset,
                "projected_cash": round(running_cash, 2),
                "net_flows": round(scenario_flow, 2),
                "capital_calls": round(-projected_call, 2),
                "distributions": round(avg_monthly_dist, 2),
                "investment_return": round(est_return, 2),
                "net_change": round(net_change, 2),
            })

        all_projections[scenario_name] = projection

    # --- Liquidity metrics ---
    liquid_pct = (cash_balance / total_portfolio_mv * 100) if total_portfolio_mv > 0 else 0
    months_of_runway = 0
    if avg_monthly_call > 0:
        months_of_runway = round(cash_balance / abs(avg_monthly_call), 1)

    return {
        "current_cash": round(cash_balance, 2),
        "total_portfolio_mv": round(total_portfolio_mv, 2),
        "liquid_pct": round(liquid_pct, 2),
        "total_unfunded_commitments": round(total_unfunded, 2),
        "avg_monthly_net_flow": round(avg_net_flow, 2),
        "median_monthly_net_flow": round(median_flow, 2),
        "p25_monthly_net_flow": round(p25_flow, 2),
        "p75_monthly_net_flow": round(p75_flow, 2),
        "avg_monthly_capital_call": round(abs(avg_monthly_call), 2),
        "avg_monthly_distributions": round(avg_monthly_dist, 2),
        "monthly_return_rate_pct": round(monthly_return_rate * 100, 3),
        "months_of_runway": months_of_runway,
        "projection_method": "weighted_moving_avg_with_scenarios",
        "projection": all_projections.get("base", []),  # Backwards compatible
        "projection_optimistic": all_projections.get("optimistic", []),
        "projection_pessimistic": all_projections.get("pessimistic", []),
        "unfunded_detail": [
            {
                "fund_type": u.get("fund_type", ""),
                "fund_name": u.get("fund_name", ""),
                "total_commitment": round(float(u.get("total_commitment", 0) or 0), 2),
                "total_called": round(float(u.get("total_called", 0) or 0), 2),
                "unfunded": round(float(u.get("unfunded", 0) or 0), 2),
            }
            for u in unfunded
        ],
        "historical_flow_stats": {
            "count": len(flow_values),
            "mean": round(avg_net_flow, 2),
            "median": round(median_flow, 2),
            "p25": round(p25_flow, 2),
            "p75": round(p75_flow, 2),
            "min": round(min(flow_values), 2) if flow_values else 0,
            "max": round(max(flow_values), 2) if flow_values else 0,
        },
    }


# ======================================================================
# 9. Consolidated Balance Sheet
# ======================================================================

async def get_balance_sheet_data(
    report_date: str,
    client_name: str,
    accounts: list[str] | None = None,
) -> dict[str, Any]:
    """Build consolidated balance sheet from liquid + private assets.

    Returns asset categories with subtotals.
    """
    # 1. Get liquid assets by asset class
    asset_class_rows = await get_asset_class_breakdown(report_date, accounts)
    liquid_total = sum(float(r.get("market_value", 0) or 0) for r in asset_class_rows)

    # 2. Get private assets (graceful — table may not exist for all clients)
    private_rows: list[dict[str, Any]] = []
    try:
        private_rows = await get_ra_fund_holdings(report_date, client_name)
    except Exception:
        pass  # Private asset tables may not exist
    private_total = sum(float(r.get("valuation", 0) or 0) for r in private_rows)

    # 3. Get total portfolio MV for cross-check
    mv_rows = await get_account_market_values(report_date, accounts)
    portfolio_mv = sum(float(r.get("MarketValue", 0) or 0) for r in mv_rows)

    liquid_assets = [
        {
            "category": "Liquid Assets",
            "subcategory": r.get("asset_class", "Other"),
            "value": round(float(r.get("market_value", 0) or 0), 2),
            "source": "fidelity",
        }
        for r in asset_class_rows
    ]

    private_assets = [
        {
            "category": "Private Assets",
            "subcategory": r.get("fund_name", "Unknown"),
            "asset_class": r.get("asset_class", ""),
            "investment_type": r.get("investment_type", ""),
            "value": round(float(r.get("valuation", 0) or 0), 2),
            "cost_basis": round(float(r.get("total_called_capital", 0) or 0), 2),
            "source": "ssc",
        }
        for r in private_rows
    ]

    return {
        "report_date": report_date,
        "liquid_assets": liquid_assets,
        "liquid_total": round(liquid_total, 2),
        "private_assets": private_assets,
        "private_total": round(private_total, 2),
        "financial_total": round(liquid_total + private_total, 2),
        "portfolio_mv": round(portfolio_mv, 2),
    }


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


# ======================================================================
# 10. Top Positions (for agent context)
# ======================================================================

async def get_top_positions(
    report_date: str,
    accounts: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Top holdings by market value across selected accounts."""
    from google.cloud import bigquery  # type: ignore[import-untyped]

    account_filter = ""
    params = [bigquery.ScalarQueryParameter("report_date", "STRING", report_date)]

    if accounts and len(accounts) > 0:
        account_filter = "AND dp.AccountNumber IN UNNEST(@accounts)"
        params.append(bigquery.ArrayQueryParameter("accounts", "STRING", accounts))

    query = f"""
    WITH LatestDate AS (
      SELECT MAX(Date) AS max_date
      FROM `perennial-data-prod.fidelity.daily_positions`
      WHERE Date <= PARSE_DATE('%Y-%m-%d', @report_date)
    )
    SELECT
      a.CustomShortName AS account_name,
      a.AccountNumber AS account_number,
      dp.Symbol AS symbol,
      dp.Description AS description,
      CASE
        WHEN TRIM(dp.Symbol) IN ('QJXAQ','FRGXX','QIWSQ') THEN 'Cash'
        WHEN TRIM(dp.Symbol) IN ('ISHUF','MUB','VTEB','NUVBX','NVHIX','PRIMX','VMLUX','AGG','CMF') THEN 'Fixed Income'
        WHEN dp.SecurityType IN ('0','1','2','9') THEN 'Equity'
        WHEN dp.SecurityType IN ('5','6','7') THEN 'Fixed Income'
        WHEN dp.SecurityType IN ('F','C') THEN 'Cash'
        ELSE 'Other'
      END AS asset_class,
      dp.PositionMarketValue AS market_value,
      dp.MarketPrice AS price,
      dp.TradeDateQuantity AS quantity
    FROM `perennial-data-prod.fidelity.daily_positions` dp
    CROSS JOIN LatestDate ld
    JOIN `perennial-data-prod.fidelity.accounts` a ON dp.AccountNumber = a.AccountNumber
    WHERE dp.Date = ld.max_date
      AND dp.SecurityType NOT IN (' ', '8')
      AND dp.PositionMarketValue IS NOT NULL
      {account_filter}
    ORDER BY dp.PositionMarketValue DESC
    LIMIT 50
    """
    return await _run_query(query, params)


# ======================================================================
# 11. Recent Transactions (for agent context)
# ======================================================================

async def get_recent_transactions(
    report_date: str,
    accounts: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Recent significant transactions in the current quarter."""
    from google.cloud import bigquery  # type: ignore[import-untyped]

    account_filter = ""
    params = [bigquery.ScalarQueryParameter("report_date", "STRING", report_date)]

    if accounts and len(accounts) > 0:
        account_filter = "AND t.AccountNumber IN UNNEST(@accounts)"
        params.append(bigquery.ArrayQueryParameter("accounts", "STRING", accounts))

    query = f"""
    SELECT
      a.CustomShortName AS account_name,
      a.AccountNumber AS account_number,
      t.Date AS date,
      t.TransactionType AS transaction_type,
      t.TransactionCategory AS category,
      t.Description AS description,
      t.Amount AS amount,
      t.Quantity AS quantity,
      t.BuySellCode AS buy_sell
    FROM `perennial-data-prod.fidelity.daily_transactions` t
    JOIN `perennial-data-prod.fidelity.accounts` a ON t.AccountNumber = a.AccountNumber
    WHERE t.Date BETWEEN DATE_TRUNC(PARSE_DATE('%Y-%m-%d', @report_date), QUARTER)
                      AND PARSE_DATE('%Y-%m-%d', @report_date)
      AND t.Amount IS NOT NULL
      AND ABS(t.Amount) > 100
      {account_filter}
    ORDER BY ABS(t.Amount) DESC
    LIMIT 50
    """
    return await _run_query(query, params)


# ======================================================================
# 12. Private Fund Types & Detail Data
# ======================================================================

async def get_private_fund_types(client_name: str) -> list[str]:
    """Return which fund types (VC, DI, RA) a family is invested in.

    Uses ``client_reporting.fidelity_ssc_mapping`` to check for active
    mappings.  Only returns fund types where at least one entity is mapped.
    """
    from google.cloud import bigquery  # type: ignore[import-untyped]

    query = """
    SELECT DISTINCT fund
    FROM `perennial-data-prod.client_reporting.fidelity_ssc_mapping`
    WHERE fidelity_client_name = @client_name
      AND ssc_entity_name <> 'No match found'
      AND fund IN ('VC', 'DI', 'RA')
    ORDER BY fund
    """
    params = [bigquery.ScalarQueryParameter("client_name", "STRING", client_name)]
    rows = await _run_query(query, params)
    return [row["fund"] for row in rows]


async def get_private_fund_vc_detail(
    report_date: str,
    client_name: str,
) -> dict[str, Any]:
    """VC fund detail: summary + commitment detail for all family entities."""
    from google.cloud import bigquery  # type: ignore[import-untyped]

    params = [
        bigquery.ScalarQueryParameter("report_date", "STRING", report_date),
        bigquery.ScalarQueryParameter("client_name", "STRING", client_name),
    ]

    # Summary from vc_capital_register with fund-level totals for ownership %
    summary_query = """
    WITH PrivateEntities AS (
      SELECT DISTINCT ssc_entity_name
      FROM `perennial-data-prod.client_reporting.fidelity_ssc_mapping`
      WHERE fidelity_client_name = @client_name
        AND fund = 'VC'
        AND ssc_entity_name <> 'No match found'
    ),
    MaxDate AS (
      SELECT MAX(quarter_end_date) AS max_date
      FROM `perennial-data-prod.ssc.vc_capital_register`
      WHERE TRIM(id) = 'USD Total'
        AND name IS NULL
        AND entity = 'PVCFLP'
        AND quarter_end_date <= PARSE_DATE('%Y-%m-%d', @report_date)
    ),
    -- Fund-level totals from "USD Total" rows (one per fund entity)
    FundTotals AS (
      SELECT
        entity,
        ending_net_balance AS fund_nav,
        commitment AS fund_commitment
      FROM `perennial-data-prod.ssc.vc_capital_register`
      WHERE TRIM(id) = 'USD Total'
        AND name IS NULL
        AND quarter_end_date = (SELECT max_date FROM MaxDate)
      QUALIFY ROW_NUMBER() OVER(PARTITION BY entity ORDER BY add_timestamp DESC) = 1
    )
    SELECT
      cr.name AS investor_name,
      cr.entity AS fund_entity,
      cr.commitment,
      cr.unfunded_commitment,
      cr.quarter_opening_net_capital AS beginning_balance,
      cr.ending_net_balance,
      cr.qtd_contributions,
      cr.qtd_redemptions,
      cr.net_ror_qtd,
      cr.net_ror_ytd,
      cr.net_ror_itd,
      cr.quarter_end_date,
      ft.fund_nav,
      ft.fund_commitment,
      SAFE_DIVIDE(cr.ending_net_balance, ft.fund_nav) AS ownership_pct,
      SAFE_DIVIDE(cr.commitment, ft.fund_commitment) AS commitment_ownership_pct
    FROM `perennial-data-prod.ssc.vc_capital_register` cr
    CROSS JOIN MaxDate md
    LEFT JOIN FundTotals ft ON cr.entity = ft.entity
    WHERE cr.name IN (SELECT ssc_entity_name FROM PrivateEntities)
      AND cr.quarter_end_date = md.max_date
    QUALIFY ROW_NUMBER() OVER(PARTITION BY cr.name, cr.entity, cr.quarter_end_date ORDER BY cr.add_timestamp DESC) = 1
    """
    summary_rows = await _run_query(summary_query, params)

    # VC Holdings: Funds + Directs from vc_valuation, vc_transaction, fund_holdings
    # Mirrors the Caissa/Hex VC Portfolio Deployment & Marks queries.
    commitment_query = """
    WITH MaxRegDate AS (
      SELECT MAX(quarter_end_date) AS max_date
      FROM `perennial-data-prod.ssc.vc_capital_register`
      WHERE TRIM(id) = 'USD Total'
        AND name IS NULL
        AND entity = 'PVCFLP'
        AND quarter_end_date <= PARSE_DATE('%Y-%m-%d', @report_date)
    ),

    -- Master fund entities for transactions
    MasterEntities AS (
      SELECT DISTINCT entity
      FROM `perennial-data-prod.ssc.vc_capital_register`
      WHERE TRIM(id) = 'USD Total'
        AND name IS NULL
        AND quarter_end_date = (SELECT max_date FROM MaxRegDate)
        AND entity <> 'PVCFLP'
    ),

    -- Valuations from vc_valuation
    Valuations AS (
      SELECT
        investment_name,
        SUM(amount) AS total_valuation
      FROM (
        SELECT investment_name, amount
        FROM `perennial-data-prod.ssc.vc_valuation`
        WHERE effectivedate = (SELECT max_date FROM MaxRegDate)
        QUALIFY ROW_NUMBER() OVER(PARTITION BY investment_name ORDER BY report_date DESC, add_timestamp DESC) = 1
      )
      GROUP BY investment_name
    ),

    -- Called capital from vc_transaction
    CalledCapital AS (
      SELECT
        investment_name,
        SUM(amount) AS total_called_capital
      FROM (
        SELECT entity, investment_name, amount, effectivedate, report_date, add_timestamp
        FROM `perennial-data-prod.ssc.vc_transaction`
        WHERE entity IN (SELECT entity FROM MasterEntities)
          AND transaction_type IN ('Call', 'Investment Purchase Long', 'Other Fee (Inside)')
          AND effectivedate <= (SELECT max_date FROM MaxRegDate)
        QUALIFY RANK() OVER(
          PARTITION BY entity, investment_name, effectivedate, report_date
          ORDER BY report_date DESC, add_timestamp DESC
        ) = 1
      )
      GROUP BY investment_name
    ),

    -- Commitments from vc_investment_commitment
    Commitments AS (
      SELECT
        description,
        SUM(COALESCE(end_commitment_balance, 0) + COALESCE(cost_basis, 0)) AS total_commitments
      FROM (
        SELECT description, end_commitment_balance, cost_basis
        FROM `perennial-data-prod.ssc.vc_investment_commitment`
        WHERE description IS NOT NULL
          AND end_date = (SELECT max_date FROM MaxRegDate)
        QUALIFY ROW_NUMBER() OVER(PARTITION BY description, end_date ORDER BY add_timestamp DESC) = 1
      )
      GROUP BY description
    ),

    -- Fund holdings info for style/vintage classification
    FundHoldingsInfo AS (
      SELECT DISTINCT investment_name, vintage, style
      FROM `perennial-data-prod.client_reporting.fund_holdings`
      WHERE fund = 'VC'
    )

    SELECT
      v.investment_name AS investment,
      fhi.vintage AS description,
      fhi.style,
      c.total_commitments AS original_commitment,
      cc.total_called_capital * -1 AS cost_basis,
      v.total_valuation AS market_value,
      SAFE_DIVIDE(v.total_valuation, cc.total_called_capital * -1) AS moic,
      CASE WHEN fhi.style = 'Direct' THEN 'Direct' ELSE 'Fund' END AS holding_type,
      CAST(NULL AS STRING) AS end_date
    FROM Valuations v
    LEFT JOIN CalledCapital cc ON v.investment_name = cc.investment_name
    LEFT JOIN Commitments c ON v.investment_name = c.description
    LEFT JOIN FundHoldingsInfo fhi ON v.investment_name = fhi.investment_name
    WHERE v.investment_name NOT LIKE '%Perennial Venture Capital Fund%'
    ORDER BY
      CASE WHEN fhi.style = 'Direct' THEN 1 ELSE 0 END,
      v.total_valuation DESC
    """
    try:
        commitment_rows = await _run_query(commitment_query, params)
    except Exception as exc:
        logger.error("VC holdings query failed", error_message=str(exc)[:500])
        commitment_rows = []

    logger.info("VC detail results", summary_count=len(summary_rows), commitment_count=len(commitment_rows))

    # Compute family's total ownership % from summary rows (sum across all entities)
    # VC holdings are fund-level, so one ownership % applies to all
    family_ownership_pct = sum(float(r.get("ownership_pct", 0) or 0) for r in summary_rows)

    for row in commitment_rows:
        mv = float(row.get("market_value", 0) or 0)
        row["family_ownership_pct"] = round(family_ownership_pct, 6) if family_ownership_pct > 0 else None
        row["client_share_mv"] = round(mv * family_ownership_pct, 2) if family_ownership_pct > 0 else 0

    total_commitment = sum(float(r.get("commitment", 0) or 0) for r in summary_rows)
    total_unfunded = sum(float(r.get("unfunded_commitment", 0) or 0) for r in summary_rows)
    total_nav = sum(float(r.get("ending_net_balance", 0) or 0) for r in summary_rows)

    return {
        "fund_type": "VC",
        "summary": summary_rows,
        "commitments": commitment_rows,
        "totals": {
            "commitment": round(total_commitment, 2),
            "unfunded": round(total_unfunded, 2),
            "nav": round(total_nav, 2),
        },
    }


async def get_private_fund_di_detail(
    report_date: str,
    client_name: str,
) -> dict[str, Any]:
    """DI fund detail: summary for all family entities."""
    from google.cloud import bigquery  # type: ignore[import-untyped]

    params = [
        bigquery.ScalarQueryParameter("report_date", "STRING", report_date),
        bigquery.ScalarQueryParameter("client_name", "STRING", client_name),
    ]

    query = """
    WITH PrivateEntities AS (
      SELECT DISTINCT ssc_entity_name
      FROM `perennial-data-prod.client_reporting.fidelity_ssc_mapping`
      WHERE fidelity_client_name = @client_name
        AND fund = 'DI'
        AND ssc_entity_name <> 'No match found'
    ),
    MaxDate AS (
      SELECT MAX(month_end_date) AS max_date
      FROM `perennial-data-prod.ssc.di_capital_register`
      WHERE month_end_date <= PARSE_DATE('%Y-%m-%d', @report_date)
    ),
    -- Fund-level totals (sum all investors per entity at max date)
    FundTotals AS (
      SELECT
        entity,
        SUM(ending_net_balance) AS fund_nav
      FROM (
        SELECT entity, name, ending_net_balance
        FROM `perennial-data-prod.ssc.di_capital_register`
        WHERE month_end_date = (SELECT max_date FROM MaxDate)
        QUALIFY ROW_NUMBER() OVER(PARTITION BY name, entity, month_end_date ORDER BY add_timestamp DESC) = 1
      )
      GROUP BY entity
    )
    SELECT
      cr.name AS investor_name,
      cr.entity AS fund_entity,
      cr.month_opening_net_capital AS beginning_balance,
      cr.ending_net_balance,
      cr.mtd_contributions AS contributions,
      cr.mtd_redemptions AS distributions,
      cr.net_ror_qtd,
      cr.net_ror_ytd,
      cr.month_end_date,
      ft.fund_nav,
      SAFE_DIVIDE(cr.ending_net_balance, ft.fund_nav) AS ownership_pct
    FROM `perennial-data-prod.ssc.di_capital_register` cr
    CROSS JOIN MaxDate md
    LEFT JOIN FundTotals ft ON cr.entity = ft.entity
    WHERE cr.name IN (SELECT ssc_entity_name FROM PrivateEntities)
      AND cr.month_end_date = md.max_date
    QUALIFY ROW_NUMBER() OVER(PARTITION BY cr.name, cr.entity, cr.month_end_date ORDER BY cr.add_timestamp DESC) = 1
    """
    summary_rows = await _run_query(query, params)

    total_nav = sum(float(r.get("ending_net_balance", 0) or 0) for r in summary_rows)

    return {
        "fund_type": "DI",
        "summary": summary_rows,
        "totals": {
            "nav": round(total_nav, 2),
        },
    }


async def get_private_fund_ra_detail(
    report_date: str,
    client_name: str,
) -> dict[str, Any]:
    """RA fund detail: summary + investment commitments for all family entities."""
    from google.cloud import bigquery  # type: ignore[import-untyped]

    params = [
        bigquery.ScalarQueryParameter("report_date", "STRING", report_date),
        bigquery.ScalarQueryParameter("client_name", "STRING", client_name),
    ]

    # Capital roll summary with fund-level totals for ownership %
    summary_query = """
    WITH PrivateEntities AS (
      SELECT DISTINCT ssc_entity_name
      FROM `perennial-data-prod.client_reporting.fidelity_ssc_mapping`
      WHERE fidelity_client_name = @client_name
        AND fund = 'RA'
        AND ssc_entity_name <> 'No match found'
    ),
    MaxDate AS (
      SELECT MAX(end_date) AS max_date
      FROM `perennial-data-prod.ssc.ra_capital_roll`
      WHERE end_date <= PARSE_DATE('%Y-%m-%d', @report_date)
    ),
    -- Fund-level totals (dedup then sum all partners per entity at max date)
    FundTotals AS (
      SELECT
        entity,
        SUM(ending_balance) AS fund_nav,
        SUM(commitment) AS fund_commitment
      FROM (
        SELECT partner_name, entity, end_date, ending_balance, commitment
        FROM `perennial-data-prod.ssc.ra_capital_roll`
        WHERE end_date = (SELECT max_date FROM MaxDate)
        QUALIFY ROW_NUMBER() OVER(PARTITION BY partner_name, entity, end_date ORDER BY add_timestamp DESC) = 1
      )
      GROUP BY entity
    )
    SELECT
      cr.partner_name,
      cr.entity AS fund_entity,
      cr.commitment,
      cr.unfunded_commitment,
      cr.beginning_balance,
      cr.ending_balance,
      cr.call_investments,
      cr.ror,
      cr.net_irr,
      cr.end_date,
      ft.fund_nav,
      ft.fund_commitment,
      SAFE_DIVIDE(cr.ending_balance, ft.fund_nav) AS ownership_pct,
      SAFE_DIVIDE(cr.commitment, ft.fund_commitment) AS commitment_ownership_pct
    FROM `perennial-data-prod.ssc.ra_capital_roll` cr
    CROSS JOIN MaxDate md
    LEFT JOIN FundTotals ft ON cr.entity = ft.entity
    WHERE cr.partner_name IN (SELECT ssc_entity_name FROM PrivateEntities)
      AND cr.end_date = md.max_date
    QUALIFY ROW_NUMBER() OVER(PARTITION BY cr.partner_name, cr.entity, cr.end_date ORDER BY cr.add_timestamp DESC) = 1
    """
    summary_rows = await _run_query(summary_query, params)

    # Investment commitment detail
    # NOTE: ra_investment_commitment columns: name_currency, re_type, property_type, location,
    #   total_commitment, total_funded, total_unfunded, ending_cost, fmv, ending_fmv, ugl, quarter_end_date
    commitment_query = """
    WITH MaxDate AS (
      SELECT MAX(quarter_end_date) AS max_date
      FROM `perennial-data-prod.ssc.ra_investment_commitment`
      WHERE quarter_end_date <= PARSE_DATE('%Y-%m-%d', @report_date)
    )
    SELECT
      ic.name_currency AS investment,
      ic.re_type,
      ic.property_type,
      ic.location,
      ic.total_commitment AS commitment,
      ic.total_funded,
      ic.total_unfunded AS unfunded,
      ic.ending_cost AS cost_basis,
      ic.fmv AS fair_market_value,
      ic.ending_fmv,
      ic.ugl AS unrealized_gl,
      ic.investment_income,
      ic.quarter_end_date
    FROM `perennial-data-prod.ssc.ra_investment_commitment` ic
    CROSS JOIN MaxDate md
    WHERE ic.quarter_end_date = md.max_date
    QUALIFY ROW_NUMBER() OVER(PARTITION BY ic.name_currency, ic.quarter_end_date ORDER BY ic.add_timestamp DESC) = 1
    ORDER BY ic.fmv DESC NULLS LAST
    """
    commitment_rows = await _run_query(commitment_query, params)

    total_commitment = sum(float(r.get("commitment", 0) or 0) for r in summary_rows)
    total_unfunded = sum(float(r.get("unfunded_commitment", 0) or 0) for r in summary_rows)
    total_nav = sum(float(r.get("ending_balance", 0) or 0) for r in summary_rows)

    # Compute family's total ownership % across all RA entities and add client_share to each commitment
    family_ownership_pct = sum(float(r.get("ownership_pct", 0) or 0) for r in summary_rows)
    for row in commitment_rows:
        row["family_ownership_pct"] = round(family_ownership_pct, 6)
        fmv = float(row.get("fair_market_value", 0) or 0)
        row["client_share_fmv"] = round(fmv * family_ownership_pct, 2)

    return {
        "fund_type": "RA",
        "summary": summary_rows,
        "commitments": commitment_rows,
        "totals": {
            "commitment": round(total_commitment, 2),
            "unfunded": round(total_unfunded, 2),
            "nav": round(total_nav, 2),
        },
    }
