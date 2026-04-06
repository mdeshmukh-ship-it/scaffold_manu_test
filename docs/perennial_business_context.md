---
name: Perennial Business Context
description: Key business concepts for a16z Perennial client reporting. Covers the Family → Entity → Account hierarchy, account type classification (Equity, Muni, Long-Short, Holding), liquid vs. fund investments, the Perennial funds (VC, DI, RA), investment earnings formula, date logic for beginning/ending values, and asset classification rules for positions.
---

# Perennial Business Context

## Client Hierarchy

Clients are organized as **Family → Entity → Account**:

- **Family** (`ClientName`): A client household or family office. Example: "Smith Family"
- **Entity** (`PrimaryAccountHolder`): An individual or legal entity within a family. Example: "John Smith", "Smith Family Trust"
- **Account** (`AccountNumber`): A specific brokerage/investment account. Example: "Z12345678"

One family has multiple entities. One entity has multiple accounts. The `fidelity.accounts` table is the master record linking all three levels.

## Data Sources

- **Fidelity**: Primary custodian. Account master data, daily market values, daily positions, transaction activity.
- **Caissa**: Portfolio analytics platform. Performance returns, fund-level data (VC, DI, Real Assets), benchmark returns, portfolio hierarchy.
- **Parametric**: External equity manager. Portfolio characteristics, income/gains for Parametric-managed equity accounts.
- **PIMCO**: External fixed income manager. Monthly portfolio reports for muni/FI accounts.
- **Quantinno**: External long-short manager. Account summaries for L/S accounts.
- **client_reporting**: Internal staging dataset with mappings, activity rollups, and bridge tables.

## Liquid vs. Fund Investments

Some families have only liquid accounts at Fidelity. Others also have fund investments through Caissa (Venture Capital, Diversifying Investments, Real Assets). When calculating total portfolio values, check if a family has fund investments and include both liquid + fund data if so. Fund data lives in `caissa.capital_account_summary_quarterly`.

## The Perennial Funds

Proprietary funds identified by `entity_name` patterns in Caissa:

- **VC**: `entity_name LIKE 'Perennial Venture Capital Delaware Feeder'` OR `LIKE 'Perennial VC Fund Cayman'`
- **DI**: `entity_name LIKE '%- Diversifying Investments'`
- **RA**: `entity_name LIKE '%Perennial Real Assets%'`

To check if an entity is invested in VC: query `client_reporting.fidelity_ssc_mapping` where `fund = 'VC'` and `ssc_entity_name <> 'No match found'`.

## Account Type Classification

Accounts are classified by keyword matching on `CustomShortName` in `fidelity.accounts`:

- **Equity**: Contains "Equity" or "Equities" → summary data from Parametric or Caissa
- **Muni/Fixed Income**: Contains "Muni", "Fixed Income", "Tax Liability", "Treasury", "Aggregate" → summary data from PIMCO
- **Long-Short**: Contains "LS" or "L/S" → summary data from Quantinno
- **Holding**: Contains "Cash", "UTMA", "IRA", "Roth", " RA", "Holding" → no external manager summary

## Date Logic for Reporting

- **Beginning value date**: `MAX(Date)` strictly before `report_start_date` where data exists for the family's accounts.
- **Ending value date**: `MAX(Date) <= report_end_date` within the reporting period.
- Not all accounts have data on every calendar date. Always find the actual available date rather than assuming a specific calendar date has data.

## Asset Classification for Positions

Positions in `fidelity.daily_positions` are classified using this priority:

1. **Symbol overrides** (highest priority): QJXAQ, FRGXX, QIWSQ → Cash; ISHUF, MUB, VTEB, NUVBX, NVHIX, PRIMX, VMLUX, AGG, CMF → Fixed Income
2. **SecurityType code**: 0, 1, 2, 9 → Equity; 5, 6, 7 → Fixed Income; F, C → Cash
3. **Default**: Other

Exclude positions where SecurityType is ' ' (space) or '8'.

## Investment Earnings Formula

```
Investment Earnings = Ending Value - Beginning Value - Net Flows
```

Where Net Flows = SUM(Deposits) + SUM(Withdrawals) over the reporting period.

## Caissa Deduplication

Many Caissa tables have multiple records per entity/fund per date due to data refreshes. Always deduplicate:

```sql
QUALIFY ROW_NUMBER() OVER (PARTITION BY [entity/fund] ORDER BY [date/run_time] DESC) = 1
```

## Formatting Conventions (for reports)

- Dollar values: raw numbers in queries, format to `$1,234,567` only in rendering
- Percentages: raw decimals in queries (0.0423 = 4.23%), format to `4.23%` only in rendering
- NULL returns should display as "N/A"
- Negative dollars: `-$1,234,567` or `($1,234,567)`