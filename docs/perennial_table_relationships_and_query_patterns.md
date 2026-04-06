---
name: Perennial Table Relationships and Query Patterns
description: How tables in perennial-data-prod join to each other and validated SQL patterns for common operations. Starts with the reporting dataset — pre-computed views that serve as the primary data source for client reports, simplifying complex multi-join queries into single-table SELECTs for hierarchy, returns, holdings, activity, asset class breakdowns, fund positions, and benchmarks. Also covers the complete source-table relationship map (fidelity.accounts as master, bridge tables to Parametric/PIMCO/Quantinno/SSC, returns dataset for TWROR), the Caissa→returns migration for liquid and private fund returns, benchmark queries (caissa.benchmarks), SSC fund data patterns for VC/DI/RA, and query patterns for family/entity/account market values, net flows, asset class breakdowns, top holdings, equity/muni/long-short account summaries, option program summaries, and composite balance sheets including fund investments.
---

# Perennial Table Relationships and Query Patterns

## Reporting Views (Recommended for Client Reports)

The `reporting` dataset provides **pre-computed views** that serve as the primary data source for client reports. These views handle all complex joins, bridge-table lookups, and date-alignment logic internally, so most report queries become simple single-table SELECTs filtered by `family_name`, `entity_name`, `account_number`, and/or `date`.

### Reporting View Map

```
HIERARCHY (how families, entities, and accounts relate):
  reporting.client_families        — all family names
    └── reporting.family_entities  — entities within each family
          └── reporting.entity_accounts — accounts within each entity (+ display name, type, benchmark)

CONFIGURATION:
  reporting.client_config          — report settings per family (theme, colors, logo, email, commentary)

RETURNS (keyed by family/entity/account + date):
  reporting.family_returns              — family-level TWROR (MTD/QTD/YTD/ITD/trailing)
  reporting.entity_returns              — entity-level TWROR
  reporting.account_returns             — account-level TWROR (includes family_name, entity_name)
  reporting.private_fund_returns        — private fund TWROR (keyed by fund + entity)

VALUES & ACTIVITY:
  reporting.account_summary             — account metadata + latest market value
  reporting.entity_ending_values        — entity ending market values
  reporting.daily_account_values        — daily market values (+ family_name, entity_name)
  reporting.daily_account_activity      — daily flows with option premium (+ family_name, entity_name)
  reporting.account_monthly_activity    — monthly flows summary
  reporting.account_value_history       — historical market values per account

HOLDINGS & POSITIONS:
  reporting.account_holdings            — full holdings with asset class and weight
  reporting.account_top_holdings        — top holdings by weight
  reporting.account_type_summaries      — per-source metrics (Parametric, PIMCO, Quantinno, etc.)

ASSET ALLOCATION:
  reporting.family_asset_class_breakdown   — family-level asset class breakdown
  reporting.entity_asset_class_breakdown   — entity-level asset class breakdown

FUND POSITIONS (private investments):
  reporting.fund_positions              — Caissa fund positions (liquid + private)
  reporting.fund_positions_vc           — SSC VC fund positions (commitment, NAV, returns)
  reporting.fund_positions_di           — SSC DI fund positions
  reporting.fund_positions_ra           — SSC RA fund positions (commitment, balance, IRR)
  reporting.fund_summary_vc             — VC investor-level summary
  reporting.fund_summary_di             — DI investor-level summary
  reporting.fund_summary_ra             — RA investor-level summary
  reporting.vc_commitments              — VC investment commitment detail
  reporting.vc_returns                  — VC entity returns (IRR, since-inception)

BENCHMARKS:
  reporting.benchmark_returns           — benchmark returns by name + date (standalone)
```

### When to Use Reporting Views vs. Source Tables

| Use reporting views when… | Use source tables when… |
|---|---|
| Building client-facing reports or dashboards | Running ad-hoc analysis on raw data |
| You need family/entity/account hierarchy | You need raw feed fields (e.g., `feed_raw_positions`) |
| You want pre-computed returns, holdings, or activity | You need custom calculations not in reporting views |
| You want to avoid complex multi-table joins | You need option proceeds, Bloomberg data, or tax tables |

### Reporting View Query Patterns

#### Get all entities for a family
```sql
SELECT entity_name
FROM `perennial-data-prod.reporting.family_entities`
WHERE family_name = @family_name
```

#### Get all accounts for a family
```sql
SELECT account_number, account_display_name, entity_name, account_type, benchmark, established_date
FROM `perennial-data-prod.reporting.entity_accounts`
WHERE family_name = @family_name
```

#### Family total market value on a date
```sql
SELECT SUM(ending_value) AS total_market_value
FROM `perennial-data-prod.reporting.entity_ending_values`
WHERE family_name = @family_name
  AND date = @target_date
```

#### Entity total market value on a date
```sql
SELECT ending_value
FROM `perennial-data-prod.reporting.entity_ending_values`
WHERE family_name = @family_name
  AND entity_name = @entity_name
  AND date = @target_date
```

#### Net flows for a period
```sql
SELECT SUM(net_flows) AS net_flows
FROM `perennial-data-prod.reporting.daily_account_activity`
WHERE family_name = @family_name
  AND date BETWEEN @report_start_date AND @report_end_date
```

#### Monthly activity for a family
```sql
SELECT account_number, month_start_date, month_label,
  deposits, withdrawals, dividends, interest, fees, net_flows
FROM `perennial-data-prod.reporting.account_monthly_activity`
WHERE account_number IN (
  SELECT account_number FROM `perennial-data-prod.reporting.entity_accounts`
  WHERE family_name = @family_name
)
  AND date BETWEEN @report_start_date AND @report_end_date
```

#### Family-level returns
```sql
SELECT mtd_twror, qtd_twror, ytd_twror,
  itd_cumulative_twror, itd_annualized_twror,
  trailing_1yr_annualized_twror, trailing_3yr_annualized_twror
FROM `perennial-data-prod.reporting.family_returns`
WHERE family_name = @family_name
  AND date = @report_end_date
```

#### Entity-level returns
```sql
SELECT entity_name, qtd_twror, ytd_twror,
  trailing_1yr_annualized_twror, trailing_3yr_annualized_twror, itd_annualized_twror
FROM `perennial-data-prod.reporting.entity_returns`
WHERE family_name = @family_name
  AND date = @report_end_date
```

#### Account-level returns
```sql
SELECT account_number, account_display_name, entity_name,
  qtd_twror, ytd_twror,
  trailing_1yr_annualized_twror, trailing_3yr_annualized_twror, itd_annualized_twror
FROM `perennial-data-prod.reporting.account_returns`
WHERE family_name = @family_name
  AND date = @report_end_date
```

#### Private fund returns
```sql
SELECT fund, entity, mtd_twror, qtd_twror, ytd_twror,
  itd_cumulative_twror, itd_annualized_twror,
  trailing_1yr_annualized_twror, trailing_3yr_annualized_twror
FROM `perennial-data-prod.reporting.private_fund_returns`
WHERE entity = @entity_name
  AND date = @report_end_date
```

#### Benchmark returns
```sql
SELECT benchmark_name, description, asset_class,
  ytd_return, trailing_1y_return, trailing_3y_return
FROM `perennial-data-prod.reporting.benchmark_returns`
WHERE date = @report_end_date
```

#### Asset class breakdown for an entity
```sql
SELECT asset_class, market_value
FROM `perennial-data-prod.reporting.entity_asset_class_breakdown`
WHERE family_name = @family_name
  AND entity_name = @entity_name
  AND date = @target_date
```

#### Asset class breakdown for a family
```sql
SELECT asset_class, market_value
FROM `perennial-data-prod.reporting.family_asset_class_breakdown`
WHERE family_name = @family_name
  AND date = @target_date
```

#### Top holdings for an account
```sql
SELECT symbol, description, asset_class, market_value, weight_pct
FROM `perennial-data-prod.reporting.account_top_holdings`
WHERE account_number = @account_number
  AND date = @target_date
```

#### Account value time series
```sql
SELECT date, market_value
FROM `perennial-data-prod.reporting.account_value_history`
WHERE account_number = @account_number
  AND date BETWEEN DATE_SUB(@report_end_date, INTERVAL 1 YEAR) AND @report_end_date
```

#### Account type summaries (Parametric, PIMCO, Quantinno, etc.)
```sql
SELECT source, metric_name, metric_value_numeric, metric_value_text
FROM `perennial-data-prod.reporting.account_type_summaries`
WHERE account_number = @account_number
  AND as_of_date = @report_end_date
```

#### VC fund summary
```sql
SELECT investor_name, commitment, unfunded_commitment, ending_net_balance,
  net_ror_qtd, net_ror_ytd, net_ror_itd
FROM `perennial-data-prod.reporting.fund_summary_vc`
WHERE family_name = @family_name
  AND entity_name = @entity_name
  AND report_date = @report_end_date
```

#### DI fund summary
```sql
SELECT investor_name, ending_net_balance, net_ror_qtd, net_ror_ytd
FROM `perennial-data-prod.reporting.fund_summary_di`
WHERE family_name = @family_name
  AND entity_name = @entity_name
  AND report_date = @report_end_date
```

#### RA fund summary
```sql
SELECT partner_name, commitment, unfunded_commitment, ending_balance,
  ror, net_irr
FROM `perennial-data-prod.reporting.fund_summary_ra`
WHERE family_name = @family_name
  AND entity_name = @entity_name
  AND report_date = @report_end_date
```

#### VC commitment detail
```sql
SELECT investment, description, original_commitment, end_commitment_balance,
  market_value, cost_basis, unrealized_gl
FROM `perennial-data-prod.reporting.vc_commitments`
WHERE family_name = @family_name
  AND entity_name = @entity_name
  AND end_date = @report_end_date
```

#### VC returns (IRR)
```sql
SELECT net_irr, since_inception_return, market_value
FROM `perennial-data-prod.reporting.vc_returns`
WHERE family_name = @family_name
  AND entity_name = @entity_name
  AND as_of_date = @report_end_date
```

#### Fund positions (Caissa liquid + private)
```sql
SELECT fund_name, fund_type, beginning_market_value, ending_market_value,
  net_capital_flow, total_gain_loss
FROM `perennial-data-prod.reporting.fund_positions`
WHERE family_name = @family_name
  AND entity_name = @entity_name
  AND is_latest = TRUE
```

#### Client report configuration
```sql
SELECT display_name, report_type, theme, commentary_mode, manual_commentary,
  primary_color, secondary_color, accent_color, logo_gcs_path,
  docsend_space_id, email_recipients, email_cc, email_subject_template,
  include_dividend_interest_breakout
FROM `perennial-data-prod.reporting.client_config`
WHERE family_name = @family_name
  AND is_active = TRUE
```

---

## Source Table Relationship Map

> **Note:** For standard client reporting, prefer the [Reporting Views](#reporting-views-recommended-for-client-reports) above. The source tables below are useful for ad-hoc analysis, raw data investigation, option proceeds, Bloomberg reference data, tax tables, and custom calculations not covered by the reporting views.

```
fidelity.accounts (MASTER — all joins start here)
│
├── AccountNumber → fidelity.daily_account_market_values.AccountNumber
├── AccountNumber → fidelity.daily_positions.AccountNumber
├── AccountNumber → fidelity.daily_transactions.AccountNumber
├── AccountNumber → fidelity.option_proceeds.account_number
├── AccountNumber → fidelity.options_assigned.account_number
├── AccountNumber → client_reporting.daily_account_activity.AccountNumber
├── AccountNumber → client_reporting.daily_option_premium.AccountNumber
├── AccountNumber → client_reporting.fidelity_caissa_mapping.fidelity_account_number
├── AccountNumber → parametric.portfolio_data.custodian_account_number
├── AccountNumber → parametric.portfolio_performance.custodian_account_number
├── AccountNumber → pimco.monthly_multiple_portfolio_reports.account_number
├── AccountNumber → pimco.monthly_portfolio_report.account_number
├── AccountNumber → quantinno.account_summary.account_number
│
├── AccountNumber → returns.periodic_liquid_returns.account_number (account-level TWROR)
├── AccountNumber → returns.daily_liquid_returns.account_number
├── AccountNumber → returns.monthly_liquid_returns.account_number
│
├── PrimaryAccountHolder → returns.periodic_entity_liquid_returns.entity_name (entity-agg TWROR)
├── PrimaryAccountHolder → client_reporting.fidelity_ssc_mapping.fidelity_entity_name
├── PrimaryAccountHolder → returns.periodic_private_returns.entity
├── PrimaryAccountHolder → returns.daily_private_returns.entity
├── PrimaryAccountHolder → returns.monthly_private_returns.entity
│
├── ClientName → returns.periodic_family_liquid_returns.family_name (family-agg TWROR)
└── ClientName → client_reporting.fidelity_ssc_mapping.fidelity_client_name

client_reporting.fidelity_ssc_mapping (BRIDGE: Fidelity → SSC funds)
│
├── ssc_entity_name → ssc.vc_capital_register.name (investor-level join)
├── ssc_entity_name → ssc.di_capital_register.name (investor-level join)
├── ssc_entity_name → ssc.ra_capital_roll.entity (entity-level join)
├── fund = 'VC' → ssc.vc_* tables
├── fund = 'DI' → ssc.di_* tables
└── fund = 'RA' → ssc.ra_* tables

returns (TWROR RETURN TABLES — replaces caissa.returns)
│
├── Liquid returns:
│   ├── returns.daily_liquid_returns         — daily TWROR per account (keyed by account_number)
│   ├── returns.monthly_liquid_returns       — monthly TWROR per account (keyed by account_number)
│   ├── returns.periodic_liquid_returns      — MTD/QTD/YTD/ITD/trailing per account (keyed by account_number)
│   ├── returns.periodic_entity_liquid_returns  — entity-aggregated periodic TWROR (keyed by entity_name)
│   └── returns.periodic_family_liquid_returns  — family-aggregated periodic TWROR (keyed by family_name)
│
└── Private returns (keyed by fund + entity):
    ├── returns.daily_private_flows           — daily MV and G/L per fund/entity
    ├── returns.daily_private_returns         — daily TWROR per fund/entity
    ├── returns.monthly_private_returns       — monthly TWROR per fund/entity
    └── returns.periodic_private_returns      — MTD/QTD/YTD/ITD/trailing per fund/entity

SSC fund tables (keyed by entity, quarter_end_date or report_date):
│
├── VC fund:
│   ├── ssc.vc_capital_register     — capital account, returns, NAV
│   ├── ssc.vc_holdings             — underlying holdings
│   ├── ssc.vc_investment_commitment — commitment and unfunded balances
│   ├── ssc.vc_transaction          — capital calls and distributions
│   ├── ssc.vc_valuation            — investment valuations
│   ├── ssc.vc_trial_balance        — GL trial balance
│   └── ssc.vc_account_detail       — cash account detail
│
├── DI fund:
│   ├── ssc.di_capital_register     — capital account, returns, NAV
│   ├── ssc.di_capital_acct_summary — quarterly capital account summary
│   ├── ssc.di_holdings             — underlying holdings
│   ├── ssc.di_transaction_history  — transaction history
│   ├── ssc.di_general_ledger       — general ledger
│   └── ssc.di_accrued_income       — accrued income detail
│
├── RA fund:
│   ├── ssc.ra_capital_roll         — capital account, returns, commitments
│   ├── ssc.ra_investment_commitment — investment-level commitments and FMV
│   ├── ssc.ra_transaction          — capital calls and distributions
│   ├── ssc.ra_valuation            — investment valuations
│   └── ssc.ra_trial_balance        — GL trial balance
│
└── ssc.limited_partners            — maps fund → partner_name

bbg (Bloomberg reference data):
│
├── bbg.equity                      — equity fundamentals (keyed by id/ticker)
├── bbg.fixed_income                — bond details (keyed by id/CUSIP)
├── bbg.options                     — options Greeks and pricing
├── bbg.underlying_equity           — equity data for option underlyings
└── bbg.underlying_equity_price_history — historical prices (ticker + date)

caissa (benchmarks only):
│
├── caissa.benchmarks                — benchmark definitions (id, short_name, asset_class)
└── caissa.benchmark_summary_returns — benchmark return data (ytd, trailing 1y, trailing 3y)
    Join: caissa.benchmarks.id = caissa.benchmark_summary_returns.benchmark_id

parametric (tax-managed equity, keyed by custodian_account_number + report_date):
│
├── parametric.portfolio_data        — market value, positions, realized G/L
└── parametric.portfolio_performance — pre-/after-tax returns, tax alpha

pimco (fixed income, keyed by account_number + report_date):
│
├── pimco.monthly_multiple_portfolio_reports — multi-strategy accounts
└── pimco.monthly_portfolio_report           — single-strategy accounts
    ⚠️ UNION these two tables, normalizing column names

quantinno (long-short equity):
│
└── quantinno.account_summary — account value, leverage, realized G/L, tax savings
    Dedup: QUALIFY ROW_NUMBER() OVER (PARTITION BY account_number, as_of_date
                                       ORDER BY add_timestamp DESC) = 1
```

## Source Table Join Notes

- **fidelity.accounts** is the master table. Almost every query starts by filtering accounts, then joining to other tables via `AccountNumber`.
- **returns.periodic_liquid_returns** is the primary source for account-level TWROR (replaces `caissa.returns`). It joins directly on `account_number` — no bridge table needed.
- **returns.periodic_entity_liquid_returns** is keyed by `entity_name` (joins to `fidelity.accounts.PrimaryAccountHolder`). **returns.periodic_family_liquid_returns** is keyed by `family_name` (matches `fidelity.accounts.ClientName` directly — no bridge table needed).
- **returns.periodic_private_returns** provides TWROR for private fund investments (VC, DI, RA), keyed by `fund` + `entity`.
- **client_reporting.fidelity_ssc_mapping** is the bridge between Fidelity entities and SSC fund data. The `fund` column indicates which fund ('VC', 'DI', 'RA') and `ssc_entity_name = 'No match found'` means the entity is NOT invested.
- **PIMCO has two tables** with different column names that should be UNIONed and normalized.
- **parametric.portfolio_data** and **parametric.portfolio_performance** join directly on `custodian_account_number` and `report_date` — no bridge table needed.
- **caissa.benchmarks** and **caissa.benchmark_summary_returns** are the sole source for benchmark return data. Join on `caissa.benchmarks.id = caissa.benchmark_summary_returns.benchmark_id`.

---

## Source Table Query Patterns

> **Note:** These patterns use raw source tables with manual joins. For most client reporting needs, the [Reporting View Query Patterns](#reporting-view-query-patterns) above are simpler and preferred.

### Get all accounts for a family
```sql
SELECT AccountNumber, PrimaryAccountHolder, CustomShortName, EstablishedDate
FROM `perennial-data-prod.fidelity.accounts`
WHERE ClientName = @family_name
```

### Get all entities for a family
```sql
SELECT DISTINCT PrimaryAccountHolder
FROM `perennial-data-prod.fidelity.accounts`
WHERE ClientName = @family_name
```

### Find the actual beginning and ending dates for a reporting period
```sql
-- Beginning date: last available date before period starts
SELECT MAX(Date) AS beginning_date
FROM `perennial-data-prod.fidelity.daily_account_market_values`
WHERE Date < @report_start_date
  AND AccountNumber IN (
    SELECT AccountNumber FROM `perennial-data-prod.fidelity.accounts`
    WHERE ClientName = @family_name
  )

-- Ending date: last available date within the period
SELECT MAX(Date) AS ending_date
FROM `perennial-data-prod.fidelity.daily_account_market_values`
WHERE Date BETWEEN @report_start_date AND @report_end_date
  AND AccountNumber IN (
    SELECT AccountNumber FROM `perennial-data-prod.fidelity.accounts`
    WHERE ClientName = @family_name
  )
```

### Family total market value on a date
```sql
SELECT SUM(b.MarketValue) AS total_market_value
FROM `perennial-data-prod.fidelity.accounts` a
JOIN `perennial-data-prod.fidelity.daily_account_market_values` b
  ON a.AccountNumber = b.AccountNumber
WHERE a.ClientName = @family_name AND b.Date = @target_date
```

### Entity total market value on a date
```sql
SELECT SUM(b.MarketValue) AS total_market_value
FROM `perennial-data-prod.fidelity.accounts` a
JOIN `perennial-data-prod.fidelity.daily_account_market_values` b
  ON a.AccountNumber = b.AccountNumber
WHERE a.PrimaryAccountHolder = @entity_name
  AND a.ClientName = @family_name
  AND b.Date = @target_date
```

### Net contributions/withdrawals for a period
```sql
SELECT SUM(Deposits) + SUM(Withdrawals) AS net_flows
FROM `perennial-data-prod.client_reporting.daily_account_activity`
WHERE Date BETWEEN @report_start_date AND @report_end_date
  AND AccountNumber IN (
    SELECT AccountNumber FROM `perennial-data-prod.fidelity.accounts`
    WHERE ClientName = @family_name
  )
```

### Account-level liquid returns (replaces caissa.returns)
```sql
SELECT
  a.AccountNumber,
  a.CustomShortName AS account_name,
  a.PrimaryAccountHolder AS entity_name,
  r.ytd_twror,
  r.trailing_1yr_annualized_twror,
  r.trailing_3yr_annualized_twror,
  r.itd_annualized_twror
FROM `perennial-data-prod.returns.periodic_liquid_returns` r
JOIN `perennial-data-prod.fidelity.accounts` a
  ON r.account_number = a.AccountNumber
WHERE a.ClientName = @family_name
  AND r.date = @report_end_date
```

### Entity-level liquid returns
```sql
SELECT DISTINCT
  r.entity_name,
  r.ytd_twror,
  r.trailing_1yr_annualized_twror,
  r.trailing_3yr_annualized_twror,
  r.itd_annualized_twror
FROM `perennial-data-prod.returns.periodic_entity_liquid_returns` r
JOIN `perennial-data-prod.fidelity.accounts` a
  ON r.entity_name = a.PrimaryAccountHolder
WHERE a.ClientName = @family_name
  AND r.date = @report_end_date
```

### Family-level liquid returns
```sql
SELECT
  r.ytd_twror,
  r.trailing_1yr_annualized_twror,
  r.trailing_3yr_annualized_twror,
  r.itd_annualized_twror
FROM `perennial-data-prod.returns.periodic_family_liquid_returns` r
WHERE r.family_name = @family_name
  AND r.date = @report_end_date
```

### Private fund returns (VC, DI, RA)
```sql
SELECT
  fund,
  entity,
  ytd_twror,
  trailing_1yr_annualized_twror,
  trailing_3yr_annualized_twror,
  itd_annualized_twror
FROM `perennial-data-prod.returns.periodic_private_returns`
WHERE entity = @entity_name
  AND date = @report_end_date
```

### Benchmark returns
```sql
SELECT
  b.short_name AS benchmark_name,
  b.description,
  b.asset_class,
  r.ytd_return,
  r.trailing_1y_return,
  r.trailing_3y_return
FROM `perennial-data-prod.caissa.benchmark_summary_returns` r
JOIN `perennial-data-prod.caissa.benchmarks` b ON r.benchmark_id = b.id
WHERE r.date = @report_end_date
ORDER BY
  CASE b.asset_class WHEN 'equity' THEN 0 ELSE 1 END,
  b.short_name
```

### Check if entity has VC investment
```sql
SELECT COUNT(*) AS has_vc
FROM `perennial-data-prod.client_reporting.fidelity_ssc_mapping`
WHERE fund = 'VC'
  AND fidelity_entity_name = @entity_name
  AND ssc_entity_name <> 'No match found'
```

### Check if entity has DI or RA investment
```sql
-- DI check
SELECT COUNT(*) AS has_di
FROM `perennial-data-prod.client_reporting.fidelity_ssc_mapping`
WHERE fund = 'DI'
  AND fidelity_entity_name = @entity_name
  AND ssc_entity_name <> 'No match found'

-- RA check
SELECT COUNT(*) AS has_ra
FROM `perennial-data-prod.client_reporting.fidelity_ssc_mapping`
WHERE fund = 'RA'
  AND fidelity_entity_name = @entity_name
  AND ssc_entity_name <> 'No match found'
```

### VC investment summary (from SSC)
```sql
SELECT
  cr.name AS investor_name,
  cr.commitment,
  cr.unfunded_commitment,
  cr.ending_net_balance,
  cr.net_ror_qtd,
  cr.net_ror_ytd,
  cr.net_ror_itd,
  cr.quarter_end_date
FROM `perennial-data-prod.ssc.vc_capital_register` cr
WHERE cr.entity = (
    SELECT ssc_entity_name
    FROM `perennial-data-prod.client_reporting.fidelity_ssc_mapping`
    WHERE fidelity_entity_name = @entity_name
      AND fund = 'VC'
      AND ssc_entity_name <> 'No match found'
    LIMIT 1
  )
  AND cr.quarter_end_date = (
    SELECT MAX(quarter_end_date) FROM `perennial-data-prod.ssc.vc_capital_register`
    WHERE quarter_end_date <= @report_end_date
  )
```

### RA investment summary (from SSC)
```sql
SELECT
  cr.partner_name,
  cr.commitment,
  cr.unfunded_commitment,
  cr.ending_balance,
  cr.ror,
  cr.net_irr,
  cr.end_date
FROM `perennial-data-prod.ssc.ra_capital_roll` cr
WHERE cr.entity = (
    SELECT ssc_entity_name
    FROM `perennial-data-prod.client_reporting.fidelity_ssc_mapping`
    WHERE fidelity_entity_name = @entity_name
      AND fund = 'RA'
      AND ssc_entity_name <> 'No match found'
    LIMIT 1
  )
  AND cr.end_date = (
    SELECT MAX(end_date) FROM `perennial-data-prod.ssc.ra_capital_roll`
    WHERE end_date <= @report_end_date
  )
```

### DI investment summary (from SSC)
```sql
SELECT
  cr.name AS investor_name,
  cr.ending_net_balance,
  cr.net_ror_qtd,
  cr.net_ror_ytd,
  cr.month_end_date
FROM `perennial-data-prod.ssc.di_capital_register` cr
WHERE cr.entity = (
    SELECT ssc_entity_name
    FROM `perennial-data-prod.client_reporting.fidelity_ssc_mapping`
    WHERE fidelity_entity_name = @entity_name
      AND fund = 'DI'
      AND ssc_entity_name <> 'No match found'
    LIMIT 1
  )
  AND cr.month_end_date = (
    SELECT MAX(month_end_date) FROM `perennial-data-prod.ssc.di_capital_register`
    WHERE month_end_date <= @report_end_date
  )
```

### Asset class breakdown for an entity
```sql
SELECT
  CASE
    WHEN TRIM(Symbol) IN ('QJXAQ','FRGXX','QIWSQ') THEN 'Cash'
    WHEN TRIM(Symbol) IN ('ISHUF','MUB','VTEB','NUVBX','NVHIX','PRIMX','VMLUX','AGG','CMF') THEN 'Fixed Income'
    WHEN SecurityType IN ('0','1','2','9') THEN 'Equity'
    WHEN SecurityType IN ('5','6','7') THEN 'Fixed Income'
    WHEN SecurityType IN ('F','C') THEN 'Cash'
    ELSE 'Other'
  END AS asset_class,
  SUM(PositionMarketValue) AS market_value
FROM `perennial-data-prod.fidelity.daily_positions` p
JOIN `perennial-data-prod.fidelity.accounts` a ON p.AccountNumber = a.AccountNumber
WHERE a.PrimaryAccountHolder = @entity_name
  AND a.ClientName = @family_name
  AND p.Date = @ending_date
  AND p.SecurityType NOT IN (' ', '8')
GROUP BY asset_class
```

### Top holdings for an account
```sql
WITH totals AS (
  SELECT SUM(PositionMarketValue) AS total_mv
  FROM `perennial-data-prod.fidelity.daily_positions`
  WHERE AccountNumber = @account_number
    AND Date = (SELECT MAX(Date) FROM `perennial-data-prod.fidelity.daily_positions`
                WHERE Date <= @report_end_date AND AccountNumber = @account_number)
)
SELECT
  Description,
  PositionMarketValue AS market_value,
  PositionMarketValue / (SELECT total_mv FROM totals) AS weight_pct
FROM `perennial-data-prod.fidelity.daily_positions`
WHERE AccountNumber = @account_number
  AND Date = (SELECT MAX(Date) FROM `perennial-data-prod.fidelity.daily_positions`
              WHERE Date <= @report_end_date AND AccountNumber = @account_number)
ORDER BY PositionMarketValue DESC
LIMIT 5
```

### Equity account summary (Parametric tax-managed)
```sql
SELECT
  a.CustomShortName AS account_name,
  pd.market_value,
  pd.number_of_positions,
  pd.net_realized_gl_ytd_st,
  pd.net_realized_gl_ytd_lt,
  pd.unrealized_gl,
  pp.pre_tax_ytd_portfolio AS pre_tax_ytd,
  pp.after_tax_ytd_portfolio AS after_tax_ytd,
  pp.after_tax_ytd_tax_alpha AS tax_alpha_ytd
FROM `perennial-data-prod.fidelity.accounts` a
JOIN `perennial-data-prod.parametric.portfolio_data` pd
  ON a.AccountNumber = pd.custodian_account_number
JOIN `perennial-data-prod.parametric.portfolio_performance` pp
  ON a.AccountNumber = pp.custodian_account_number
  AND pd.report_date = pp.report_date
WHERE a.AccountNumber = @account_number
  AND pd.report_date = (
    SELECT MAX(report_date) FROM `perennial-data-prod.parametric.portfolio_data`
    WHERE custodian_account_number = @account_number
      AND report_date <= @report_end_date
  )
```

### Muni / fixed income account summary (PIMCO)
```sql
WITH pimco_combined AS (
  SELECT account_number, report_date, total_market_value, strategy,
    effective_duration, current_yield, coupon, benchmark,
    average_external_rating, net_ytd_returns, net_since_inception_annualized_returns
  FROM `perennial-data-prod.pimco.monthly_multiple_portfolio_reports`

  UNION ALL

  SELECT account_number, report_date, total_market_value, strategy,
    effective_duration, coupon_income_current_yield_percent AS current_yield,
    par_weighted_average_coupon_rate_percent AS coupon, NULL AS benchmark,
    NULL AS average_external_rating, gross_return_ytd AS net_ytd_returns,
    gross_return_itd AS net_since_inception_annualized_returns
  FROM `perennial-data-prod.pimco.monthly_portfolio_report`
)
SELECT *
FROM pimco_combined
WHERE account_number = @account_number
  AND report_date = (
    SELECT MAX(report_date) FROM pimco_combined
    WHERE account_number = @account_number
      AND report_date <= @report_end_date
  )
```

### Long-short account summary (Quantinno)
```sql
SELECT
  a.CustomShortName AS account_name,
  q.account_value,
  q.reference AS benchmark,
  q.realized_st_gl,
  q.realized_lt_gl,
  q.unrealized_gl,
  q.tax_savings,
  q.long_leverag_actual AS long_leverage,
  q.short_leverage_actual AS short_leverage,
  q.net_leverage_actual AS net_leverage
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

### Ending total value across all entities including fund investments (SSC)
```sql
WITH liquid AS (
  SELECT
    a.PrimaryAccountHolder AS entity_name,
    SUM(mv.MarketValue) AS liquid_mv
  FROM `perennial-data-prod.fidelity.accounts` a
  JOIN `perennial-data-prod.fidelity.daily_account_market_values` mv
    ON a.AccountNumber = mv.AccountNumber
  WHERE a.ClientName = @family_name
    AND mv.Date = @ending_date
  GROUP BY a.PrimaryAccountHolder
),
vc AS (
  SELECT cr.name AS entity_name, cr.ending_net_balance AS fund_mv
  FROM `perennial-data-prod.ssc.vc_capital_register` cr
  WHERE cr.quarter_end_date = (
    SELECT MAX(quarter_end_date) FROM `perennial-data-prod.ssc.vc_capital_register`
    WHERE quarter_end_date <= @report_end_date
  )
  AND cr.name IN (
    SELECT ssc_entity_name FROM `perennial-data-prod.client_reporting.fidelity_ssc_mapping`
    WHERE fidelity_client_name = @family_name AND fund = 'VC'
      AND ssc_entity_name <> 'No match found'
  )
),
di AS (
  SELECT cr.name AS entity_name, cr.ending_net_balance AS fund_mv
  FROM `perennial-data-prod.ssc.di_capital_register` cr
  WHERE cr.month_end_date = (
    SELECT MAX(month_end_date) FROM `perennial-data-prod.ssc.di_capital_register`
    WHERE month_end_date <= @report_end_date
  )
  AND cr.name IN (
    SELECT ssc_entity_name FROM `perennial-data-prod.client_reporting.fidelity_ssc_mapping`
    WHERE fidelity_client_name = @family_name AND fund = 'DI'
      AND ssc_entity_name <> 'No match found'
  )
),
ra AS (
  SELECT cr.partner_name AS entity_name, cr.ending_balance AS fund_mv
  FROM `perennial-data-prod.ssc.ra_capital_roll` cr
  WHERE cr.end_date = (
    SELECT MAX(end_date) FROM `perennial-data-prod.ssc.ra_capital_roll`
    WHERE end_date <= @report_end_date
  )
  AND cr.partner_name IN (
    SELECT ssc_entity_name FROM `perennial-data-prod.client_reporting.fidelity_ssc_mapping`
    WHERE fidelity_client_name = @family_name AND fund = 'RA'
      AND ssc_entity_name <> 'No match found'
  )
)
SELECT
  COALESCE(l.entity_name, f.entity_name) AS entity_name,
  COALESCE(l.liquid_mv, 0) AS liquid_market_value,
  COALESCE(f.fund_mv, 0) AS fund_market_value,
  COALESCE(l.liquid_mv, 0) + COALESCE(f.fund_mv, 0) AS total_market_value
FROM liquid l
FULL OUTER JOIN (
  SELECT entity_name, SUM(fund_mv) AS fund_mv
  FROM (SELECT * FROM vc UNION ALL SELECT * FROM di UNION ALL SELECT * FROM ra)
  GROUP BY entity_name
) f ON l.entity_name = f.entity_name
```

### Account value time series (1 year)
```sql
SELECT Date, MarketValue
FROM `perennial-data-prod.fidelity.daily_account_market_values`
WHERE AccountNumber = @account_number
  AND Date BETWEEN DATE_SUB(@report_end_date, INTERVAL 1 YEAR) AND @report_end_date
```

### Option program summary
```sql
SELECT
  a.CustomShortName AS account_name,
  op.underlying_stock,
  SUM(op.call_premium) AS total_call_premium,
  SUM(op.put_premium) AS total_put_premium,
  SUM(op.net_generated_amount) AS total_net_premium,
  SUM(op.total_notional) AS total_notional_traded
FROM `perennial-data-prod.fidelity.option_proceeds` op
JOIN `perennial-data-prod.fidelity.accounts` a
  ON op.account_number = a.AccountNumber
WHERE a.PrimaryAccountHolder = @entity_name
  AND a.ClientName = @family_name
  AND op.date BETWEEN @report_start_date AND @report_end_date
GROUP BY a.CustomShortName, op.underlying_stock
ORDER BY total_net_premium DESC
```

### Underlying equity price history (for option charts)
```sql
SELECT date, ticker, price
FROM `perennial-data-prod.bbg.underlying_equity_price_history`
WHERE ticker = @ticker
  AND date BETWEEN DATE_SUB(@report_end_date, INTERVAL 1 YEAR) AND @report_end_date
ORDER BY date
```

---

## Caissa → Returns Migration Reference

The `returns` dataset replaces the Caissa **returns** pipeline (`caissa.returns`). The benchmark tables (`caissa.benchmarks` and `caissa.benchmark_summary_returns`) are **not deprecated** and remain the sole source for benchmark data.

| Old (caissa.returns) | New (returns.periodic_liquid_returns) | Notes |
|---|---|---|
| `fund_id` | `account_number` | Direct join to fidelity.accounts; no bridge table needed |
| `as_of_date` | `date` | |
| `qtd` | `qtd_twror` | |
| `ytd` | `ytd_twror` | |
| `trailing_1_yr_not_strict` | `trailing_1yr_annualized_twror` | |
| `trailing_3_yrs_ann` | `trailing_3yr_annualized_twror` | |
| `since_inception_ann_not_strict` | `itd_annualized_twror` | |
| `market_value` | — | Use `fidelity.daily_account_market_values` instead |
| `investment_class = 'Liquid'` | — | All rows in periodic_liquid_returns are liquid by definition |
| `QUALIFY ROW_NUMBER()... run_time` | — | No dedup needed; returns dataset has one row per account per date |

For entity- and family-level aggregations, use `returns.periodic_entity_liquid_returns` (keyed by `entity_name`) and `returns.periodic_family_liquid_returns` (keyed by `family_name`) respectively — these are pre-computed and do not require the `caissa.portfolio_hierarchy` join.

For private fund returns, use `returns.periodic_private_returns` keyed by `fund` + `entity` — this replaces the `caissa.capital_account_summary_quarterly` return fields.