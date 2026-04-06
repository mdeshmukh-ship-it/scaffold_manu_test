"""CIO Portfolio SQL Agent — answers portfolio questions by writing and executing BigQuery SQL.

Flow:
  1. LLM receives the full BigQuery schema + user question
  2. LLM writes a SQL query (or multiple)
  3. Agent validates query (SELECT-only, table allowlist, row limit)
  4. Agent executes against BigQuery
  5. LLM interprets results and answers the user's question
"""

from __future__ import annotations

import json
import re
from typing import Any

from api.llm.client import LLMImage, LLMRequest, generate_text
from api.logging_config import get_logger
from api.services.bigquery_client import _run_query

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Schema (compact representation for the LLM context)
# ---------------------------------------------------------------------------

SCHEMA = """
## BigQuery Schema — perennial-data-prod (VERIFIED 2026-03-30)

### REPORTING VIEWS (PREFERRED — pre-computed, simple single-table SELECTs)

### reporting.daily_account_activity
account_number STRING, date DATE, deposits FLOAT64, withdrawals FLOAT64, dividends FLOAT64, interest FLOAT64, fees FLOAT64, option_premium FLOAT64, net_flows FLOAT64, family_name STRING, entity_name STRING

### reporting.account_monthly_activity
account_number STRING, month_start_date DATE, month_label STRING, date DATE, deposits FLOAT64, withdrawals FLOAT64, dividends FLOAT64, interest FLOAT64, fees FLOAT64, net_flows FLOAT64

### reporting.account_returns
family_name STRING, entity_name STRING, account_number STRING, account_display_name STRING, date DATE, qtd_twror FLOAT64, ytd_twror FLOAT64, trailing_1yr_annualized_twror FLOAT64, trailing_3yr_annualized_twror FLOAT64, itd_annualized_twror FLOAT64
-- ⚠️ ALL TWROR VALUES ARE RAW DECIMALS: 0.0057 = +0.57%, -0.0006 = -0.06%. Multiply by 100 to get percentage. NEVER report raw decimals as percentages.

### reporting.entity_returns
family_name STRING, entity_name STRING, date DATE, qtd_twror FLOAT64, ytd_twror FLOAT64, trailing_1yr_annualized_twror FLOAT64, trailing_3yr_annualized_twror FLOAT64, itd_annualized_twror FLOAT64
-- ⚠️ RAW DECIMALS — same as above.

### reporting.family_returns
family_name STRING, date DATE, mtd_twror FLOAT64, qtd_twror FLOAT64, ytd_twror FLOAT64, itd_cumulative_twror FLOAT64, itd_annualized_twror FLOAT64, trailing_1yr_cumulative_twror FLOAT64, trailing_1yr_annualized_twror FLOAT64, trailing_3yr_cumulative_twror FLOAT64, trailing_3yr_annualized_twror FLOAT64
-- ⚠️ RAW DECIMALS — same as above.

### reporting.account_summary
account_number STRING, account_display_name STRING, entity_name STRING, family_name STRING, date DATE, market_value FLOAT64, account_type STRING, benchmark STRING, established_date DATE

### reporting.entity_ending_values
family_name STRING, entity_name STRING, date DATE, ending_value FLOAT64

### reporting.entity_accounts
account_number STRING, family_name STRING, entity_name STRING, account_display_name STRING, account_type STRING, established_date DATE, benchmark STRING

### reporting.account_holdings
account_number STRING, date DATE, symbol STRING, description STRING, asset_class STRING, market_value FLOAT64, weight_pct FLOAT64

### reporting.account_top_holdings
account_number STRING, date DATE, symbol STRING, description STRING, asset_class STRING, market_value FLOAT64, weight_pct FLOAT64

### reporting.account_type_summaries
account_number STRING, as_of_date DATE, source STRING, metric_name STRING, metric_value_numeric FLOAT64, metric_value_text STRING
-- source: 'parametric', 'pimco', 'quantinno'. Query metric_name for gains/performance by account type.

### reporting.family_asset_class_breakdown
family_name STRING, date DATE, asset_class STRING, market_value FLOAT64

### reporting.entity_asset_class_breakdown
family_name STRING, entity_name STRING, date DATE, asset_class STRING, market_value FLOAT64

### reporting.benchmark_returns
benchmark_name STRING, description STRING, asset_class STRING, date DATE, ytd_return FLOAT64, trailing_1y_return FLOAT64, trailing_3y_return FLOAT64

### reporting.private_fund_returns
fund STRING, entity STRING, date DATE, mtd_twror FLOAT64, qtd_twror FLOAT64, ytd_twror FLOAT64, itd_cumulative_twror FLOAT64, itd_annualized_twror FLOAT64, trailing_1yr_annualized_twror FLOAT64, trailing_3yr_annualized_twror FLOAT64

### reporting.client_config
family_name STRING, display_name STRING, is_active BOOL, report_type STRING, theme STRING, include_dividend_interest_breakout BOOL, commentary_mode STRING, manual_commentary STRING, primary_color STRING, secondary_color STRING, accent_color STRING, logo_gcs_path STRING

### reporting.client_families
family_name STRING

### reporting.family_entities
family_name STRING, entity_name STRING

### reporting.daily_account_values
account_number STRING, date DATE, market_value FLOAT64, family_name STRING, entity_name STRING

### reporting.account_value_history
account_number STRING, date DATE, market_value FLOAT64

### SOURCE TABLES (use when reporting views don't cover the need)

### fidelity.accounts
AccountNumber STRING, PrimaryAccountHolder STRING, FBSIShortName STRING, CustomShortName STRING, ClientName STRING, EstablishedDate DATE, InvestmentProgram STRING, Benchmark STRING

### fidelity.daily_account_market_values
Date DATE, AccountNumber STRING, MarketValue FLOAT64

### fidelity.daily_positions
Date DATE, AccountNumber STRING, AccountType STRING, Symbol STRING, CUSIP STRING, ISIN STRING, ProductCode STRING, SecurityType STRING, SecurityTypeModifier STRING, PrimaryExchange STRING, Description STRING, MarketPrice FLOAT64, TradeDateQuantity FLOAT64, SettlementDateQuantity FLOAT64, PositionMarketValue FLOAT64, CalculatedMarketValue FLOAT64, FixedIncomeAccruedInterest FLOAT64, CurrencyCode STRING

### fidelity.daily_transactions
Date DATE, AccountNumber STRING, KeyCode STRING, TransactionType STRING, TransactionCategory STRING, TransactionSubcategory STRING, BuySellCode STRING, SecurityType STRING, CUSIP STRING, Description STRING, Quantity FLOAT64, Amount FLOAT64, MarketValue FLOAT64, Commission FLOAT64, RunDate DATE, TradeDate DATE, EntryDate DATE

### fidelity.option_proceeds
account_number STRING, underlying_stock STRING, date DATE, call_premium FLOAT64, put_premium FLOAT64, call_notional FLOAT64, put_notional FLOAT64, total_notional FLOAT64, net_generated_amount FLOAT64, add_timestamp TIMESTAMP

### client_reporting.daily_account_activity
Date DATE, AccountNumber STRING, Deposits FLOAT64, Withdrawals FLOAT64, Dividends FLOAT64, Interest FLOAT64, Fees FLOAT64, AddTimestamp STRING
-- NOTE: PascalCase field names. Has Dividends and Interest as SEPARATE columns. No realized/unrealized gains here.

### client_reporting.fidelity_ssc_mapping
fidelity_client_name STRING, fidelity_entity_name STRING, ssc_entity_name STRING, fund STRING, add_timestamp STRING
-- fund column values: 'VC', 'DI', 'RA'. ssc_entity_name = 'No match found' means entity is NOT invested.

### client_reporting.fund_holdings
fund STRING, entity STRING, investment_id STRING, investment_name STRING, style STRING, sub_style STRING, vintage STRING, add_timestamp TIMESTAMP

### returns.daily_liquid_returns
date DATE, account_number STRING, beginning_market_value FLOAT64, desposits FLOAT64, withdrawals FLOAT64, net_capital_flow FLOAT64, ending_market_value FLOAT64, daily_twror FLOAT64, daily_cumulative_twror FLOAT64, add_timestamp TIMESTAMP
-- NOTE: 'desposits' is a TYPO in the schema (missing 'i'). This is baked into BigQuery.
-- ⚠️ daily_twror and daily_cumulative_twror are RAW DECIMALS. 0.005 = +0.5%. Multiply by 100 for percentage.
-- USE THIS TABLE to explain return drivers: daily P&L = daily_twror * beginning_market_value

### returns.monthly_liquid_returns
account_number STRING, month_end_date DATE, monthly_twror FLOAT64, monthly_cumulative_twror FLOAT64, add_timestamp TIMESTAMP

### returns.periodic_liquid_returns
date DATE, account_number STRING, mtd_twror FLOAT64, qtd_twror FLOAT64, ytd_twror FLOAT64, itd_cumulative_twror FLOAT64, itd_annualized_twror FLOAT64, trailing_1yr_cumulative_twror FLOAT64, trailing_1yr_annualized_twror FLOAT64, trailing_3yr_cumulative_twror FLOAT64, trailing_3yr_annualized_twror FLOAT64, add_timestamp TIMESTAMP
-- ⚠️ ALL TWROR VALUES ARE RAW DECIMALS: 0.0057 = +0.57%, -0.0006 = -0.06%. Multiply by 100 to get percentage.
-- NOTE: No trailing_5yr column exists.

### returns.periodic_entity_liquid_returns
date DATE, entity_name STRING, mtd_twror FLOAT64, qtd_twror FLOAT64, ytd_twror FLOAT64, itd_cumulative_twror FLOAT64, itd_annualized_twror FLOAT64, trailing_1yr_cumulative_twror FLOAT64, trailing_1yr_annualized_twror FLOAT64, trailing_3yr_cumulative_twror FLOAT64, trailing_3yr_annualized_twror FLOAT64, add_timestamp TIMESTAMP

### returns.periodic_family_liquid_returns
date DATE, family_name STRING, mtd_twror FLOAT64, qtd_twror FLOAT64, ytd_twror FLOAT64, itd_cumulative_twror FLOAT64, itd_annualized_twror FLOAT64, trailing_1yr_cumulative_twror FLOAT64, trailing_1yr_annualized_twror FLOAT64, trailing_3yr_cumulative_twror FLOAT64, trailing_3yr_annualized_twror FLOAT64, add_timestamp TIMESTAMP

### returns.composite_family_returns
date DATE, family_name STRING, family_beginning_mv FLOAT64, entity_count INT64, mtd_twror FLOAT64, qtd_twror FLOAT64, ytd_twror FLOAT64, itd_cumulative_twror FLOAT64, itd_annualized_twror FLOAT64, trailing_1yr_cumulative_twror FLOAT64, trailing_1yr_annualized_twror FLOAT64, trailing_3yr_cumulative_twror FLOAT64, trailing_3yr_annualized_twror FLOAT64, add_timestamp TIMESTAMP

### returns.composite_entity_returns
date DATE, entity_name STRING, family_name STRING, entity_beginning_mv FLOAT64, liquid_bmv FLOAT64, private_bmv FLOAT64, mtd_twror FLOAT64, qtd_twror FLOAT64, ytd_twror FLOAT64, itd_cumulative_twror FLOAT64, itd_annualized_twror FLOAT64, trailing_1yr_cumulative_twror FLOAT64, trailing_1yr_annualized_twror FLOAT64, trailing_3yr_cumulative_twror FLOAT64, trailing_3yr_annualized_twror FLOAT64, add_timestamp TIMESTAMP

### returns.daily_private_returns
date DATE, fund STRING, entity STRING, lp_name STRING, beginning_market_value FLOAT64, ending_market_value FLOAT64, gain_loss FLOAT64, net_capital_flow FLOAT64, daily_twror FLOAT64, daily_cumulative_twror FLOAT64, add_timestamp TIMESTAMP

### returns.monthly_private_returns
date DATE, fund STRING, entity STRING, lp_name STRING, monthly_twror FLOAT64, monthly_cumulative_twror FLOAT64, add_timestamp TIMESTAMP

### returns.periodic_private_returns
date DATE, fund STRING, entity STRING, lp_name STRING, mtd_twror FLOAT64, qtd_twror FLOAT64, ytd_twror FLOAT64, itd_cumulative_twror FLOAT64, itd_annualized_twror FLOAT64, trailing_1yr_cumulative_twror FLOAT64, trailing_1yr_annualized_twror FLOAT64, trailing_3yr_cumulative_twror FLOAT64, trailing_3yr_annualized_twror FLOAT64, add_timestamp TIMESTAMP

### parametric.portfolio_data (Equity account gains)
client STRING, benchmark STRING, ppa_code STRING, custodian_account_number STRING, st_tax_rate FLOAT64, lt_tax_rate FLOAT64, market_value FLOAT64, number_of_positions INT64, percent_cash FLOAT64, net_realized_gl_ytd_st FLOAT64, net_realized_gl_ytd_lt FLOAT64, unrealized_gl FLOAT64, realized_gl_st FLOAT64, realized_gl_lt FLOAT64, report_date DATE, filename STRING, add_timestamp STRING
-- Join: custodian_account_number = fidelity.accounts.AccountNumber

### parametric.portfolio_performance (Equity pre/after-tax returns)
client STRING, ppa_code STRING, custodian_account_number STRING, inception_date DATE, pre_tax_ytd_portfolio FLOAT64, pre_tax_itd_annualized_portfolio FLOAT64, after_tax_ytd_portfolio FLOAT64, after_tax_ytd_tax_alpha FLOAT64, after_tax_itd_annualized_portfolio FLOAT64, after_tax_itd_annualized_tax_alpha FLOAT64, report_date DATE
-- (32 cols total — key performance cols shown)

### quantinno.account_summary (Long-short account gains)
account_number STRING, account_value FLOAT64, reference STRING, long_leverag_actual FLOAT64, short_leverage_actual FLOAT64, net_leverage_actual FLOAT64, realized_st_gl FLOAT64, realized_lt_gl FLOAT64, tax_savings FLOAT64, unrealized_gl FLOAT64, mtd_realized_gl FLOAT64, as_of_date DATE, add_timestamp TIMESTAMP
-- NOTE: 'long_leverag_actual' is a TYPO (missing 'e'). Always DEDUP: QUALIFY ROW_NUMBER() OVER (PARTITION BY account_number, as_of_date ORDER BY add_timestamp DESC) = 1

### ssc.vc_capital_register
id STRING, name STRING, entity STRING, quarter_end_date DATE, commitment FLOAT64, unfunded_commitment FLOAT64, quarter_opening_net_capital FLOAT64, qtd_contributions FLOAT64, qtd_redemptions FLOAT64, ending_net_balance FLOAT64, net_ror_qtd FLOAT64, net_ror_ytd FLOAT64, net_ror_itd FLOAT64, add_timestamp TIMESTAMP (80 cols total)

### ssc.di_capital_register
name STRING, entity STRING, month_end_date DATE, month_opening_net_capital FLOAT64, mtd_contributions FLOAT64, mtd_redemptions FLOAT64, ending_net_balance FLOAT64, net_ror_qtd FLOAT64, net_ror_ytd FLOAT64, add_timestamp TIMESTAMP (57 cols total)

### ssc.ra_capital_roll
partner_name STRING, entity STRING, end_date DATE, commitment FLOAT64, unfunded_commitment FLOAT64, beginning_balance FLOAT64, call_investments FLOAT64, ending_balance FLOAT64, ror FLOAT64, net_irr FLOAT64, gross_irr FLOAT64, add_timestamp TIMESTAMP (32 cols total)

### ssc.vc_transaction
entity STRING, investment_id STRING, investment_name STRING, class_id STRING, localcurrency STRING, effectivedate DATE, amount FLOAT64, transaction_type STRING, report_date DATE

### ssc.ra_transaction
entity STRING, investment_id STRING, investment_name STRING, effectivedate DATE, amount FLOAT64, transaction_type STRING, report_date STRING

### ssc.di_transaction_history
entity STRING, investment STRING, trade_date DATE, txn_type STRING, net_amount STRING (95 cols total)

### caissa.benchmarks
id STRING, short_name STRING, description STRING, asset_class STRING

### caissa.benchmark_summary_returns
benchmark_id STRING, date DATE, ytd_return FLOAT64, trailing_1y_return FLOAT64, trailing_3y_return FLOAT64
-- Join: caissa.benchmarks.id = caissa.benchmark_summary_returns.benchmark_id

### rebalancer.portfolio_targets
family_name STRING, category STRING, label STRING, target_weight FLOAT64, run_by STRING, load_timestamp STRING

## Key Relationships
- fidelity.accounts.AccountNumber joins to most fidelity.* and returns.*.account_number
- fidelity.accounts.ClientName = family_name in reporting views
- fidelity.accounts.PrimaryAccountHolder = entity_name in reporting/returns tables
- client_reporting.fidelity_ssc_mapping bridges Fidelity entities to SSC fund data (fund = 'VC'/'DI'/'RA')
- parametric.portfolio_data.custodian_account_number = fidelity.accounts.AccountNumber (Equity accounts)
- quantinno.account_summary.account_number = fidelity.accounts.AccountNumber (Long-Short accounts)
- Private returns keyed by fund + entity (NOT account_number)
- All tables are in project `perennial-data-prod`
- Always fully qualify tables: `perennial-data-prod.dataset.table`

## IMPORTANT RULES
- PREFER reporting.* views — they handle joins, bridge tables, and date alignment automatically.
- reporting views use snake_case (account_number, deposits). Source tables use PascalCase (AccountNumber, Deposits).
- Dividends and Interest are SEPARATE columns (not combined as DividendsInterest).
- There is NO RealizedGainLoss or UnrealizedGainLoss in daily_account_activity. Use parametric.portfolio_data or quantinno.account_summary instead.
- There is NO trailing_5yr column. Only trailing_1yr and trailing_3yr exist.
- The 'desposits' column in returns.daily_liquid_returns is a TYPO — use it as-is.
- Always DEDUP quantinno.account_summary with ROW_NUMBER() OVER (PARTITION BY account_number, as_of_date ORDER BY add_timestamp DESC) = 1

## ⚠️ CRITICAL: RETURN VALUE FORMAT
ALL TWROR columns (qtd_twror, ytd_twror, daily_twror, itd_cumulative_twror, etc.) are stored as RAW DECIMALS, NOT percentages.
- 0.0057 means +0.57% (NOT 5.7%)
- -0.0006 means -0.06% (NOT -0.6% and NOT -6%)
- 0.7228 means +72.28%
- 1.5 means +150%
To convert: multiply by 100 to get percentage.
BEST PRACTICE: Do the conversion IN YOUR SQL so the LLM sees percentage values directly:
  SELECT qtd_twror * 100 AS qtd_pct, ytd_twror * 100 AS ytd_pct, itd_annualized_twror * 100 AS itd_ann_pct
This way you never risk misinterpreting raw decimals.

## ⚠️ CRITICAL: ZERO-BALANCE BLOWUP ARTIFACTS
Some accounts pass through zero market value (e.g. account temporarily emptied then refunded). When this happens, the chain-linked cumulative TWROR produces EXTREME values (e.g. 33,000%, 500%, etc.) that are DATA ARTIFACTS, not real returns.
RULES:
- ANY daily_twror with ABS value > 0.5 (50%) is almost certainly a data artifact — EXCLUDE it with: AND ABS(daily_twror) < 0.5
- ANY itd_cumulative_twror or itd_annualized_twror > 2.0 (200%) for a liquid SMA account is suspicious — flag it as a potential data artifact
- NEVER report multi-thousand-percent returns as real performance
- When filtering daily returns, always add: WHERE daily_twror IS NOT NULL AND ABS(daily_twror) < 0.5
- For periodic returns, add: WHERE ABS(itd_annualized_twror) < 2.0 OR itd_annualized_twror IS NULL to exclude blown-up accounts
- If a user asks about a SPECIFIC account's return, focus ONLY on that account — do NOT include other accounts' blown-up values
""".strip()

# ---------------------------------------------------------------------------
# Safety guardrails
# ---------------------------------------------------------------------------

ALLOWED_DATASETS = {"fidelity", "returns", "ssc", "client_reporting", "rebalancer", "reporting", "parametric", "quantinno", "pimco", "caissa"}

_FORBIDDEN_KEYWORDS = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|MERGE|GRANT|REVOKE|EXEC|EXECUTE)\b",
    re.IGNORECASE,
)

_TABLE_PATTERN = re.compile(
    r"`perennial-data-prod\.(\w+)\.\w+`"
)


def validate_sql(sql: str) -> tuple[bool, str]:
    """Validate a SQL query for safety. Returns (is_valid, reason)."""
    # Strip leading SQL comments (-- ...) before checking
    lines = sql.strip().rstrip(";").split("\n")
    cleaned_lines = [ln for ln in lines if not ln.strip().startswith("--")]
    cleaned = "\n".join(cleaned_lines).strip()
    if not cleaned:
        return False, "Query is empty after stripping comments."

    # Must be a SELECT
    if not cleaned.upper().lstrip().startswith("SELECT"):
        return False, "Only SELECT queries are allowed."

    # No forbidden keywords
    if _FORBIDDEN_KEYWORDS.search(cleaned):
        match = _FORBIDDEN_KEYWORDS.search(cleaned)
        return False, f"Forbidden keyword: {match.group(0) if match else 'unknown'}"

    # Check table references are in allowed datasets
    datasets_used = _TABLE_PATTERN.findall(cleaned)
    for ds in datasets_used:
        if ds not in ALLOWED_DATASETS:
            return False, f"Dataset '{ds}' is not allowed."

    # Must have a LIMIT (we'll add one if missing)
    return True, "OK"


def ensure_limit(sql: str, max_rows: int = 100) -> str:
    """Add LIMIT clause if not present."""
    cleaned = sql.strip().rstrip(";")
    if not re.search(r"\bLIMIT\s+\d+", cleaned, re.IGNORECASE):
        cleaned += f"\nLIMIT {max_rows}"
    return cleaned


# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

SQL_SYSTEM_PROMPT = f"""You are a senior portfolio data analyst. Given a user's question about their investment portfolio, write BigQuery SQL to fetch the relevant data.

{SCHEMA}

## Rules
1. ALWAYS fully qualify table names: `perennial-data-prod.dataset.table`
2. ALWAYS include a LIMIT clause (max 100 rows)
3. Only write SELECT queries — never modify data
4. Filter by the provided client_name/accounts when relevant
5. Use DATE functions for date filtering: PARSE_DATE, DATE_SUB, DATE_TRUNC, etc.
6. PREFER reporting.* views — they are pre-computed and handle joins automatically. Use source tables only when reporting views don't have the data.
7. For dividends/interest income, use `reporting.daily_account_activity` (columns: dividends, interest) or `reporting.account_monthly_activity`.
8. For realized/unrealized gains, use `parametric.portfolio_data` (Equity: net_realized_gl_ytd_st, net_realized_gl_ytd_lt, unrealized_gl) or `quantinno.account_summary` (Long-Short: realized_st_gl, realized_lt_gl, unrealized_gl). These are NOT in daily_account_activity.
9. For account-level performance, use `reporting.account_returns` (qtd_twror, ytd_twror, trailing_1yr_annualized_twror, itd_annualized_twror).
9a. When the user says "what is driving X% return" or "why is the return X%", do NOT query returns tables to verify the number. The user already knows the return from the dashboard. Instead query HOLDINGS (what the account owns), TRANSACTIONS (what trades happened), and INCOME (dividends/interest) to explain the drivers.
10. For investment earnings: Earnings = Ending Value - Beginning Value - Net Flows. Use `reporting.entity_ending_values` for values and `reporting.daily_account_activity` for flows.
11. You may write up to 3 queries if the question requires multiple data sources
12. Return ONLY the SQL queries, separated by "---" on its own line if multiple
13. No explanations, just SQL

## CRITICAL SQL PATTERNS — follow these exactly

### Always show friendly account names
Always JOIN to `fidelity.accounts` and include `a.CustomShortName AS account_name` (or `a.FBSIShortName`). NEVER return bare account numbers without a name.

### Parametric / PIMCO / Quantinno date matching
These tables do NOT have data for every date and data may only exist AFTER the report date. NEVER use exact date match. ALWAYS use sub-select for the CLOSEST available date (try <= first, but if you suspect no data exists before the report date, use the global MAX date instead):
For example:
AND p.report_date = (SELECT MAX(report_date) FROM `perennial-data-prod.parametric.portfolio_data` WHERE custodian_account_number = p.custodian_account_number AND report_date <= @target_date)
If that returns nothing, fall back to: AND p.report_date = (SELECT MAX(report_date) FROM `perennial-data-prod.parametric.portfolio_data` WHERE custodian_account_number = p.custodian_account_number)
For simplicity, you can just use the global MAX(date) without filtering by <= report_date — this ensures data is always returned.

### Quantinno QUALIFY syntax
QUALIFY goes AFTER WHERE with NO "AND" prefix. Correct:
```
WHERE a.ClientName = 'X'
QUALIFY ROW_NUMBER() OVER (PARTITION BY q.account_number ORDER BY q.add_timestamp DESC) = 1
```
WRONG: `AND QUALIFY ...` — this is a syntax error.

### Realized/Unrealized Gains — use up to 3 queries for different account types
QUERY A (Equity/Parametric — use global MAX date for robustness):
SELECT a.CustomShortName AS account_name, p.custodian_account_number, p.net_realized_gl_ytd_st, p.net_realized_gl_ytd_lt, p.unrealized_gl, p.market_value, p.report_date FROM `perennial-data-prod.parametric.portfolio_data` p JOIN `perennial-data-prod.fidelity.accounts` a ON p.custodian_account_number = a.AccountNumber WHERE a.ClientName = @client_name AND p.report_date = (SELECT MAX(report_date) FROM `perennial-data-prod.parametric.portfolio_data`) LIMIT 100

QUERY B (Long-Short/Quantinno — use global MAX date for robustness):
SELECT a.CustomShortName AS account_name, q.account_number, q.realized_st_gl, q.realized_lt_gl, q.unrealized_gl, q.account_value, q.tax_savings, q.as_of_date FROM `perennial-data-prod.quantinno.account_summary` q JOIN `perennial-data-prod.fidelity.accounts` a ON q.account_number = a.AccountNumber WHERE a.ClientName = @client_name AND q.as_of_date = (SELECT MAX(as_of_date) FROM `perennial-data-prod.quantinno.account_summary`) QUALIFY ROW_NUMBER() OVER (PARTITION BY q.account_number ORDER BY q.add_timestamp DESC) = 1 LIMIT 100

QUERY C (Muni/Fixed Income/PIMCO — UNION both PIMCO tables):
SELECT a.CustomShortName AS account_name, p.account_number, p.total_market_value, p.strategy, p.effective_duration, p.current_yield, p.net_ytd_returns, p.net_since_inception_annualized_returns, p.report_date FROM `perennial-data-prod.pimco.monthly_multiple_portfolio_reports` p JOIN `perennial-data-prod.fidelity.accounts` a ON p.account_number = a.AccountNumber WHERE a.ClientName = @client_name AND p.report_date = (SELECT MAX(report_date) FROM `perennial-data-prod.pimco.monthly_multiple_portfolio_reports`) LIMIT 100

### Return driver analysis — HOW to explain what drove returns
When asked "why" or "what drove" a return, use these queries:

DAILY P&L BREAKDOWN (which days drove QTD/YTD return — ALWAYS filter out artifacts):
SELECT a.CustomShortName AS account_name, r.date, r.daily_twror * 100 AS daily_return_pct, r.daily_twror * r.beginning_market_value AS daily_pnl_dollars, r.beginning_market_value, r.ending_market_value FROM `perennial-data-prod.returns.daily_liquid_returns` r JOIN `perennial-data-prod.fidelity.accounts` a ON r.account_number = a.AccountNumber WHERE a.ClientName = @client_name AND r.date BETWEEN DATE_TRUNC(PARSE_DATE('%Y-%m-%d', @report_date), QUARTER) AND PARSE_DATE('%Y-%m-%d', @report_date) AND r.account_number = @account_number AND r.daily_twror IS NOT NULL AND ABS(r.daily_twror) < 0.5 AND r.beginning_market_value > 1000 ORDER BY ABS(r.daily_twror) DESC LIMIT 20

POSITION-LEVEL HOLDINGS (what the account holds):
SELECT a.CustomShortName AS account_name, p.Symbol, p.Description, p.PositionMarketValue, p.SecurityType FROM `perennial-data-prod.fidelity.daily_positions` p JOIN `perennial-data-prod.fidelity.accounts` a ON p.AccountNumber = a.AccountNumber WHERE a.ClientName = @client_name AND p.AccountNumber = @account_number AND p.Date = (SELECT MAX(Date) FROM `perennial-data-prod.fidelity.daily_positions` WHERE Date <= PARSE_DATE('%Y-%m-%d', @report_date) AND AccountNumber = @account_number) AND p.SecurityType NOT IN (' ', '8') ORDER BY p.PositionMarketValue DESC LIMIT 20

TRANSACTIONS IN PERIOD (what trades happened):
SELECT a.CustomShortName AS account_name, t.Date, t.TransactionType, t.Description, t.Amount, t.Quantity FROM `perennial-data-prod.fidelity.daily_transactions` t JOIN `perennial-data-prod.fidelity.accounts` a ON t.AccountNumber = a.AccountNumber WHERE a.ClientName = @client_name AND t.AccountNumber = @account_number AND t.Date BETWEEN DATE_TRUNC(PARSE_DATE('%Y-%m-%d', @report_date), QUARTER) AND PARSE_DATE('%Y-%m-%d', @report_date) ORDER BY ABS(t.Amount) DESC LIMIT 20

INCOME IN PERIOD (dividends + interest driving return):
SELECT account_number, SUM(dividends) * 100 AS total_dividends, SUM(interest) AS total_interest, SUM(fees) AS total_fees FROM `perennial-data-prod.reporting.daily_account_activity` WHERE family_name = @client_name AND date BETWEEN DATE_TRUNC(PARSE_DATE('%Y-%m-%d', @report_date), QUARTER) AND PARSE_DATE('%Y-%m-%d', @report_date) GROUP BY account_number

ITD RETURN EXPLANATION: When asked about ITD returns:
1. Focus ONLY on the specific account asked about — do NOT pull in other accounts
2. TRUST the user's stated return number — do NOT contradict it
3. To explain drivers, query: (a) current holdings to see asset allocation, (b) total dividends+interest earned since inception, (c) account market value history to show growth pattern, (d) largest transactions
4. For a Holding account with high ITD: returns are typically driven by money market yields, dividend reinvestment, and cash sweep interest compounding over time
5. Use `reporting.account_returns` for returns data (filtered/clean), `reporting.daily_account_activity` for income, `reporting.account_holdings` for current positions
6. If your query returns an ITD > 200%, it is a data artifact — do NOT report it. Instead say "the return data for this account may be affected by a zero-balance period" and focus on explaining with income/transaction data instead

### Transaction types in context
- BUY/PURCHASE can include: rebalancing, reinvestment of dividends, tax-loss harvesting replacement, or liquidity management (buying money-market/cash-equivalent securities to park capital)
- SELL can include: rebalancing, tax-loss harvesting, withdrawal funding, or distribution
- TRANSFER: movement between accounts within the same family — NOT a withdrawal
- When explaining transactions, always consider the SecurityType and Description to determine purpose
"""

ANSWER_SYSTEM_PROMPT = """You are a senior CIO analyst assistant for a wealth management firm. Be CONCISE — aim for 150 words or less unless the question demands detail.

Rules:
- Lead with the key number or insight. No preamble.
- Use bullet points. Skip lengthy explanations.
- Format dollars as $X.XK, $X.XM, or $X.XB. Percentages to 2 decimals.
- ⚠️ TWROR values from BigQuery are RAW DECIMALS: 0.0057 = 0.57%, NOT 5.7%. A value of -0.0006 is -0.06%, NOT -6%. ALWAYS multiply by 100 before presenting. Double-check your math.
- ⚠️ Returns > 200% annualized or daily moves > 50% are ZERO-BALANCE DATA ARTIFACTS — never report them as real. Say "data artifact from zero-balance period" and exclude from analysis.
- When asked about a SPECIFIC account, answer about THAT account only. Do not mix in other accounts' data.
- ⚠️ NEVER contradict the user's stated return from the dashboard. If the user says "ITD is 72.28%", USE 72.28% in your answer. Do NOT query returns tables to "verify" — the dashboard number is authoritative. Focus ONLY on explaining WHY that return occurred using positions, transactions, and income data.
- When a user asks "what is driving X% return", do NOT query returns/TWROR tables. Instead query: (1) current holdings, (2) transactions in the period, (3) dividends/interest income. These explain the DRIVERS, not the return number itself.
- ALWAYS use account display names (e.g. "Smith Equity"), not raw account numbers.
- If a query returned 0 rows, that account type simply doesn't exist for this family — do NOT say "data is missing" or "query returned no results." Just omit it and show what IS available.
- If ALL queries returned 0 rows, say "No external manager data available for this family" in one line.
- When discussing returns, specify the time period.
- Provide 1-2 actionable insights max.

Transaction context:
- BUY of money market (FRGXX, SPAXX) = liquidity management / cash parking
- SELL + BUY of similar = tax-loss harvesting
- TRANSFER between accounts = internal movement, not a real flow
- Dividends/interest reinvestment = automatic, not deliberate
"""


# ---------------------------------------------------------------------------
# Agent entry point
# ---------------------------------------------------------------------------

async def run_agent(
    *,
    user_message: str,
    report_date: str,
    client_name: str,
    accounts: list[str] | None,
    context_data: dict[str, Any] | None = None,
    images: list[dict[str, str]] | None = None,
    conversation_history: list[dict[str, str]] | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    """Run the SQL agent: write SQL → validate → execute → answer.

    Supports optional images (base64) and dashboard context_data.
    """
    from api.settings import get_settings
    settings = get_settings()

    if provider is None:
        if settings.anthropic_api_key:
            provider = "anthropic"
            model = model or "claude-sonnet-4-20250514"
        elif settings.openai_api_key:
            provider = "openai"
            model = model or "gpt-4o"
        else:
            provider = settings.llm_provider
            model = model or settings.llm_model

    # Build LLMImage objects from base64 image data
    llm_images: list[LLMImage] | None = None
    if images:
        llm_images = []
        for img in images[:3]:  # Max 3 images
            data = img.get("data", "")
            media_type = img.get("media_type", "image/png")
            if data:
                llm_images.append(LLMImage(data=data, media_type=media_type))
        if not llm_images:
            llm_images = None

    # Build conversation context
    history_str = ""
    if conversation_history:
        turns = []
        for msg in conversation_history[-6:]:
            role = msg.get("role", "user")
            content = msg.get("content", "")[:800]
            turns.append(f"{role.upper()}: {content}")
        history_str = "\n\nCONVERSATION HISTORY:\n" + "\n".join(turns)

    # Build dashboard context string from filters + visible data
    dashboard_str = ""
    if context_data:
        parts = []
        if context_data.get("active_tab"):
            parts.append(f"Active Tab: {context_data['active_tab']}")
        if context_data.get("selected_entities"):
            ents = context_data["selected_entities"]
            parts.append(f"Selected Entities: {', '.join(ents) if isinstance(ents, list) else ents}")
        if context_data.get("total_mv") is not None:
            parts.append(f"Total Portfolio MV: ${context_data['total_mv']:,.2f}" if isinstance(context_data['total_mv'], (int, float)) else f"Total Portfolio MV: {context_data['total_mv']}")
        if context_data.get("account_count") is not None:
            parts.append(f"Number of Accounts: {context_data['account_count']}")
        if context_data.get("account_summary"):
            summary = context_data["account_summary"]
            summary_str = json.dumps(summary, default=str)[:1500]
            parts.append(f"Account Summary (QTD): {summary_str}")
        if context_data.get("asset_class_breakdown"):
            ac = context_data["asset_class_breakdown"]
            ac_str = json.dumps(ac, default=str)[:800]
            parts.append(f"Asset Class Breakdown: {ac_str}")
        if context_data.get("top_positions"):
            pos = context_data["top_positions"]
            pos_str = json.dumps(pos, default=str)[:3000]
            parts.append(f"Current Positions (top by value): {pos_str}")
        if context_data.get("recent_transactions"):
            txn = context_data["recent_transactions"]
            txn_str = json.dumps(txn, default=str)[:3000]
            parts.append(f"Recent Transactions (QTD, largest first): {txn_str}")
        if parts:
            dashboard_str = "\n\nDASHBOARD CONTEXT (user is currently viewing):\n" + "\n".join(parts)

    has_images_str = ""
    if llm_images:
        has_images_str = f"\n\nThe user has attached {len(llm_images)} screenshot(s)/image(s). Look at the image(s) carefully to understand what the user is asking about."

    accounts_str = ", ".join(accounts) if accounts else "All"

    # ---- STEP 1: Generate SQL ----
    sql_prompt = f"""Client: {client_name}
Report Date: {report_date}
Account Numbers: {accounts_str}
{dashboard_str}{history_str}{has_images_str}

USER QUESTION: {user_message}"""

    try:
        sql_response = await generate_text(
            op="agent.sql",
            request=LLMRequest(
                system_prompt=SQL_SYSTEM_PROMPT,
                user_prompt=sql_prompt,
                temperature=0.0,
                max_output_tokens=1500,
                images=llm_images,
            ),
            provider=provider,
            model=model,
        )
    except Exception as exc:
        logger.error("Agent SQL generation failed", event_type="agent.error", severity="ERROR", error_message=str(exc)[:256])
        return {
            "answer": f"I couldn't generate a query: {str(exc)[:200]}",
            "sql_queries": [],
            "tools_used": [],
            "provider": provider or "unknown",
            "model": model or "unknown",
        }

    # Parse SQL queries (split by ---)
    raw_sql = sql_response.text.strip()
    # Strip markdown code fences
    if "```" in raw_sql:
        blocks = re.findall(r"```(?:sql)?\s*(.*?)```", raw_sql, re.DOTALL)
        if blocks:
            raw_sql = "\n---\n".join(blocks)

    sql_queries = [q.strip() for q in raw_sql.split("---") if q.strip()]
    sql_queries = sql_queries[:3]  # Max 3 queries

    logger.info(
        "Agent generated SQL",
        event_type="agent.sql",
        severity="INFO",
        query_count=len(sql_queries),
        question_preview=user_message[:100],
    )

    # ---- STEP 2: Validate and execute ----
    query_results: list[dict[str, Any]] = []
    executed_queries: list[str] = []

    for i, sql in enumerate(sql_queries):
        is_valid, reason = validate_sql(sql)
        if not is_valid:
            logger.warning(
                "Agent query rejected",
                event_type="agent.validate",
                severity="WARNING",
                query_index=i,
                reason=reason,
                sql_preview=sql[:200],
            )
            query_results.append({"query_index": i, "error": f"Query rejected: {reason}", "sql": sql})
            continue

        safe_sql = ensure_limit(sql)
        executed_queries.append(safe_sql)

        try:
            rows = await _run_query(safe_sql)
            # Truncate large results
            if len(rows) > 100:
                rows = rows[:100]
            query_results.append({
                "query_index": i,
                "row_count": len(rows),
                "data": rows,
            })
        except Exception as exc:
            query_results.append({
                "query_index": i,
                "error": f"Query failed: {str(exc)[:300]}",
                "sql": safe_sql,
            })

    # ---- STEP 2.5: Post-process results to cap extreme return values ----
    # Zero-balance blowup produces extreme TWROR values (e.g. 33000%).
    # Cap them before the LLM sees them to prevent wrong analysis.
    RETURN_KEYS = {
        "qtd_twror", "ytd_twror", "mtd_twror", "daily_twror",
        "itd_cumulative_twror", "itd_annualized_twror",
        "trailing_1yr_annualized_twror", "trailing_1yr_cumulative_twror",
        "trailing_3yr_annualized_twror", "trailing_3yr_cumulative_twror",
        "daily_cumulative_twror", "monthly_twror", "monthly_cumulative_twror",
        "one_year_twror", "three_year_twror", "inception_twror",
        "qtd_pct", "ytd_pct", "itd_ann_pct", "itd_cum_pct",
        "daily_return_pct",
    }
    for qr in query_results:
        if "data" not in qr:
            continue
        for row in qr["data"]:
            for key in list(row.keys()):
                if key.lower() in RETURN_KEYS or key.lower().endswith("_twror") or key.lower().endswith("_pct"):
                    val = row[key]
                    if isinstance(val, (int, float)):
                        # Raw decimal: annualized > 0.50 (50%) is suspicious for liquid SMA
                        if not key.lower().endswith("_pct") and abs(val) > 0.50:
                            row[key] = None  # Remove artifact
                        # Already percentage: > 50% is suspicious
                        elif key.lower().endswith("_pct") and abs(val) > 50:
                            row[key] = None  # Remove artifact

    # ---- STEP 3: Generate answer ----
    results_text = json.dumps(query_results, default=str)
    # Truncate if too large
    if len(results_text) > 15000:
        results_text = results_text[:15000] + "\n... [truncated]"

    answer_prompt = f"""Client: {client_name}
Report Date: {report_date}
Accounts: {accounts_str}
{dashboard_str}

SQL QUERIES EXECUTED:
{chr(10).join(f"Query {i+1}: {q}" for i, q in enumerate(executed_queries))}

QUERY RESULTS:
{results_text}
{history_str}{has_images_str}

USER QUESTION: {user_message}

Answer concisely. Lead with key numbers. Skip queries that returned 0 rows — just omit those account types. If the user attached screenshots, reference what you see."""

    try:
        answer_response = await generate_text(
            op="agent.answer",
            request=LLMRequest(
                system_prompt=ANSWER_SYSTEM_PROMPT,
                user_prompt=answer_prompt,
                temperature=0.2,
                max_output_tokens=800,
                images=llm_images,
            ),
            provider=provider,
            model=model,
        )
        return {
            "answer": answer_response.text,
            "sql_queries": executed_queries,
            "tools_used": [f"sql_query_{i+1}" for i in range(len(executed_queries))],
            "provider": answer_response.provider,
            "model": answer_response.model,
        }
    except Exception as exc:
        logger.error("Agent answer failed", event_type="agent.error", severity="ERROR", error_message=str(exc)[:256])
        # Still return query results even if answer generation fails
        fallback = "I fetched the data but couldn't generate an analysis. Here are the raw results:\n\n"
        for qr in query_results:
            if "data" in qr:
                fallback += f"**Query {qr['query_index'] + 1}**: {qr['row_count']} rows returned\n"
                # Show first few rows
                for row in qr["data"][:5]:
                    fallback += f"  {row}\n"
            elif "error" in qr:
                fallback += f"**Query {qr['query_index'] + 1}**: {qr['error']}\n"
        return {
            "answer": fallback,
            "sql_queries": executed_queries,
            "tools_used": [f"sql_query_{i+1}" for i in range(len(executed_queries))],
            "provider": provider or "unknown",
            "model": model or "unknown",
        }
