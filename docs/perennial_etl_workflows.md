---
name: Perennial ETL Workflows
description: Calculation logic and data pipeline documentation for Perennial ETL processes. Covers the liquid returns ETL (daily TWROR for Fidelity SMA accounts with entity/family aggregation) and the private returns ETL (TWROR for VC fund entities from SS&C data). Each section documents inputs, transformation steps, formulas, outputs, key assumptions, and known scope limitations. Designed for incremental expansion as new ETL workflows are documented.
---

# Perennial ETL Workflows

Reference for how computed datasets in `perennial-data-prod` are built. Each section covers one Hex ETL project: its inputs, calculation logic, outputs, and operational notes.

For table schemas and column types, see `perennial_table_schema_reference.md`.
For table relationships and query patterns, see `perennial_table_relationships_and_query_patterns.md`.

---

## ETL: Liquid Returns

**Hex project:** [ETL: Liquid Returns](https://app.hex.tech/a16z-perennial/app/ETL-Liquid-Returns-031RHLAHx3xkbAAJ7dwHE6/latest)
**Hex project ID:** `019a26ea-83df-7003-a89d-abc76d32842e`
**Purpose:** Compute Time-Weighted Rate of Return (TWROR) for all Perennial SMA accounts custodied at Fidelity.
**Output dataset:** `perennial-data-prod.returns.*` (liquid tables)
**Schedule:** Runs daily. Last load: 2026-03-03 20:50:55 UTC (computes through prior business day).
**Coverage:** 173 accounts, 52,223 daily rows, date range 2023-02-17 to present.

### Inputs

| Source table | Role |
|---|---|
| `fidelity.accounts` | Account universe — provides `AccountNumber`, `PrimaryAccountHolder` (entity), `ClientName` (family), `EstablishedDate` (inception) |
| `fidelity.daily_account_market_values` | Daily ending market value per account (`MarketValue` on each `Date`) — used as both BMV (prior day) and EMV (current day) |
| `client_reporting.daily_account_activity` | Daily external cash flows per account — `Deposits`, `Withdrawals` (only these two are used as net capital flows; `Dividends`, `Interest`, `Fees` are ignored for return calculation) |
| `fidelity.historical_returns_monthly` | (Optional) Historical seed for accounts with pre-existing return series |
| `client_reporting.daily_option_premium` | (Optional) Option premium flows for accounts running option overlay programs |

### Calculation pipeline

The ETL builds returns bottom-up in four stages: daily account → monthly account → periodic windows → entity/family aggregation.

#### Stage 1 — Daily account-level TWROR → `returns.daily_liquid_returns`

For each account on each trading day:

```
NCF = Deposits + Withdrawals
daily_twror = (EMV - BMV - NCF) / BMV
```

- **EMV** = ending market value (from `daily_account_market_values` on date `t`)
- **BMV** = beginning market value (prior day's ending market value)
- **NCF** = net capital flow = external flows only (deposits + withdrawals; withdrawals are negative)

Dividends, interest, and fees are NOT treated as external flows. They are reflected in the market value change and thus captured in the return.

Chain-linking to cumulative:

```
cumulative_twror(t) = (1 + cumulative_twror(t-1)) × (1 + daily_twror(t)) - 1
```

**Edge case handling:**
- **First day per account** (173 rows): BMV is `NULL` → `daily_twror` is `NULL`. The cumulative series begins on the next day.
- **BMV = 0** (1,085 rows): `daily_twror` is set to `0.0` (safe divide-by-zero). However, if an account passes through a zero-balance period and later receives new capital, the cumulative chain-linked return can produce extreme values (e.g., billions). These blown-up cumulatives propagate to periodic windows and should be filtered in downstream reporting.
- **`daily_twror` NULL** (267 rows total): covers first-day rows plus days where BMV = 0 with a new inflow creating the position from nothing.

Output grain: one row per `account_number` per `date`.

**Schema note:** The deposits column is misspelled as `desposits` in the BigQuery table schema. This is baked into the table definition.

#### Stage 2 — Monthly aggregation → `returns.monthly_liquid_returns`

Daily returns are compounded within each calendar month:

```
monthly_twror = ∏(1 + daily_twror_i) - 1   for all trading days i in the month
monthly_cumulative_twror = running product of (1 + monthly_twror) since inception - 1
```

Output grain: one row per `account_number` per `month_end_date`.

#### Stage 3 — Periodic return windows → `returns.periodic_liquid_returns`

From the daily cumulative series, the ETL computes standard reporting windows for each account as of each date:

| Metric | Column | Calculation |
|---|---|---|
| Month-to-date | `mtd_twror` | Cumulative return from month start to date |
| Quarter-to-date | `qtd_twror` | Cumulative return from quarter start to date |
| Year-to-date | `ytd_twror` | Cumulative return from year start to date |
| Trailing 1yr cumulative | `trailing_1yr_cumulative_twror` | Cumulative return over prior 12 months |
| Trailing 1yr annualized | `trailing_1yr_annualized_twror` | Annualized return over prior 12 months |
| Trailing 3yr cumulative | `trailing_3yr_cumulative_twror` | Cumulative return over prior 36 months |
| Trailing 3yr annualized | `trailing_3yr_annualized_twror` | Annualized return over prior 36 months |
| ITD cumulative | `itd_cumulative_twror` | Total cumulative return since inception |
| ITD annualized | `itd_annualized_twror` | Annualized return since inception |

Annualization formula:

```
annualized_return = (1 + cumulative_return) ^ (365 / days_elapsed) - 1
```

Trailing windows return `NaN` when insufficient history exists. Most accounts currently show `NaN` for `trailing_3yr` since data starts Feb 2023.

Output grain: one row per `account_number` per `date`.

#### Stage 4 — Entity and family aggregation

Returns are aggregated up the client hierarchy using **market-value-weighted chain-linking**:

- **Entity level** → `returns.periodic_entity_liquid_returns`: combines all accounts for a given `PrimaryAccountHolder`, weighted by each account's beginning market value on each day. Keyed by `entity_name`.
- **Family level** → `returns.periodic_family_liquid_returns`: combines all accounts for a given `ClientName`, same weighting approach. Keyed by `family_name`.

Both tables have the same periodic columns as `periodic_liquid_returns` (MTD through trailing 3yr, both cumulative and annualized).

### Output tables

| Table | Grain | Key columns |
|---|---|---|
| `returns.daily_liquid_returns` | account × day | `date`, `account_number`, `beginning_market_value`, `desposits` (sic), `withdrawals`, `net_capital_flow`, `ending_market_value`, `daily_twror`, `daily_cumulative_twror`, `add_timestamp` |
| `returns.monthly_liquid_returns` | account × month | `account_number`, `month_end_date`, `monthly_twror`, `monthly_cumulative_twror`, `add_timestamp` |
| `returns.periodic_liquid_returns` | account × day | `date`, `account_number`, `mtd_twror`, `qtd_twror`, `ytd_twror`, `itd_cumulative_twror`, `itd_annualized_twror`, `trailing_1yr_cumulative_twror`, `trailing_1yr_annualized_twror`, `trailing_3yr_cumulative_twror`, `trailing_3yr_annualized_twror`, `add_timestamp` |
| `returns.periodic_entity_liquid_returns` | entity × day | `date`, `entity_name`, same periodic columns, `add_timestamp` |
| `returns.periodic_family_liquid_returns` | family × day | `date`, `family_name`, same periodic columns, `add_timestamp` |

### Key assumptions and constraints

- **Account universe:** All 173 accounts in `fidelity.accounts` — no filtering by account type. Equity, Muni, Long-Short, and Holding accounts all get returns computed.
- **Inception date:** Each account's return series starts from its `EstablishedDate` in `fidelity.accounts`.
- **External flows only:** Only deposits and withdrawals count as net capital flows. Dividends, interest, and fees are captured through market value change.
- **Zero-balance blowup:** Accounts that pass through zero market value can produce extreme cumulative TWROR values (billions). These are artifacts of chain-linking through zero-balance periods and should be filtered in downstream reporting.
- **Column typo:** The `desposits` column in `daily_liquid_returns` is misspelled (should be "deposits"). This is in the BigQuery schema and cannot be renamed without a table rebuild.
- **No bridge table:** Joins directly on `account_number` (unlike the deprecated Caissa pipeline which required `client_reporting.fidelity_caissa_mapping`).
- **No deduplication needed:** The returns dataset has exactly one row per account per date (unlike `caissa.returns` which required `ROW_NUMBER()` on `run_time`).
- **Replaces:** `caissa.returns` for liquid return data. See the Caissa→Returns migration reference in `perennial_table_relationships_and_query_patterns.md`.

---

## ETL: Private Returns

**Hex project:** [ETL: Private Returns](https://app.hex.tech/a16z-perennial/app/ETL-Private-Returns-031Vx8aeZ6GfshyPXxkbR0/latest)
**Hex project ID:** `019a5125-b334-7eec-815a-fff08419917e`
**Purpose:** Compute TWROR for Perennial private fund investments using SS&C fund administrator data.
**Output dataset:** `perennial-data-prod.returns.*` (private tables)

### Inputs

| Source table | Role |
|---|---|
| `ssc.vc_capital_register` | Quarterly NAV, ending net balance, contributions, redemptions, P&L, net ROR per investor |
| `ssc.vc_transaction` | Individual capital call and distribution transactions with effective dates |
| `client_reporting.fidelity_ssc_mapping` | Bridge from Fidelity entities (`fidelity_entity_name`) to SSC entity names (`ssc_entity_name`) and fund codes (`fund`) |

### Current scope

Only the **VC fund** is processed. Four entities:

| Entity code | Active since |
|---|---|
| PVCFKY (Cayman) | June 2023 |
| PVCFLP (Delaware) | June 2023 |
| PVCMFA | June 2023 |
| PVCMFB | January 2024 |

DI and RA funds have SSC source data available (`ssc.di_*`, `ssc.ra_*`) but are **not yet included** in the private returns pipeline.

### Calculation pipeline

The ETL builds returns in three stages: sparse daily flows → dense daily returns → monthly/periodic aggregation.

#### Stage 1 — Daily private flows → `returns.daily_private_flows`

For each fund/entity/date, the ETL records:
- `market_value` — the NAV on that date
- `gain_loss` — the investment gain or loss attributable to that date

This is a **sparse** time series (~110 rows per entity over 2+ years). Data points only appear on dates where capital events or revaluations occur: quarter-ends, transaction dates, etc. — not every calendar day.

Source: constructed from `ssc.vc_capital_register` (quarterly snapshots) + `ssc.vc_transaction` (intra-quarter capital events).

Output grain: one row per `fund` × `entity` × `date` (sparse).

#### Stage 2 — Daily private returns → `returns.daily_private_returns`

The sparse flow series is **filled to every calendar day** (~880 rows per entity), producing a dense time series.

For each day:

```
net_capital_flow = ending_market_value - beginning_market_value - gain_loss
daily_twror = gain_loss / beginning_market_value
daily_cumulative_twror = ∏(1 + daily_twror_i) - 1   (chain-linked from inception)
```

On days with no capital events: `daily_twror = 0` and the cumulative carries forward unchanged.

This formula isolates **investment performance** from **capital flows** — the standard Modified Dietz / TWROR approach where gains are attributed to the beginning market value, and net flows (contributions/distributions) are stripped out.

Output grain: one row per `fund` × `entity` × `date` (dense, every calendar day).

#### Stage 3 — Monthly and periodic aggregation

**Monthly** → `returns.monthly_private_returns`:

```
monthly_twror = ∏(1 + daily_twror_i) - 1   for all days in the month
monthly_cumulative_twror = running product since inception - 1
```

**Periodic** → `returns.periodic_private_returns`:

Same window calculations as the liquid returns pipeline:

| Metric | Column |
|---|---|
| Month-to-date | `mtd_twror` |
| Quarter-to-date | `qtd_twror` |
| Year-to-date | `ytd_twror` |
| ITD cumulative | `itd_cumulative_twror` |
| ITD annualized | `itd_annualized_twror` |
| Trailing 1yr (cumulative + annualized) | `trailing_1yr_cumulative_twror`, `trailing_1yr_annualized_twror` |
| Trailing 3yr (cumulative + annualized) | `trailing_3yr_cumulative_twror`, `trailing_3yr_annualized_twror` |

Trailing windows return NaN/NULL when insufficient history exists.

Annualization uses the same formula: `(1 + cumulative_return) ^ (365 / days_elapsed) - 1`

### Output tables

| Table | Grain | Key columns |
|---|---|---|
| `returns.daily_private_flows` | fund × entity × date (sparse) | `fund`, `entity`, `date`, `market_value`, `gain_loss` |
| `returns.daily_private_returns` | fund × entity × date (dense) | `fund`, `entity`, `date`, `beginning_market_value`, `ending_market_value`, `gain_loss`, `net_capital_flow`, `daily_twror`, `daily_cumulative_twror` |
| `returns.monthly_private_returns` | fund × entity × month | `fund`, `entity`, `month_end_date`, `monthly_twror`, `monthly_cumulative_twror` |
| `returns.periodic_private_returns` | fund × entity × date (dense) | `fund`, `entity`, `date`, MTD/QTD/YTD/ITD/trailing TWROR columns |

All tables include an `add_timestamp` column. Data currently covers June 2023 through November 2025.

### Key assumptions and constraints

- **VC fund only:** DI and RA funds are not yet processed despite having SSC source data.
- **Sparse → dense fill:** Non-event days carry forward with zero daily return. The cumulative TWROR changes only on event dates.
- **Inception varies by entity:** Each entity's return series starts from its first capital event in the SSC data.
- **Annualization uses calendar days** (365-day basis), so the annualized ITD return shifts slightly each day even when cumulative hasn't changed.
- **Entity key:** The `entity` column in private returns tables maps to `PrimaryAccountHolder` in `fidelity.accounts` via the `client_reporting.fidelity_ssc_mapping` bridge table.

---

## Liquid vs. Private Returns — Comparison

| Dimension | Liquid returns | Private returns |
|---|---|---|
| Asset type | Fidelity SMA accounts | Private fund investments (SS&C) |
| Data source | Fidelity daily feeds | SS&C capital register + transactions |
| Data frequency | Dense (every trading day) | Sparse events, filled to every calendar day |
| Hierarchy | account → entity → family | fund → entity (no family aggregation) |
| Fund scope | All account types | VC only (DI/RA not yet included) |
| Join key to Fidelity | `account_number` (direct) | `entity` via `fidelity_ssc_mapping` bridge |
| Return methodology | Modified Dietz / TWROR | Modified Dietz / TWROR (same formula) |
| External flows | Deposits + Withdrawals only | Contributions + Distributions |
| Deduplication | Not needed | Not needed |

### Shared TWROR formula

Both pipelines use the same core return calculation:

```
daily_twror = (EMV - BMV - NCF) / BMV
```

Where NCF (net capital flow) strips out contributions/deposits and distributions/withdrawals so the return reflects only investment performance.

Cumulative returns are chain-linked: `∏(1 + daily_twror_i) - 1`

Periodic windows (MTD, QTD, YTD, trailing, ITD) and annualization (`(1 + cum)^(365/days) - 1`) are identical across both pipelines.

