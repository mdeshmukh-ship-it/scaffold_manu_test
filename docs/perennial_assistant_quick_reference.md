---
name: Perennial Assistant Quick Reference
description: Ready-to-use queries and field mappings for the portfolio assistant. Covers daily account activity (correct field names), realized/unrealized gains by account type, dividend/interest data, and account-level performance metrics across all sources.
---

# Perennial Assistant Quick Reference

This document provides the portfolio assistant with working queries, correct field names, and exact table-to-metric mappings for the three most common data needs.

---

## 1. Daily Account Activity — Correct Field Names

### Source Table: `client_reporting.daily_account_activity`

| Column | Type | Description |
|--------|------|-------------|
| `Date` | DATE | Activity date |
| `AccountNumber` | STRING | Fidelity account number |
| `Deposits` | FLOAT64 | Cash deposited (positive) |
| `Withdrawals` | FLOAT64 | Cash withdrawn (negative) |
| `Dividends` | FLOAT64 | Dividend income received |
| `Interest` | FLOAT64 | Interest income received |
| `Fees` | FLOAT64 | Fees charged (negative) |
| `AddTimestamp` | STRING | Row load timestamp |

**⚠️ Field name casing:** Source table uses PascalCase (`AccountNumber`, `Deposits`, etc.).

### Reporting View: `reporting.daily_account_activity` (PREFERRED)

| Column | Type | Description |
|--------|------|-------------|
| `account_number` | STRING | Fidelity account number |
| `date` | DATE | Activity date |
| `deposits` | FLOAT64 | Cash deposited |
| `withdrawals` | FLOAT64 | Cash withdrawn |
| `dividends` | FLOAT64 | Dividend income |
| `interest` | FLOAT64 | Interest income |
| `fees` | FLOAT64 | Fees charged |
| `option_premium` | FLOAT64 | Net option premium (from `client_reporting.daily_option_premium`) |
| `net_flows` | FLOAT64 | Pre-computed: deposits + withdrawals |
| `family_name` | STRING | Client family name |
| `entity_name` | STRING | Entity/individual name |

**⚠️ Field name casing:** Reporting view uses snake_case (`account_number`, `deposits`, etc.).

### Working Queries — Daily Activity

#### Total dividends and interest for a family in a period
```sql
SELECT
  account_number,
  SUM(dividends) AS total_dividends,
  SUM(interest) AS total_interest,
  SUM(fees) AS total_fees,
  SUM(deposits) AS total_deposits,
  SUM(withdrawals) AS total_withdrawals,
  SUM(option_premium) AS total_option_premium,
  SUM(net_flows) AS total_net_flows
FROM `perennial-data-prod.reporting.daily_account_activity`
WHERE family_name = @family_name
  AND date BETWEEN @report_start_date AND @report_end_date
GROUP BY account_number
```

#### Dividends + interest breakdown by entity
```sql
SELECT
  entity_name,
  SUM(dividends) AS total_dividends,
  SUM(interest) AS total_interest,
  SUM(dividends) + SUM(interest) AS total_income
FROM `perennial-data-prod.reporting.daily_account_activity`
WHERE family_name = @family_name
  AND date BETWEEN @report_start_date AND @report_end_date
GROUP BY entity_name
ORDER BY total_income DESC
```

#### Monthly activity rollup for a family
```sql
SELECT
  account_number,
  month_start_date,
  month_label,
  deposits,
  withdrawals,
  dividends,
  interest,
  fees,
  net_flows
FROM `perennial-data-prod.reporting.account_monthly_activity`
WHERE account_number IN (
  SELECT account_number FROM `perennial-data-prod.reporting.entity_accounts`
  WHERE family_name = @family_name
)
  AND date BETWEEN @report_start_date AND @report_end_date
ORDER BY account_number, month_start_date
```

#### Investment earnings formula (using reporting views)
```sql
WITH beginning AS (
  SELECT SUM(ending_value) AS beg_value
  FROM `perennial-data-prod.reporting.entity_ending_values`
  WHERE family_name = @family_name
    AND date = @beginning_date
),
ending AS (
  SELECT SUM(ending_value) AS end_value
  FROM `perennial-data-prod.reporting.entity_ending_values`
  WHERE family_name = @family_name
    AND date = @ending_date
),
flows AS (
  SELECT SUM(net_flows) AS total_net_flows
  FROM `perennial-data-prod.reporting.daily_account_activity`
  WHERE family_name = @family_name
    AND date BETWEEN @report_start_date AND @report_end_date
)
SELECT
  ending.end_value AS ending_value,
  beginning.beg_value AS beginning_value,
  flows.total_net_flows AS net_flows,
  ending.end_value - beginning.beg_value - flows.total_net_flows AS investment_earnings
FROM beginning, ending, flows
```

---

## 2. Realized Gains, Unrealized Gains, and Dividend/Interest Data

Data for gains/losses lives in **different tables depending on account type**. Use `reporting.entity_accounts.account_type` to determine which source to query.

### Quick Lookup: Where Gains Data Lives

| Account Type | Source Table | Realized G/L Fields | Unrealized G/L Fields |
|---|---|---|---|
| **Equity** (Parametric) | `parametric.portfolio_data` | `net_realized_gl_ytd_st`, `net_realized_gl_ytd_lt`, `realized_gl_st`, `realized_gl_lt` | `unrealized_gl` |
| **Muni/Fixed Income** (PIMCO) | `pimco.monthly_multiple_portfolio_reports` + `pimco.monthly_portfolio_report` | N/A (returns-based) | N/A (returns-based) |
| **Long-Short** (Quantinno) | `quantinno.account_summary` | `realized_st_gl`, `realized_lt_gl`, `mtd_realized_gl` | `unrealized_gl` |
| **Holding** accounts | `fidelity.daily_positions` | N/A (no external manager) | Computed from position values |
| **All account types** | `reporting.account_type_summaries` | Via `metric_name` lookup | Via `metric_name` lookup |

### Reporting View: `reporting.account_type_summaries` (UNIFIED)

This view normalizes all external manager data into a key-value format:

| Column | Type | Description |
|--------|------|-------------|
| `account_number` | STRING | Account |
| `as_of_date` | DATE | Report date |
| `source` | STRING | Data source: `'parametric'`, `'pimco'`, `'quantinno'` |
| `metric_name` | STRING | Metric key (see below) |
| `metric_value_numeric` | FLOAT64 | Numeric value |
| `metric_value_text` | STRING | Text value |

### Working Queries — Realized & Unrealized Gains

#### Equity account gains (Parametric — direct)
```sql
SELECT
  a.CustomShortName AS account_name,
  pd.market_value,
  pd.number_of_positions,
  pd.net_realized_gl_ytd_st,
  pd.net_realized_gl_ytd_lt,
  pd.net_realized_gl_ytd_st + pd.net_realized_gl_ytd_lt AS total_realized_gl_ytd,
  pd.unrealized_gl
FROM `perennial-data-prod.fidelity.accounts` a
JOIN `perennial-data-prod.parametric.portfolio_data` pd
  ON a.AccountNumber = pd.custodian_account_number
WHERE a.AccountNumber = @account_number
  AND pd.report_date = (
    SELECT MAX(report_date) FROM `perennial-data-prod.parametric.portfolio_data`
    WHERE custodian_account_number = @account_number
      AND report_date <= @report_end_date
  )
```

#### Long-short account gains (Quantinno — direct)
```sql
SELECT
  a.CustomShortName AS account_name,
  q.account_value,
  q.realized_st_gl,
  q.realized_lt_gl,
  q.realized_st_gl + q.realized_lt_gl AS total_realized_gl,
  q.unrealized_gl,
  q.tax_savings,
  q.mtd_realized_gl
FROM `perennial-data-prod.quantinno.account_summary` q
JOIN `perennial-data-prod.fidelity.accounts` a
  ON q.account_number = a.AccountNumber
WHERE a.AccountNumber = @account_number
  AND q.as_of_date = (
    SELECT MAX(as_of_date) FROM `perennial-data-prod.quantinno.account_summary`
    WHERE account_number = @account_number
      AND as_of_date <= @report_end_date
  )
QUALIFY ROW_NUMBER() OVER (PARTITION BY q.account_number ORDER BY q.add_timestamp DESC) = 1
```

#### All gains via unified reporting view
```sql
SELECT
  account_number,
  source,
  metric_name,
  metric_value_numeric,
  metric_value_text
FROM `perennial-data-prod.reporting.account_type_summaries`
WHERE account_number = @account_number
  AND as_of_date = @report_end_date
ORDER BY source, metric_name
```

#### All equity accounts' gains for a family
```sql
SELECT
  ea.account_number,
  ea.account_display_name,
  ea.entity_name,
  pd.market_value,
  pd.net_realized_gl_ytd_st,
  pd.net_realized_gl_ytd_lt,
  pd.unrealized_gl
FROM `perennial-data-prod.reporting.entity_accounts` ea
JOIN `perennial-data-prod.parametric.portfolio_data` pd
  ON ea.account_number = pd.custodian_account_number
WHERE ea.family_name = @family_name
  AND ea.account_type = 'Equity'
  AND pd.report_date = (
    SELECT MAX(report_date) FROM `perennial-data-prod.parametric.portfolio_data`
    WHERE report_date <= @report_end_date
  )
```

#### All long-short accounts' gains for a family
```sql
SELECT
  ea.account_number,
  ea.account_display_name,
  ea.entity_name,
  q.account_value,
  q.realized_st_gl,
  q.realized_lt_gl,
  q.unrealized_gl,
  q.tax_savings
FROM `perennial-data-prod.reporting.entity_accounts` ea
JOIN `perennial-data-prod.quantinno.account_summary` q
  ON ea.account_number = q.account_number
WHERE ea.family_name = @family_name
  AND ea.account_type = 'Long-Short'
  AND q.as_of_date = (
    SELECT MAX(as_of_date) FROM `perennial-data-prod.quantinno.account_summary`
    WHERE as_of_date <= @report_end_date
  )
QUALIFY ROW_NUMBER() OVER (PARTITION BY q.account_number ORDER BY q.add_timestamp DESC) = 1
```

### Dividend & Interest Data — Where It Lives

| Data Point | Table | Field(s) |
|---|---|---|
| Daily dividends per account | `reporting.daily_account_activity` | `dividends` |
| Daily interest per account | `reporting.daily_account_activity` | `interest` |
| Monthly dividends per account | `reporting.account_monthly_activity` | `dividends` |
| Monthly interest per account | `reporting.account_monthly_activity` | `interest` |
| PIMCO estimated annual income | `pimco.monthly_portfolio_report` | `estimated_annual_income` |
| PIMCO current yield | `pimco.monthly_multiple_portfolio_reports` | `current_yield` |
| Parametric dividend yield | `bbg.equity` | `eqy_dvd_yld_ind_net` (for individual holdings) |

---

## 3. Account-Level Performance Metrics

### Reporting View: `reporting.account_returns` (PREFERRED)

| Column | Type | Description |
|--------|------|-------------|
| `family_name` | STRING | Client family |
| `entity_name` | STRING | Entity |
| `account_number` | STRING | Account |
| `account_display_name` | STRING | Display name |
| `date` | DATE | As-of date |
| `qtd_twror` | FLOAT64 | Quarter-to-date TWROR |
| `ytd_twror` | FLOAT64 | Year-to-date TWROR |
| `trailing_1yr_annualized_twror` | FLOAT64 | Trailing 1-year annualized |
| `trailing_3yr_annualized_twror` | FLOAT64 | Trailing 3-year annualized |
| `itd_annualized_twror` | FLOAT64 | Inception-to-date annualized |

### Source Table: `returns.periodic_liquid_returns` (MORE FIELDS)

| Column | Type | Description |
|--------|------|-------------|
| `date` | DATE | As-of date |
| `account_number` | STRING | Account |
| `mtd_twror` | FLOAT64 | Month-to-date TWROR |
| `qtd_twror` | FLOAT64 | Quarter-to-date TWROR |
| `ytd_twror` | FLOAT64 | Year-to-date TWROR |
| `itd_cumulative_twror` | FLOAT64 | ITD cumulative (not annualized) |
| `itd_annualized_twror` | FLOAT64 | ITD annualized |
| `trailing_1yr_cumulative_twror` | FLOAT64 | Trailing 1yr cumulative |
| `trailing_1yr_annualized_twror` | FLOAT64 | Trailing 1yr annualized |
| `trailing_3yr_cumulative_twror` | FLOAT64 | Trailing 3yr cumulative |
| `trailing_3yr_annualized_twror` | FLOAT64 | Trailing 3yr annualized |

### Additional Performance by Account Type

| Account Type | Source | Key Performance Fields |
|---|---|---|
| **Equity** | `parametric.portfolio_performance` | `pre_tax_ytd_portfolio`, `after_tax_ytd_portfolio`, `after_tax_ytd_tax_alpha`, `pre_tax_itd_annualized_portfolio`, `after_tax_itd_annualized_portfolio`, `after_tax_itd_annualized_tax_alpha` |
| **Muni/FI** | `pimco.monthly_multiple_portfolio_reports` | `net_ytd_returns`, `net_since_inception_annualized_returns`, `effective_duration`, `current_yield`, `coupon`, `average_external_rating` |
| **Muni/FI** | `pimco.monthly_portfolio_report` | `gross_return_ytd`, `gross_return_itd`, `effective_duration`, `coupon_income_current_yield_percent`, `book_yield_percent` |
| **Long-Short** | `quantinno.account_summary` | `long_leverag_actual`, `short_leverage_actual`, `net_leverage_actual`, `reference` (benchmark) |
| **Private (VC)** | `returns.periodic_private_returns` | `mtd_twror`, `qtd_twror`, `ytd_twror`, `itd_annualized_twror`, `trailing_1yr_annualized_twror` |
| **Private (VC)** | `ssc.vc_capital_register` | `net_ror_qtd`, `net_ror_ytd`, `net_ror_itd`, `commitment`, `unfunded_commitment`, `ending_net_balance` |
| **Private (DI)** | `ssc.di_capital_register` | `net_ror_qtd`, `net_ror_ytd`, `ending_net_balance` |
| **Private (RA)** | `ssc.ra_capital_roll` | `ror`, `net_irr`, `gross_irr`, `commitment`, `unfunded_commitment`, `ending_balance` |

### Working Queries — Performance

#### All account returns for a family
```sql
SELECT
  account_number,
  account_display_name,
  entity_name,
  qtd_twror,
  ytd_twror,
  trailing_1yr_annualized_twror,
  trailing_3yr_annualized_twror,
  itd_annualized_twror
FROM `perennial-data-prod.reporting.account_returns`
WHERE family_name = @family_name
  AND date = @report_end_date
ORDER BY entity_name, account_display_name
```

#### Entity-level returns for a family
```sql
SELECT
  entity_name,
  qtd_twror,
  ytd_twror,
  trailing_1yr_annualized_twror,
  trailing_3yr_annualized_twror,
  itd_annualized_twror
FROM `perennial-data-prod.reporting.entity_returns`
WHERE family_name = @family_name
  AND date = @report_end_date
```

#### Family-level returns (total portfolio)
```sql
SELECT
  mtd_twror,
  qtd_twror,
  ytd_twror,
  itd_cumulative_twror,
  itd_annualized_twror,
  trailing_1yr_cumulative_twror,
  trailing_1yr_annualized_twror,
  trailing_3yr_cumulative_twror,
  trailing_3yr_annualized_twror
FROM `perennial-data-prod.reporting.family_returns`
WHERE family_name = @family_name
  AND date = @report_end_date
```

#### Equity account performance with tax alpha (Parametric)
```sql
SELECT
  ea.account_display_name,
  ea.entity_name,
  pp.pre_tax_ytd_portfolio,
  pp.after_tax_ytd_portfolio,
  pp.after_tax_ytd_tax_alpha,
  pp.pre_tax_itd_annualized_portfolio,
  pp.after_tax_itd_annualized_portfolio,
  pp.after_tax_itd_annualized_tax_alpha
FROM `perennial-data-prod.reporting.entity_accounts` ea
JOIN `perennial-data-prod.parametric.portfolio_performance` pp
  ON ea.account_number = pp.custodian_account_number
WHERE ea.family_name = @family_name
  AND ea.account_type = 'Equity'
  AND pp.report_date = (
    SELECT MAX(report_date) FROM `perennial-data-prod.parametric.portfolio_performance`
    WHERE report_date <= @report_end_date
  )
```

#### Muni/FI account performance (PIMCO — both tables combined)
```sql
WITH pimco_combined AS (
  SELECT account_number, report_date, total_market_value, strategy,
    effective_duration, current_yield, coupon, benchmark,
    average_external_rating,
    net_ytd_returns, net_since_inception_annualized_returns,
    'multi' AS source_table
  FROM `perennial-data-prod.pimco.monthly_multiple_portfolio_reports`

  UNION ALL

  SELECT account_number, report_date, total_market_value, strategy,
    effective_duration,
    coupon_income_current_yield_percent AS current_yield,
    par_weighted_average_coupon_rate_percent AS coupon,
    NULL AS benchmark,
    NULL AS average_external_rating,
    gross_return_ytd AS net_ytd_returns,
    gross_return_itd AS net_since_inception_annualized_returns,
    'single' AS source_table
  FROM `perennial-data-prod.pimco.monthly_portfolio_report`
)
SELECT
  ea.account_display_name,
  ea.entity_name,
  p.total_market_value,
  p.strategy,
  p.effective_duration,
  p.current_yield,
  p.coupon,
  p.net_ytd_returns,
  p.net_since_inception_annualized_returns,
  p.average_external_rating
FROM `perennial-data-prod.reporting.entity_accounts` ea
JOIN pimco_combined p
  ON ea.account_number = p.account_number
WHERE ea.family_name = @family_name
  AND ea.account_type IN ('Muni', 'Fixed Income')
  AND p.report_date = (
    SELECT MAX(report_date) FROM pimco_combined
    WHERE account_number = ea.account_number
      AND report_date <= @report_end_date
  )
```

#### Complete account-level breakdown for a family (all types combined)
```sql
-- Step 1: Get all accounts with their types and market values
SELECT
  ea.account_number,
  ea.account_display_name,
  ea.entity_name,
  ea.account_type,
  ea.benchmark,
  ea.established_date,
  asummary.market_value,
  ar.qtd_twror,
  ar.ytd_twror,
  ar.trailing_1yr_annualized_twror,
  ar.itd_annualized_twror
FROM `perennial-data-prod.reporting.entity_accounts` ea
LEFT JOIN `perennial-data-prod.reporting.account_summary` asummary
  ON ea.account_number = asummary.account_number
  AND asummary.date = @report_end_date
LEFT JOIN `perennial-data-prod.reporting.account_returns` ar
  ON ea.account_number = ar.account_number
  AND ar.date = @report_end_date
WHERE ea.family_name = @family_name
ORDER BY ea.entity_name, ea.account_type, ea.account_display_name
```

---

## Key Gotchas for the Assistant

1. **Field casing differs between source and reporting views:**
   - Source tables: PascalCase (`AccountNumber`, `MarketValue`, `Date`)
   - Reporting views: snake_case (`account_number`, `market_value`, `date`)

2. **`desposits` typo in `returns.daily_liquid_returns`:** The column is misspelled as `desposits` (not `deposits`). This is baked into the BigQuery schema.

3. **Quantinno deduplication:** Always add `QUALIFY ROW_NUMBER() OVER (PARTITION BY account_number, as_of_date ORDER BY add_timestamp DESC) = 1` when querying `quantinno.account_summary`.

4. **PIMCO has two tables:** `monthly_multiple_portfolio_reports` (multi-strategy) and `monthly_portfolio_report` (single-strategy) with **different column names**. Always UNION them.

5. **Reporting views don't have realized/unrealized G/L directly** — use `reporting.account_type_summaries` (key-value format) or join to source tables (`parametric.portfolio_data`, `quantinno.account_summary`) directly.

6. **Net flows vs. investment earnings:** `net_flows = deposits + withdrawals` (withdrawals are negative). Dividends, interest, and fees are NOT external flows — they're reflected in market value change.

7. **Trailing 3yr may be NULL/NaN:** Most accounts started Feb 2023, so trailing 3yr data is only now becoming available.

8. **Private returns are VC only** in the computed `returns.*` tables. DI and RA fund data comes from `ssc.di_*` and `ssc.ra_*` source tables directly.

9. **Date alignment:** Not all accounts have data on every calendar date. Always use `MAX(date) <= @target_date` rather than assuming a specific date has data.

10. **Benchmark returns** come from `reporting.benchmark_returns` or `caissa.benchmarks` + `caissa.benchmark_summary_returns` (joined on `benchmark_id`). These are standalone — not account-specific.
