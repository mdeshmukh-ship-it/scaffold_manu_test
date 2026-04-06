---
name: Perennial Table Schema Reference
description: Complete column-level reference for all 101 tables across 12 datasets in perennial-data-prod BigQuery. Covers fidelity (accounts, market values, positions, transactions, options, raw feeds), client_reporting (activity, option premiums, Fidelity↔Caissa and Fidelity↔SSC mappings), reporting (pre-computed client report views — hierarchy, holdings, returns, activity, asset class breakdowns, fund positions, benchmarks, and configuration), caissa (benchmarks only), returns (daily/monthly/periodic TWROR for liquid and private investments at account, entity, and family levels), bbg (equity, fixed income, options, price history), parametric (portfolio data and performance), pimco (single and multi-strategy monthly reports), quantinno (long-short account summary), ssc (VC/DI/RA fund accounting — capital registers, holdings, commitments, transactions, valuations, trial balances), cashflow_projections (Burgiss contribution and distribution schedules), and taxes (federal and state rate tables).
---

# Perennial BigQuery Table Schema Reference

Complete column-level reference for all tables in `perennial-data-prod` BigQuery across 12 datasets and 101 tables.

## Table of Contents

- **[fidelity](#fidelity)** (11 tables) — Fidelity custodian data — accounts, daily market values, positions, transactions, option activity, and raw feed files.
- **[client_reporting](#client_reporting)** (6 tables) — Internal mapping and reporting tables — account activity, option premiums, Fidelity↔Caissa and Fidelity↔SSC bridge tables, fund holdings, and report images.
- **[reporting](#reporting)** (29 tables) — Reporting layer — pre-computed views for client reports including account/entity/family hierarchy, holdings, returns, activity, asset class breakdowns, fund positions across liquid and private (VC/DI/RA) investments, benchmark returns, and client report configuration.
- **[caissa](#caissa)** (12 tables) — Caissa portfolio management platform — performance returns, capital account summaries (daily/monthly/quarterly), commitments, portfolio hierarchy, fund metadata, benchmarks, and exposures.
- **[returns](#returns)** (9 tables) — Computed TWROR return series — daily and monthly liquid/private returns, and periodic (MTD/QTD/YTD/ITD/trailing) returns at account, entity, and family levels.
- **[bbg](#bbg)** (5 tables) — Bloomberg reference data — equity fundamentals, fixed income details, options Greeks, and underlying equity price history.
- **[parametric](#parametric)** (2 tables) — Parametric tax-managed equity data — portfolio summary, realized/unrealized gains, and pre-/after-tax performance.
- **[pimco](#pimco)** (2 tables) — PIMCO fixed income data — monthly portfolio reports for single- and multi-strategy accounts including yields, duration, credit quality, and returns.
- **[quantinno](#quantinno)** (1 tables) — Quantinno long-short equity data — account-level summary with leverage, realized/unrealized G/L, tax savings, and restrictions.
- **[ssc](#ssc)** (19 tables) — SS&C fund administrator data — VC, DI, and RA fund accounting including capital registers, holdings, transactions, valuations, trial balances, and commitments.
- **[cashflow_projections](#cashflow_projections)** (2 tables) — Burgiss private markets cashflow projection schedules — contribution and distribution pacing models (Y1–Y16).
- **[taxes](#taxes)** (3 tables) — Tax reference tables — federal income tax rates, federal capital gains rates, and state income tax rates by filing status.

---

## fidelity

Fidelity custodian data — accounts, daily market values, positions, transactions, option activity, and raw feed files.

### fidelity.accounts

| # | Column | Type |
|---|--------|------|
| 1 | `AccountNumber` | STRING |
| 2 | `PrimaryAccountHolder` | STRING |
| 3 | `FBSIShortName` | STRING |
| 4 | `CustomShortName` | STRING |
| 5 | `ClientName` | STRING |
| 6 | `EstablishedDate` | DATE |
| 7 | `InvestmentProgram` | STRING |
| 8 | `Benchmark` | STRING |
| 9 | `AddTimestamp` | TIMESTAMP |

### fidelity.daily_account_market_values

| # | Column | Type |
|---|--------|------|
| 1 | `Date` | DATE |
| 2 | `AccountNumber` | STRING |
| 3 | `MarketValue` | FLOAT64 |
| 4 | `AddTimestamp` | TIMESTAMP |

### fidelity.daily_positions

| # | Column | Type |
|---|--------|------|
| 1 | `Date` | DATE |
| 2 | `AccountNumber` | STRING |
| 3 | `AccountType` | STRING |
| 4 | `Symbol` | STRING |
| 5 | `CUSIP` | STRING |
| 6 | `ISIN` | STRING |
| 7 | `ProductCode` | STRING |
| 8 | `SecurityType` | STRING |
| 9 | `SecurityTypeModifier` | STRING |
| 10 | `PrimaryExchange` | STRING |
| 11 | `Description` | STRING |
| 12 | `MarketPrice` | FLOAT64 |
| 13 | `TradeDateQuantity` | FLOAT64 |
| 14 | `SettlementDateQuantity` | FLOAT64 |
| 15 | `PositionMarketValue` | FLOAT64 |
| 16 | `CalculatedMarketValue` | FLOAT64 |
| 17 | `FixedIncomeAccruedInterest` | FLOAT64 |
| 18 | `CurrencyCode` | STRING |
| 19 | `MultiCurrencyIndicator` | STRING |
| 20 | `AddTimestamp` | TIMESTAMP |

### fidelity.daily_transactions

| # | Column | Type |
|---|--------|------|
| 1 | `Date` | DATE |
| 2 | `AccountNumber` | STRING |
| 3 | `KeyCode` | STRING |
| 4 | `TransactionType` | STRING |
| 5 | `TransactionCategory` | STRING |
| 6 | `TransactionSubcategory` | STRING |
| 7 | `BuySellCode` | STRING |
| 8 | `SecurityType` | STRING |
| 9 | `CUSIP` | STRING |
| 10 | `Description` | STRING |
| 11 | `Quantity` | FLOAT64 |
| 12 | `Amount` | FLOAT64 |
| 13 | `MarketValue` | FLOAT64 |
| 14 | `Commission` | FLOAT64 |
| 15 | `RunDate` | DATE |
| 16 | `TradeDate` | DATE |
| 17 | `EntryDate` | DATE |
| 18 | `AddTimestamp` | TIMESTAMP |

### fidelity.feed_raw_accounts

| # | Column | Type |
|---|--------|------|
| 1 | `RecordNumber` | STRING |
| 2 | `Branch` | STRING |
| 3 | `AccountNumber` | STRING |
| 4 | `LastUpdateDate` | STRING |
| 5 | `BalanceFieldSignNetWorth` | STRING |
| 6 | `NetWorth` | STRING |
| 7 | `BalanceFieldSignCashCollectedBalance` | STRING |
| 8 | `CashCollectedBalance` | STRING |
| 9 | `BalanceFieldSignCollectedBalance` | STRING |
| 10 | `CollectedBalance` | STRING |
| 11 | `BalanceFieldSignNetTradeDateBalance` | STRING |
| 12 | `NetTradeDateBalance` | STRING |
| 13 | `BalanceFieldSignNetWorthMarketValue` | STRING |
| 14 | `NetWorthMarketValue` | STRING |
| 15 | `BalanceFieldSignCashMoneyMarkets` | STRING |
| 16 | `CashMoneyMarkets` | STRING |
| 17 | `BalanceFieldSignOptionMarketValue` | STRING |
| 18 | `OptionMarketValue` | STRING |
| 19 | `BalanceFieldSignOptionInMoneyAmt` | STRING |
| 20 | `OptionInMoneyAmt` | STRING |
| 21 | `BalanceFieldSignMemoAdjustments` | STRING |
| 22 | `MemoAdjustments` | STRING |
| 23 | `BalanceFieldSignAvailableToPurchaseMargin` | STRING |
| 24 | `AvailableToPurchaseMargin` | STRING |
| 25 | `BalanceFieldSignBuyingPowerCorpBonds` | STRING |
| 26 | `BuyingPowerCorpBonds` | STRING |
| 27 | `BalanceFieldSignBuyingPowerMuniBonds` | STRING |
| 28 | `BuyingPowerMuniBonds` | STRING |
| 29 | `BalanceFieldSignBuyingPowerGovtBonds` | STRING |
| 30 | `BuyingPowerGovtBonds` | STRING |
| 31 | `BalanceFieldSignHouseSurplusCall` | STRING |
| 32 | `HouseSurplusCall` | STRING |
| 33 | `BalanceFieldSignNyseSurplusCall` | STRING |
| 34 | `NyseSurplusCall` | STRING |
| 35 | `BalanceFieldSignSmaFedCall` | STRING |
| 36 | `SmaFedCall` | STRING |
| 37 | `BalanceFieldSignMinimumEquityCall` | STRING |
| 38 | `MinimumEquityCall` | STRING |
| 39 | `BalanceFieldSignTotalCoreMoneyMarkets` | STRING |
| 40 | `TotalCoreMoneyMarkets` | STRING |
| 41 | `BalanceFieldSignMarginEquity` | STRING |
| 42 | `MarginEquity` | STRING |
| 43 | `BalanceFieldSignMarginLiquidatingEquity` | STRING |
| 44 | `MarginLiquidatingEquity` | STRING |
| 45 | `MarginEquityPercentage` | STRING |
| 46 | `BalanceFieldSignFedCallReduction` | STRING |
| 47 | `FedCallReduction` | STRING |
| 48 | `BalanceFieldSignHouseCallReduction` | STRING |
| 49 | `HouseCallReduction` | STRING |
| 50 | `BalanceFieldSignNyseCallReduction` | STRING |
| 51 | `NyseCallReduction` | STRING |
| 52 | `BalanceFieldSignUncollectedBalance` | STRING |
| 53 | `UncollectedBalance` | STRING |
| 54 | `BalanceFieldSignMinimumEquityCallReduction` | STRING |
| 55 | `MinimumEquityCallReduction` | STRING |
| 56 | `TransferLegendCode` | STRING |
| 57 | `MarginPapersSwitch` | STRING |
| 58 | `PositionSwitch` | STRING |
| 59 | `UnpricedPositionsSwitch` | STRING |
| 60 | `EmployeeAccountSwitch` | STRING |
| 61 | `TypeOfAccountSwitch` | STRING |
| 62 | `ShortPositionSwitch` | STRING |
| 63 | `LongPositionSwitch` | STRING |
| 64 | `MemoEntriesSwitch` | STRING |
| 65 | `DayTradesSwitch` | STRING |
| 66 | `PossibleLiquidationsSwitch` | STRING |
| 67 | `MinimumFedCallTransSwitch` | STRING |
| 68 | `AccountTypeRecordCount` | STRING |
| 69 | `SuperBranch` | STRING |
| 70 | `BalanceFieldSignAvailableToPurchaseCash` | STRING |
| 71 | `AvailableToPurchaseCash` | STRING |
| 72 | `BalanceFieldSignAvailableToPurchaseCashMgn` | STRING |
| 73 | `AvailableToPurchaseCashMgn` | STRING |
| 74 | `BalanceFieldSignAvailableToPurchaseNonMgn` | STRING |
| 75 | `AvailableToPurchaseNonMgn` | STRING |
| 76 | `BalanceFieldSignCustomerFacingNetWorth` | STRING |
| 77 | `CustomerFacingNetWorth` | STRING |
| 78 | `AccountType1` | STRING |
| 79 | `BalanceFieldSignMarketValue1` | STRING |
| 80 | `MarketValue1` | STRING |
| 81 | `BalanceFieldSignTradeDateBalance1` | STRING |
| 82 | `TradeDateBalance1` | STRING |
| 83 | `BalanceFieldSignSettlementDateBalance1` | STRING |
| 84 | `SettlementDateBalance1` | STRING |
| 85 | `AccountType2` | STRING |
| 86 | `BalanceFieldSignMarketValue2` | STRING |
| 87 | `MarketValue2` | STRING |
| 88 | `BalanceFieldSignTradeDateBalance2` | STRING |
| 89 | `TradeDateBalance2` | STRING |
| 90 | `BalanceFieldSignSettlementDateBalance2` | STRING |
| 91 | `SettlementDateBalance2` | STRING |
| 92 | `AccountType3` | STRING |
| 93 | `BalanceFieldSignMarketValue3` | STRING |
| 94 | `MarketValue3` | STRING |
| 95 | `BalanceFieldSignTradeDateBalance3` | STRING |
| 96 | `TradeDateBalance3` | STRING |
| 97 | `BalanceFieldSignSettlementDateBalance3` | STRING |
| 98 | `SettlementDateBalance3` | STRING |
| 99 | `AccountType4` | STRING |
| 100 | `BalanceFieldSignMarketValue4` | STRING |
| 101 | `MarketValue4` | STRING |
| 102 | `BalanceFieldSignTradeDateBalance4` | STRING |
| 103 | `TradeDateBalance4` | STRING |
| 104 | `BalanceFieldSignSettlementDateBalance4` | STRING |
| 105 | `SettlementDateBalance4` | STRING |
| 106 | `AccountType5` | STRING |
| 107 | `BalanceFieldSignMarketValue5` | STRING |
| 108 | `MarketValue5` | STRING |
| 109 | `BalanceFieldSignTradeDateBalance5` | STRING |
| 110 | `TradeDateBalance5` | STRING |
| 111 | `BalanceFieldSignSettlementDateBalance5` | STRING |
| 112 | `SettlementDateBalance5` | STRING |
| 113 | `AccountType6` | STRING |
| 114 | `BalanceFieldSignMarketValue6` | STRING |
| 115 | `MarketValue6` | STRING |
| 116 | `BalanceFieldSignTradeDateBalance6` | STRING |
| 117 | `TradeDateBalance6` | STRING |
| 118 | `BalanceFieldSignSettlementDateBalance6` | STRING |
| 119 | `SettlementDateBalance6` | STRING |
| 120 | `AccountType7` | STRING |
| 121 | `BalanceFieldSignMarketValue7` | STRING |
| 122 | `MarketValue7` | STRING |
| 123 | `BalanceFieldSignTradeDateBalance7` | STRING |
| 124 | `TradeDateBalance7` | STRING |
| 125 | `BalanceFieldSignSettlementDateBalance7` | STRING |
| 126 | `SettlementDateBalance7` | STRING |
| 127 | `AccountType8` | STRING |
| 128 | `BalanceFieldSignMarketValue8` | STRING |
| 129 | `MarketValue8` | STRING |
| 130 | `BalanceFieldSignTradeDateBalance8` | STRING |
| 131 | `TradeDateBalance8` | STRING |
| 132 | `BalanceFieldSignSettlementDateBalance8` | STRING |
| 133 | `SettlementDateBalance8` | STRING |
| 134 | `AccountType9` | STRING |
| 135 | `BalanceFieldSignMarketValue9` | STRING |
| 136 | `MarketValue9` | STRING |
| 137 | `BalanceFieldSignTradeDateBalance9` | STRING |
| 138 | `TradeDateBalance9` | STRING |
| 139 | `BalanceFieldSignSettlementDateBalance9` | STRING |
| 140 | `SettlementDateBalance9` | STRING |
| 141 | `AccountType10` | STRING |
| 142 | `BalanceFieldSignMarketValue10` | STRING |
| 143 | `MarketValue10` | STRING |
| 144 | `BalanceFieldSignTradeDateBalance10` | STRING |
| 145 | `TradeDateBalance10` | STRING |
| 146 | `BalanceFieldSignSettlementDateBalance10` | STRING |
| 147 | `SettlementDateBalance10` | STRING |
| 148 | `PortfolioMarginIndicator` | STRING |
| 149 | `MasterSecurityLendingAgreementIndicator` | STRING |
| 150 | `RelationshipTypeCode` | STRING |
| 151 | `MultiCurrencyAccountIndicator` | STRING |
| 152 | `TrustAccounting` | STRING |
| 153 | `NonPurposeLoanIndicator` | STRING |
| 154 | `NetCashSettlementIndicator` | STRING |
| 155 | `WhenIssuedIndicator` | STRING |
| 156 | `AccountType5Indicator` | STRING |
| 157 | `BalanceFieldSignAvailableToBorrow` | STRING |
| 158 | `AvailableToBorrow` | STRING |
| 159 | `BalanceFieldSignCashAvailableToWithdraw` | STRING |
| 160 | `CashAvailableToWithdraw` | STRING |
| 161 | `BalanceFieldSignSettledCash` | STRING |
| 162 | `SettledCash` | STRING |
| 163 | `BalanceFieldSignUnsettledCashCredit` | STRING |
| 164 | `UnsettledCashCredit` | STRING |
| 165 | `BalanceFieldSignUnsettledCashDebit` | STRING |
| 166 | `UnsettledCashDebit` | STRING |
| 167 | `BalanceFieldSignAvailableToPay` | STRING |
| 168 | `AvailableToPay` | STRING |
| 169 | `BalanceFieldSignCoreSweepFundAmount` | STRING |
| 170 | `CoreSweepFundAmount` | STRING |
| 171 | `BalanceFieldSignNonCoreMoneyMarketAmount` | STRING |
| 172 | `NonCoreMoneyMarketAmount` | STRING |
| 173 | `Filler` | STRING |
| 174 | `EffectiveDate` | STRING |
| 175 | `FileClient` | STRING |
| 176 | `FileRowCount` | STRING |
| 177 | `FileName` | STRING |
| 178 | `FileDate` | DATE |
| 179 | `AddTimestamp` | STRING |

### fidelity.feed_raw_positions

| # | Column | Type |
|---|--------|------|
| 1 | `RecordNumber` | STRING |
| 2 | `PositionDeltaIndicator` | STRING |
| 3 | `Firm` | STRING |
| 4 | `Branch` | STRING |
| 5 | `AccountNumber` | STRING |
| 6 | `AccountType` | STRING |
| 7 | `Filler1` | STRING |
| 8 | `Cusip` | STRING |
| 9 | `Filler2` | STRING |
| 10 | `SecurityType` | STRING |
| 11 | `SecurityTypeModifier` | STRING |
| 12 | `PrimaryExchange` | STRING |
| 13 | `Filler3` | STRING |
| 14 | `DtcEligibilityCode` | STRING |
| 15 | `Filler4` | STRING |
| 16 | `RegisteredRepOwningRep_Rr_` | STRING |
| 17 | `MarginLastActivityDate` | STRING |
| 18 | `StockRecordLastActivityDate` | STRING |
| 19 | `Symbol` | STRING |
| 20 | `MarketPrice` | STRING |
| 21 | `PositionFieldSignMarketPrice` | STRING |
| 22 | `TradeDateQuantity` | STRING |
| 23 | `PositionFieldSignTradeDateQuantity` | STRING |
| 24 | `OptionStrikePrice` | STRING |
| 25 | `SettlementDateQuantity` | STRING |
| 26 | `PositionFieldSignSettlementDateQuantity` | STRING |
| 27 | `SegregatedQuantity` | STRING |
| 28 | `PositionFieldSignSegregatedQuantity` | STRING |
| 29 | `TransitQuantity` | STRING |
| 30 | `PositionFieldSignTransitQuantity` | STRING |
| 31 | `TransferQuantity` | STRING |
| 32 | `PositionFieldSignTransferQuantity` | STRING |
| 33 | `LegalTransferQuantity` | STRING |
| 34 | `PositionFieldSignLegalTransferQuantity` | STRING |
| 35 | `NonNegotiableQuantity` | STRING |
| 36 | `PositionFieldSignNonNegotiableQuantity` | STRING |
| 37 | `TradeDateShortSaleQuantity` | STRING |
| 38 | `PositionFieldSignTradeDateShortSaleQuantity` | STRING |
| 39 | `SettlementDateShortSaleQuantity` | STRING |
| 40 | `PositionFieldSignSettlementDateShortSaleQuantity` | STRING |
| 41 | `MtdPositionTradeDateBalance` | STRING |
| 42 | `PositionFieldSignMtdPositionTradeDateBalance` | STRING |
| 43 | `MtdPositionSettlementDateBalance` | STRING |
| 44 | `PositionFieldSignMtdPositionSettlementDateBalance` | STRING |
| 45 | `MtdTradeDatePositionCommission` | STRING |
| 46 | `PositionFieldSignMtdTradeDatePositionCommission` | STRING |
| 47 | `MtdSettleDatePositionCommission` | STRING |
| 48 | `PositionFieldSignMtdSettleDatePositionCommission` | STRING |
| 49 | `CouponRate` | STRING |
| 50 | `PositionFieldSignCouponRate` | STRING |
| 51 | `Filler5` | STRING |
| 52 | `NumberOfSecurityDescriptionLines` | STRING |
| 53 | `ShortName` | STRING |
| 54 | `SecurityDescriptionLine1` | STRING |
| 55 | `SecurityDescriptionLine2` | STRING |
| 56 | `SecurityDescriptionLine3` | STRING |
| 57 | `SecurityDescriptionLine4` | STRING |
| 58 | `SecurityDescriptionLine5` | STRING |
| 59 | `SecurityDescriptionLine6` | STRING |
| 60 | `DividendInstructionCode` | STRING |
| 61 | `ShortTermCapitalGainsInstructionCode` | STRING |
| 62 | `LongTermCapitalGainsInstructionCode` | STRING |
| 63 | `DividendCapitalGainsUpdateDate` | STRING |
| 64 | `DividendCapitalGainsUpdateUserId` | STRING |
| 65 | `Filler6` | STRING |
| 66 | `MtdPositionIncomeTradeDate` | STRING |
| 67 | `PositionFieldSignMtdPositionIncomeTradeDate` | STRING |
| 68 | `MtdPositionIncomeSettleDate` | STRING |
| 69 | `PositionFieldSignMtdPositionIncomeSettleDate` | STRING |
| 70 | `RegisteredRepExecRep_Rr2_` | STRING |
| 71 | `AgencyCode` | STRING |
| 72 | `ProductCode` | STRING |
| 73 | `MaturityDate` | STRING |
| 74 | `CashAvailableToPay` | STRING |
| 75 | `PositionFieldSignCashAvailableToPay` | STRING |
| 76 | `MultiCurrencyIndicator` | STRING |
| 77 | `PositionMarketValue` | STRING |
| 78 | `PositionFieldSignPositionMarketValue` | STRING |
| 79 | `CurrentFactorAmount` | STRING |
| 80 | `UnfactoredPriceSign` | STRING |
| 81 | `UnfactoredPrice` | STRING |
| 82 | `CpiRatioSign` | STRING |
| 83 | `CpiRatio` | STRING |
| 84 | `CpiRatioDate` | STRING |
| 85 | `DatedDateCpiSign` | STRING |
| 86 | `DatedDateCpi` | STRING |
| 87 | `OptionContractId` | STRING |
| 88 | `OptionExpirationDate` | STRING |
| 89 | `OptionCallPutIndicator` | STRING |
| 90 | `OptionSymbolId` | STRING |
| 91 | `EligibleSettlementDateQuantity` | STRING |
| 92 | `PositionFieldSignEligibleSettlementDateQuantity` | STRING |
| 93 | `FixedIncomeAccruedInterest` | STRING |
| 94 | `PositionFieldSignFixedIncomeAccruedInterest` | STRING |
| 95 | `Filler7` | STRING |
| 96 | `Isin` | STRING |
| 97 | `Sedol` | STRING |
| 98 | `CurrencyCode` | STRING |
| 99 | `ReportingCurrencyConversionPrice` | STRING |
| 100 | `LocalCurrencyMarketValue` | STRING |
| 101 | `MarketPriceDate` | STRING |
| 102 | `ConversionPriceDate` | STRING |
| 103 | `LocalCurrencyFixedIncomeAccruedInterest` | STRING |
| 104 | `PositionFieldSignLocalCurrencyFixedIncomeAccruedInterest` | STRING |
| 105 | `Filler8` | STRING |
| 106 | `EffectiveDate` | STRING |
| 107 | `FileClient` | STRING |
| 108 | `FileRowCount` | STRING |
| 109 | `FileName` | STRING |
| 110 | `FileDate` | DATE |
| 111 | `AddTimestamp` | STRING |

### fidelity.feed_raw_security_master

| # | Column | Type |
|---|--------|------|
| 1 | `RECORD_TYPE` | STRING |
| 2 | `RECORD_NUMBER` | STRING |
| 3 | `RECORD_STATUS_CODE` | STRING |
| 4 | `CUSIP` | STRING |
| 5 | `SYMBOL` | STRING |
| 6 | `FLOOR_TRADING_SYMBOL` | STRING |
| 7 | `SECURITY_TYPE` | STRING |
| 8 | `SECURITY_TYPE_MODIFIER` | STRING |
| 9 | `SECURITY_TYPE_CALCULATION` | STRING |
| 10 | `SECURITY_DESCRIPTION_LINE_1` | STRING |
| 11 | `SECURITY_DESCRIPTION_LINE_2` | STRING |
| 12 | `SECURITY_DESCRIPTION_LINE_3` | STRING |
| 13 | `SECURITY_DESCRIPTION_LINE_4` | STRING |
| 14 | `SECURITY_DESCRIPTION_LINE_5` | STRING |
| 15 | `SECURITY_DESCRIPTION_LINE_6` | STRING |
| 16 | `ISSUE_DATE` | STRING |
| 17 | `ISSUER_COUNTRY_1` | STRING |
| 18 | `PRIMARY_EXCHANGE_1` | STRING |
| 19 | `DTC_ELIGIBILITY_CODE` | STRING |
| 20 | `OPTION_RIGHTS_WTS_EXPIRE_DATE` | STRING |
| 21 | `DISTRIBUTION_FREQUENCY_CODE` | STRING |
| 22 | `SECURITY_SHORT_NAME` | STRING |
| 23 | `DATED_DATE` | STRING |
| 24 | `ISIN` | STRING |
| 25 | `SEDOL` | STRING |
| 26 | `CURRENCY_CODE` | STRING |
| 27 | `ISSUER_COUNTRY_2` | STRING |
| 28 | `FOREIGN` | STRING |
| 29 | `ISSUER_STATE_CODE` | STRING |
| 30 | `PRODUCT_CODE` | STRING |
| 31 | `UNDERLYING_CUSIP_CODE` | STRING |
| 32 | `UNDERLYING_CUSIP` | STRING |
| 33 | `USER_CUSIP_INDICATOR` | STRING |
| 34 | `PIP_ELIGIBLE` | STRING |
| 35 | `SWP_ELIGIBLE` | STRING |
| 36 | `BASE_INTEREST_DATE` | STRING |
| 37 | `INTEREST_DAYS` | STRING |
| 38 | `FIRST_COUPON_DATE` | STRING |
| 39 | `DEBT_INTEREST_RATE_SIGN` | STRING |
| 40 | `DEBT_INTEREST_RATE` | STRING |
| 41 | `DEBT_MATURITY_DATE_1` | STRING |
| 42 | `BOND_CLASS_CODE` | STRING |
| 43 | `EXCHANGE_GROUP_NUMBER` | STRING |
| 44 | `FUND_FAMILY_NUMBER` | STRING |
| 45 | `FUND_FAMILY_DESCRIPTION` | STRING |
| 46 | `FUND_LOAD_TYPE` | STRING |
| 47 | `FUND_CLASS_OF_SHARES` | STRING |
| 48 | `TYPE_OF_FUND` | STRING |
| 49 | `REORGANIZATION_PENDING_CODE` | STRING |
| 50 | `FILLER_1` | STRING |
| 51 | `INITIAL_MINIMUM` | STRING |
| 52 | `SUBSEQUENT_MINIMUM` | STRING |
| 53 | `REDEMPTION_MINIMUM` | STRING |
| 54 | `REDEMPTION_MAXIMUM` | STRING |
| 55 | `RATING_AGENT_CODE_1` | STRING |
| 56 | `RATING_1` | STRING |
| 57 | `RATING_AGENT_CODE_2` | STRING |
| 58 | `RATING_2` | STRING |
| 59 | `RATING_AGENT_CODE_3` | STRING |
| 60 | `RATING_3` | STRING |
| 61 | `CURRENT_FACTOR_AMOUNT` | STRING |
| 62 | `CURRENT_FACTOR_DATE` | STRING |
| 63 | `ZERO_COUPON_INDICATOR` | STRING |
| 64 | `LAST_COUPON_DATE` | STRING |
| 65 | `OPTION_ACTIVITY_BEGIN_DATE` | STRING |
| 66 | `OPTION_ACTIVITY_END_DATE` | STRING |
| 67 | `CBL_COVERED_SECURITY_INDICATOR` | STRING |
| 68 | `CBL_COVERED_SECURITY_EFFECTIVE` | STRING |
| 69 | `BID_PRICE` | STRING |
| 70 | `ASK_PRICE` | STRING |
| 71 | `CLOSING_MARKET_PRICE` | STRING |
| 72 | `PRICE_DATE` | STRING |
| 73 | `UNFACTORED_PRICE_SIGN` | STRING |
| 74 | `UNFACTORED_PRICE` | STRING |
| 75 | `FACTORED_PRICE_SIGN` | STRING |
| 76 | `FACTORED_PRICE` | STRING |
| 77 | `PREVIOUS_FACTOR_AMOUNT` | STRING |
| 78 | `PREVIOUS_FACTOR_DATE` | STRING |
| 79 | `SECOND_PREVIOUS_FACTOR_AMOUNT` | STRING |
| 80 | `SECOND_PREVIOUS_FACTOR_DATE` | STRING |
| 81 | `DAY_DELAY` | STRING |
| 82 | `CPI_RATIO_SIGN` | STRING |
| 83 | `CPI_RATIO` | STRING |
| 84 | `CPI_RATIO_DATE` | STRING |
| 85 | `DATED_DATE_CPI_SIGN` | STRING |
| 86 | `DATED_DATE_CPI` | STRING |
| 87 | `CURRENT_COUPON_EFFECTIVE_DATE` | STRING |
| 88 | `NEXT_STEPPED_COUPON_RATE_SIGN` | STRING |
| 89 | `NEXT_STEPPED_COUPON_RATE` | STRING |
| 90 | `NEXT_COUPON_RESET_DATE` | STRING |
| 91 | `COUPON_RESET_FREQUENCY` | STRING |
| 92 | `COUPON_RATE_MINIMUM_SIGN` | STRING |
| 93 | `COUPON_RATE_MINIMUM` | STRING |
| 94 | `COUPON_RATE_MAXIMUM_SIGN` | STRING |
| 95 | `COUPON_RATE_MAXIMUM` | STRING |
| 96 | `COUPON_TYPE_CODE` | STRING |
| 97 | `COUPON_FORMULA_TEXT` | STRING |
| 98 | `COUPON_FORMULA_EFFECTIVE_DATE` | STRING |
| 99 | `COUPON_FORMULA_BENCHMARK_1` | STRING |
| 100 | `COUPON_FORMULA_BENCHMARK_2` | STRING |
| 101 | `COUPON_FORMULA_BENCHMARK_3` | STRING |
| 102 | `COUPON_FORMULA_BENCHMARK_4` | STRING |
| 103 | `COUPON_FORMULA_BENCHMARK_5` | STRING |
| 104 | `COUPON_FORMULA_BENCHMARK_6` | STRING |
| 105 | `DEFAULT_TYPE_CODE` | STRING |
| 106 | `DEFAULT_DATE` | STRING |
| 107 | `CALL_FREQUENCY_CODE` | STRING |
| 108 | `MAKE_WHOLE_INDICATOR` | STRING |
| 109 | `EXTRAORDINARY_CALL_INDICATOR` | STRING |
| 110 | `MUNICIPAL_REDEMPTION_TYPE` | STRING |
| 111 | `MUNICIPAL_REDEMPTION_TYPE_` | STRING |
| 112 | `MANDATORY_PUT_DATE` | STRING |
| 113 | `MANDATORY_PUT_PRICE_SIGN` | STRING |
| 114 | `MANDATORY_PUT_PRICE` | STRING |
| 115 | `NEXT_CALL_DATE` | STRING |
| 116 | `NEXT_CALL_PRICE_SIGN` | STRING |
| 117 | `NEXT_CALL_PRICE` | STRING |
| 118 | `FIRST_PAR_CALL_DATE` | STRING |
| 119 | `FIRST_PAR_CALL_PRICE_SIGN` | STRING |
| 120 | `FIRST_PAR_CALL_PRICE` | STRING |
| 121 | `NEXT_PUT_PRICE_SIGN` | STRING |
| 122 | `NEXT_PUT_PRICE` | STRING |
| 123 | `NEXT_PUT_DATE` | STRING |
| 124 | `CALL_NOTIFICATION_MINIMUM` | STRING |
| 125 | `CONTINUOUSLY_CALLABLE_EFFECTIVE` | STRING |
| 126 | `NEXT_SINK_DATE` | STRING |
| 127 | `NEXT_SINK_TYPE` | STRING |
| 128 | `NEXT_SINK_PRICE_SIGN` | STRING |
| 129 | `NEXT_SINK_PRICE` | STRING |
| 130 | `NEXT_SINK_AMOUNT_SIGN` | STRING |
| 131 | `NEXT_SINK_AMOUNT` | STRING |
| 132 | `AUCTION_RATE_PREFERRED_INDICATOR` | STRING |
| 133 | `VARIABLE_RATE_INDICATOR` | STRING |
| 134 | `UIT_FUND_FAMILY_CODE` | STRING |
| 135 | `UIT_FUND_FAMILY_SPONSOR` | STRING |
| 136 | `UIT_FUND_FAMILY_NUMBER` | STRING |
| 137 | `REDEMPTION_CALL_INDICATOR` | STRING |
| 138 | `REDEMPTION_PUT_INDICATOR` | STRING |
| 139 | `OPTION_CONTRACT_ID` | STRING |
| 140 | `OPTION_SYMBOL_ID` | STRING |
| 141 | `OPTION_CALL_PUT_INDICATOR` | STRING |
| 142 | `CONVERSION_RATIO_SIGN` | STRING |
| 143 | `CONVERSION_RATIO` | STRING |
| 144 | `PRIMARY_EXCHANGE_2` | STRING |
| 145 | `TRADABLE_FLAG` | STRING |
| 146 | `CALL_DEFEASED_INDICATOR` | STRING |
| 147 | `SINK_DEFEASED_INDICATOR` | STRING |
| 148 | `BANK_QUALIFIED_INDICATOR` | STRING |
| 149 | `ALTERNATIVE_INVESTMENT` | STRING |
| 150 | `CALLABLE_DATE` | STRING |
| 151 | `MARGIN_CODE` | STRING |
| 152 | `MARGIN_PRICE_EFFECTIVE_DATE` | STRING |
| 153 | `MARGIN_PRICE_EXPIRE_DATE` | STRING |
| 154 | `STRIKE_PRICE` | STRING |
| 155 | `WORTHLESS_SECURITY_INDICATOR` | STRING |
| 156 | `INTEREST_POSTING_CODE` | STRING |
| 157 | `DEBT_MATURITY_DATE_2` | STRING |
| 158 | `LAST_CHANGED_DATE` | STRING |
| 159 | `MONEY_MARKET_FUND_DESIGNATION` | STRING |
| 160 | `FILLER_2` | STRING |
| 161 | `MATURITY_VALUE_LINKED_CODE` | STRING |
| 162 | `FILLER_3` | STRING |
| 163 | `EffectiveDate` | STRING |
| 164 | `FileClient` | STRING |
| 165 | `FileRowCount` | STRING |
| 166 | `FileName` | STRING |
| 167 | `FileDate` | DATE |
| 168 | `AddTimestamp` | STRING |

### fidelity.feed_raw_transactions

| # | Column | Type |
|---|--------|------|
| 1 | `RecordNumber` | STRING |
| 2 | `Branch` | STRING |
| 3 | `AccountNumber` | STRING |
| 4 | `AccountType` | STRING |
| 5 | `Cusip` | STRING |
| 6 | `KeyCode` | STRING |
| 7 | `TransactionType_mnemonic_` | STRING |
| 8 | `BkpgReferenceNumber` | STRING |
| 9 | `RunDate` | STRING |
| 10 | `EntryDate` | STRING |
| 11 | `OffsetAcctType` | STRING |
| 12 | `BookkeepingQuantity` | STRING |
| 13 | `BookkeepingQuantitySign` | STRING |
| 14 | `BookkeepingAmount` | STRING |
| 15 | `BookkeepingAmountSign` | STRING |
| 16 | `BookkeepingMarketValue` | STRING |
| 17 | `BookkeepingMarketValueSign` | STRING |
| 18 | `NumberOfSecurityDescriptionLines` | STRING |
| 19 | `BkpgDescriptionLine1` | STRING |
| 20 | `BkpgDescriptionLine2` | STRING |
| 21 | `BkpgDescriptionLine3` | STRING |
| 22 | `BkpgDescriptionLine4` | STRING |
| 23 | `BkpgDescriptionLine5` | STRING |
| 24 | `BkpgDescriptionLine6` | STRING |
| 25 | `BkpgDescriptionLine7` | STRING |
| 26 | `BkpgDescriptionLine8` | STRING |
| 27 | `BkpgDescriptionLine9` | STRING |
| 28 | `TradeDate` | STRING |
| 29 | `SecuritiesInstructions` | STRING |
| 30 | `TransferLegendCode` | STRING |
| 31 | `AlphapriceDollar` | STRING |
| 32 | `AlphapriceSpace` | STRING |
| 33 | `AlphapriceFraction` | STRING |
| 34 | `AccruedInterest` | STRING |
| 35 | `BookkeepingAccruedInterestSign` | STRING |
| 36 | `Commission` | STRING |
| 37 | `CommissionSign` | STRING |
| 38 | `Concession` | STRING |
| 39 | `ConcessionSign` | STRING |
| 40 | `BuySellCode` | STRING |
| 41 | `MarketCode` | STRING |
| 42 | `BlotterCode` | STRING |
| 43 | `TradeType` | STRING |
| 44 | `CancelCode` | STRING |
| 45 | `BkpgCorrectionCode` | STRING |
| 46 | `Batch` | STRING |
| 47 | `RegisteredRepEnterRep` | STRING |
| 48 | `SecurityType` | STRING |
| 49 | `SecurityTypeModifier` | STRING |
| 50 | `SecurityTypeCalculation` | STRING |
| 51 | `OrderType` | STRING |
| 52 | `AgencyCode` | STRING |
| 53 | `RegisteredRepOwningRep_rr_` | STRING |
| 54 | `RegisteredRepExecRep_rr2_` | STRING |
| 55 | `Multi_currencyIndicator` | STRING |
| 56 | `ConsolidatedPrimeBrokerFees` | STRING |
| 57 | `OptionSymbolId` | STRING |
| 58 | `OptionContractId` | STRING |
| 59 | `OptionExpirationDate` | STRING |
| 60 | `OptionCallPutIndicator` | STRING |
| 61 | `OptionStrikePrice` | STRING |
| 62 | `Principal` | STRING |
| 63 | `PrincipalSign` | STRING |
| 64 | `Price` | STRING |
| 65 | `PriceSign` | STRING |
| 66 | `ProratedCommission` | STRING |
| 67 | `ProratedCommissionSign` | STRING |
| 68 | `StateTax` | STRING |
| 69 | `StateTaxSign` | STRING |
| 70 | `TicketCharge` | STRING |
| 71 | `TicketChargeSign` | STRING |
| 72 | `OptionsRegulatoryFee` | STRING |
| 73 | `OptionsRegulatoryFeeSign` | STRING |
| 74 | `FundLoadPercent` | STRING |
| 75 | `FundLoadOverride` | STRING |
| 76 | `SecFee` | STRING |
| 77 | `SecFeeSign` | STRING |
| 78 | `ServiceChargeMiscFee` | STRING |
| 79 | `ServiceChargeMiscFeeSign` | STRING |
| 80 | `AdditionalFeeCode1` | STRING |
| 81 | `AdditionalFeeAmount1` | STRING |
| 82 | `AdditionalFeeAmountSign1` | STRING |
| 83 | `AdditionalFeeCode2` | STRING |
| 84 | `AdditionalFeeAmount2` | STRING |
| 85 | `AdditionalFeeAmountSign2` | STRING |
| 86 | `AdditionalFeeCode3` | STRING |
| 87 | `AdditionalFeeAmount3` | STRING |
| 88 | `AdditionalFeeAmountSign3` | STRING |
| 89 | `AdditionalFeeCode4` | STRING |
| 90 | `AdditionalFeeAmount4` | STRING |
| 91 | `AdditionalFeeAmountSign4` | STRING |
| 92 | `AdditionalFeeCode5` | STRING |
| 93 | `AdditionalFeeAmount5` | STRING |
| 94 | `AdditionalFeeAmountSign5` | STRING |
| 95 | `AdditionalFeeCode6` | STRING |
| 96 | `AdditionalFeeAmount6` | STRING |
| 97 | `AdditionalFeeAmountSign6` | STRING |
| 98 | `MinorExecutingBroker` | STRING |
| 99 | `MinorClearingBroker` | STRING |
| 100 | `MajorExecutingBroker` | STRING |
| 101 | `MajorClearingBroker` | STRING |
| 102 | `CheckNumber` | STRING |
| 103 | `TrustAccountTaxCode` | STRING |
| 104 | `TrustAccountTransactionCategory` | STRING |
| 105 | `TrustAccountAdditionalDescription` | STRING |
| 106 | `BookkeepingQuantityExpanded` | STRING |
| 107 | `BookkeepingQuantitySignExpanded` | STRING |
| 108 | `BookkeepingAmountExpanded` | STRING |
| 109 | `BookkeepingAmountSignExpanded` | STRING |
| 110 | `BookkeepingMarketValueExpanded` | STRING |
| 111 | `BookkeepingMarketValueSignExpanded` | STRING |
| 112 | `AccruedInterestExpanded` | STRING |
| 113 | `BookkeepingAccruedInterestSignExpanded` | STRING |
| 114 | `CommissionExpanded` | STRING |
| 115 | `CommissionSignExpanded` | STRING |
| 116 | `Filler1` | STRING |
| 117 | `Isin` | STRING |
| 118 | `Sedol` | STRING |
| 119 | `CurrencyCodeLocal` | STRING |
| 120 | `CurrencyCodeBase` | STRING |
| 121 | `LocalCurrencyPrice` | STRING |
| 122 | `LocalCurrencyFees` | STRING |
| 123 | `LocalCurrencyFeesSign` | STRING |
| 124 | `ReportingCurrencyConversionRate` | STRING |
| 125 | `ShadoParentNumber` | STRING |
| 126 | `ShadoChildNumber` | STRING |
| 127 | `ReportingCurrencyConversionPrice` | STRING |
| 128 | `FxTradeIndicator` | STRING |
| 129 | `FxTradeLink` | STRING |
| 130 | `ShadoCountryCode` | STRING |
| 131 | `LocalCurrencyPrincipal` | STRING |
| 132 | `LocalCurrencyPrincipalSign` | STRING |
| 133 | `LocalCurrencyCommission` | STRING |
| 134 | `LocalCurrencyCommissionSign` | STRING |
| 135 | `LocalCurrencyInterest` | STRING |
| 136 | `LocalCurrencyInterestSign` | STRING |
| 137 | `Filler2` | STRING |
| 138 | `EffectiveDate` | STRING |
| 139 | `FileClient` | STRING |
| 140 | `FileRowCount` | STRING |
| 141 | `FileName` | STRING |
| 142 | `FileDate` | DATE |
| 143 | `AddTimestamp` | STRING |

### fidelity.historical_returns_monthly

| # | Column | Type |
|---|--------|------|
| 1 | `account` | STRING |
| 2 | `date` | STRING |
| 3 | `return_net` | FLOAT64 |
| 4 | `return_gross` | FLOAT64 |
| 5 | `filename` | STRING |
| 6 | `addtimestamp` | STRING |

### fidelity.option_proceeds

| # | Column | Type |
|---|--------|------|
| 1 | `account_number` | STRING |
| 2 | `underlying_stock` | STRING |
| 3 | `date` | DATE |
| 4 | `call_premium` | FLOAT64 |
| 5 | `put_premium` | FLOAT64 |
| 6 | `call_notional` | FLOAT64 |
| 7 | `put_notional` | FLOAT64 |
| 8 | `total_notional` | FLOAT64 |
| 9 | `net_generated_amount` | FLOAT64 |
| 10 | `add_timestamp` | TIMESTAMP |

### fidelity.options_assigned

| # | Column | Type |
|---|--------|------|
| 1 | `date` | DATE |
| 2 | `account_number` | STRING |
| 3 | `underlying_stock` | STRING |
| 4 | `option_type` | STRING |
| 5 | `total_quantity` | FLOAT64 |
| 6 | `total_proceeds` | FLOAT64 |
| 7 | `add_timestamp` | TIMESTAMP |

## client_reporting

Internal mapping and reporting tables — account activity, option premiums, Fidelity↔Caissa and Fidelity↔SSC bridge tables, fund holdings, and report images.

### client_reporting.daily_account_activity

| # | Column | Type |
|---|--------|------|
| 1 | `Date` | DATE |
| 2 | `AccountNumber` | STRING |
| 3 | `Deposits` | FLOAT64 |
| 4 | `Withdrawals` | FLOAT64 |
| 5 | `Dividends` | FLOAT64 |
| 6 | `Interest` | FLOAT64 |
| 7 | `Fees` | FLOAT64 |
| 8 | `AddTimestamp` | STRING |

### client_reporting.daily_option_premium

| # | Column | Type |
|---|--------|------|
| 1 | `Date` | DATE |
| 2 | `AccountNumber` | STRING |
| 3 | `NetOptionPremium` | FLOAT64 |
| 4 | `AddTimestamp` | STRING |

### client_reporting.fidelity_caissa_mapping

| # | Column | Type |
|---|--------|------|
| 1 | `fidelity_account_number` | STRING |
| 2 | `fidelity_name` | STRING |
| 3 | `caissa_fund_name` | STRING |
| 4 | `caissa_fund_code` | STRING |
| 5 | `add_timestamp` | STRING |

### client_reporting.fidelity_ssc_mapping

| # | Column | Type |
|---|--------|------|
| 1 | `fidelity_client_name` | STRING |
| 2 | `fidelity_entity_name` | STRING |
| 3 | `ssc_entity_name` | STRING |
| 4 | `fund` | STRING |
| 5 | `add_timestamp` | STRING |

### client_reporting.fund_holdings

| # | Column | Type |
|---|--------|------|
| 1 | `fund` | STRING |
| 2 | `entity` | STRING |
| 3 | `investment_id` | STRING |
| 4 | `investment_name` | STRING |
| 5 | `style` | STRING |
| 6 | `sub_style` | STRING |
| 7 | `vintage` | STRING |
| 8 | `add_timestamp` | TIMESTAMP |

### client_reporting.images

| # | Column | Type |
|---|--------|------|
| 1 | `name` | STRING |
| 2 | `file_id` | STRING |
| 3 | `size` | INT64 |
| 4 | `mime_type` | STRING |
| 5 | `modified_time` | TIMESTAMP |
| 6 | `folder_id` | STRING |
| 7 | `folder_path` | STRING |
| 8 | `file_url` | STRING |
| 9 | `matik_url` | STRING |
| 10 | `add_timestamp` | TIMESTAMP |

## reporting

Reporting layer — pre-computed views for client reports including account/entity/family hierarchy, holdings, returns, activity, asset class breakdowns, fund positions across liquid and private (VC/DI/RA) investments, benchmark returns, and client report configuration.

### reporting.account_holdings

| # | Column | Type |
|---|--------|------|
| 1 | `account_number` | STRING |
| 2 | `date` | DATE |
| 3 | `symbol` | STRING |
| 4 | `description` | STRING |
| 5 | `asset_class` | STRING |
| 6 | `market_value` | FLOAT64 |
| 7 | `weight_pct` | FLOAT64 |

### reporting.account_monthly_activity

| # | Column | Type |
|---|--------|------|
| 1 | `account_number` | STRING |
| 2 | `month_start_date` | DATE |
| 3 | `month_label` | STRING |
| 4 | `date` | DATE |
| 5 | `deposits` | FLOAT64 |
| 6 | `withdrawals` | FLOAT64 |
| 7 | `dividends` | FLOAT64 |
| 8 | `interest` | FLOAT64 |
| 9 | `fees` | FLOAT64 |
| 10 | `net_flows` | FLOAT64 |

### reporting.account_returns

| # | Column | Type |
|---|--------|------|
| 1 | `family_name` | STRING |
| 2 | `entity_name` | STRING |
| 3 | `account_number` | STRING |
| 4 | `account_display_name` | STRING |
| 5 | `date` | DATE |
| 6 | `qtd_twror` | FLOAT64 |
| 7 | `ytd_twror` | FLOAT64 |
| 8 | `trailing_1yr_annualized_twror` | FLOAT64 |
| 9 | `trailing_3yr_annualized_twror` | FLOAT64 |
| 10 | `itd_annualized_twror` | FLOAT64 |

### reporting.account_summary

| # | Column | Type |
|---|--------|------|
| 1 | `account_number` | STRING |
| 2 | `account_display_name` | STRING |
| 3 | `entity_name` | STRING |
| 4 | `family_name` | STRING |
| 5 | `date` | DATE |
| 6 | `market_value` | FLOAT64 |
| 7 | `account_type` | STRING |
| 8 | `benchmark` | STRING |
| 9 | `established_date` | DATE |

### reporting.account_top_holdings

| # | Column | Type |
|---|--------|------|
| 1 | `account_number` | STRING |
| 2 | `date` | DATE |
| 3 | `symbol` | STRING |
| 4 | `description` | STRING |
| 5 | `asset_class` | STRING |
| 6 | `market_value` | FLOAT64 |
| 7 | `weight_pct` | FLOAT64 |

### reporting.account_type_summaries

| # | Column | Type |
|---|--------|------|
| 1 | `account_number` | STRING |
| 2 | `as_of_date` | DATE |
| 3 | `source` | STRING |
| 4 | `metric_name` | STRING |
| 5 | `metric_value_numeric` | FLOAT64 |
| 6 | `metric_value_text` | STRING |

### reporting.account_value_history

| # | Column | Type |
|---|--------|------|
| 1 | `account_number` | STRING |
| 2 | `date` | DATE |
| 3 | `market_value` | FLOAT64 |

### reporting.benchmark_returns

| # | Column | Type |
|---|--------|------|
| 1 | `benchmark_name` | STRING |
| 2 | `description` | STRING |
| 3 | `asset_class` | STRING |
| 4 | `date` | DATE |
| 5 | `ytd_return` | FLOAT64 |
| 6 | `trailing_1y_return` | FLOAT64 |
| 7 | `trailing_3y_return` | FLOAT64 |

### reporting.client_config

| # | Column | Type |
|---|--------|------|
| 1 | `family_name` | STRING |
| 2 | `display_name` | STRING |
| 3 | `is_active` | BOOL |
| 4 | `report_type` | STRING |
| 5 | `theme` | STRING |
| 6 | `include_dividend_interest_breakout` | BOOL |
| 7 | `commentary_mode` | STRING |
| 8 | `manual_commentary` | STRING |
| 9 | `primary_color` | STRING |
| 10 | `secondary_color` | STRING |
| 11 | `accent_color` | STRING |
| 12 | `logo_gcs_path` | STRING |
| 13 | `docsend_space_id` | STRING |
| 14 | `email_recipients` | STRING |
| 15 | `email_cc` | STRING |
| 16 | `email_subject_template` | STRING |

### reporting.client_families

| # | Column | Type |
|---|--------|------|
| 1 | `family_name` | STRING |

### reporting.daily_account_activity

| # | Column | Type |
|---|--------|------|
| 1 | `account_number` | STRING |
| 2 | `date` | DATE |
| 3 | `deposits` | FLOAT64 |
| 4 | `withdrawals` | FLOAT64 |
| 5 | `dividends` | FLOAT64 |
| 6 | `interest` | FLOAT64 |
| 7 | `fees` | FLOAT64 |
| 8 | `option_premium` | FLOAT64 |
| 9 | `net_flows` | FLOAT64 |
| 10 | `family_name` | STRING |
| 11 | `entity_name` | STRING |

### reporting.daily_account_values

| # | Column | Type |
|---|--------|------|
| 1 | `account_number` | STRING |
| 2 | `date` | DATE |
| 3 | `market_value` | FLOAT64 |
| 4 | `family_name` | STRING |
| 5 | `entity_name` | STRING |

### reporting.entity_accounts

| # | Column | Type |
|---|--------|------|
| 1 | `account_number` | STRING |
| 2 | `family_name` | STRING |
| 3 | `entity_name` | STRING |
| 4 | `account_display_name` | STRING |
| 5 | `account_type` | STRING |
| 6 | `established_date` | DATE |
| 7 | `benchmark` | STRING |

### reporting.entity_asset_class_breakdown

| # | Column | Type |
|---|--------|------|
| 1 | `family_name` | STRING |
| 2 | `entity_name` | STRING |
| 3 | `date` | DATE |
| 4 | `asset_class` | STRING |
| 5 | `market_value` | FLOAT64 |

### reporting.entity_ending_values

| # | Column | Type |
|---|--------|------|
| 1 | `family_name` | STRING |
| 2 | `entity_name` | STRING |
| 3 | `date` | DATE |
| 4 | `ending_value` | FLOAT64 |

### reporting.entity_returns

| # | Column | Type |
|---|--------|------|
| 1 | `family_name` | STRING |
| 2 | `entity_name` | STRING |
| 3 | `date` | DATE |
| 4 | `qtd_twror` | FLOAT64 |
| 5 | `ytd_twror` | FLOAT64 |
| 6 | `trailing_1yr_annualized_twror` | FLOAT64 |
| 7 | `trailing_3yr_annualized_twror` | FLOAT64 |
| 8 | `itd_annualized_twror` | FLOAT64 |

### reporting.family_asset_class_breakdown

| # | Column | Type |
|---|--------|------|
| 1 | `family_name` | STRING |
| 2 | `date` | DATE |
| 3 | `asset_class` | STRING |
| 4 | `market_value` | FLOAT64 |

### reporting.family_entities

| # | Column | Type |
|---|--------|------|
| 1 | `family_name` | STRING |
| 2 | `entity_name` | STRING |

### reporting.family_returns

| # | Column | Type |
|---|--------|------|
| 1 | `family_name` | STRING |
| 2 | `date` | DATE |
| 3 | `mtd_twror` | FLOAT64 |
| 4 | `qtd_twror` | FLOAT64 |
| 5 | `ytd_twror` | FLOAT64 |
| 6 | `itd_cumulative_twror` | FLOAT64 |
| 7 | `itd_annualized_twror` | FLOAT64 |
| 8 | `trailing_1yr_cumulative_twror` | FLOAT64 |
| 9 | `trailing_1yr_annualized_twror` | FLOAT64 |
| 10 | `trailing_3yr_cumulative_twror` | FLOAT64 |
| 11 | `trailing_3yr_annualized_twror` | FLOAT64 |

### reporting.fund_positions

| # | Column | Type |
|---|--------|------|
| 1 | `family_name` | STRING |
| 2 | `entity_name` | STRING |
| 3 | `fund_name` | STRING |
| 4 | `fund_type` | STRING |
| 5 | `as_of_date` | DATE |
| 6 | `beginning_market_value` | FLOAT64 |
| 7 | `ending_market_value` | FLOAT64 |
| 8 | `net_capital_flow` | FLOAT64 |
| 9 | `total_gain_loss` | FLOAT64 |
| 10 | `is_latest` | BOOL |

### reporting.fund_positions_di

| # | Column | Type |
|---|--------|------|
| 1 | `family_name` | STRING |
| 2 | `entity_name` | STRING |
| 3 | `ssc_entity_name` | STRING |
| 4 | `fund_entity_code` | STRING |
| 5 | `month_end_date` | DATE |
| 6 | `ending_net_balance` | FLOAT64 |
| 7 | `net_ror_qtd` | FLOAT64 |
| 8 | `net_ror_ytd` | FLOAT64 |
| 9 | `mtd_contributions` | FLOAT64 |
| 10 | `mtd_redemptions` | FLOAT64 |

### reporting.fund_positions_ra

| # | Column | Type |
|---|--------|------|
| 1 | `family_name` | STRING |
| 2 | `entity_name` | STRING |
| 3 | `ssc_entity_name` | STRING |
| 4 | `end_date` | DATE |
| 5 | `commitment` | FLOAT64 |
| 6 | `unfunded_commitment` | FLOAT64 |
| 7 | `beginning_balance` | FLOAT64 |
| 8 | `ending_balance` | FLOAT64 |
| 9 | `ror` | FLOAT64 |
| 10 | `net_irr` | FLOAT64 |
| 11 | `gross_irr` | FLOAT64 |

### reporting.fund_positions_vc

| # | Column | Type |
|---|--------|------|
| 1 | `family_name` | STRING |
| 2 | `entity_name` | STRING |
| 3 | `ssc_entity_name` | STRING |
| 4 | `fund_entity_code` | STRING |
| 5 | `quarter_end_date` | DATE |
| 6 | `commitment` | FLOAT64 |
| 7 | `unfunded_commitment` | FLOAT64 |
| 8 | `ending_net_balance` | FLOAT64 |
| 9 | `qtd_contributions` | FLOAT64 |
| 10 | `qtd_redemptions` | FLOAT64 |
| 11 | `qtd_gross_pl` | FLOAT64 |
| 12 | `net_ror_qtd` | FLOAT64 |
| 13 | `net_ror_ytd` | FLOAT64 |
| 14 | `net_ror_itd` | FLOAT64 |

### reporting.fund_summary_di

| # | Column | Type |
|---|--------|------|
| 1 | `family_name` | STRING |
| 2 | `entity_name` | STRING |
| 3 | `investor_name` | STRING |
| 4 | `ending_net_balance` | FLOAT64 |
| 5 | `net_ror_qtd` | FLOAT64 |
| 6 | `net_ror_ytd` | FLOAT64 |
| 7 | `report_date` | DATE |

### reporting.fund_summary_ra

| # | Column | Type |
|---|--------|------|
| 1 | `family_name` | STRING |
| 2 | `entity_name` | STRING |
| 3 | `partner_name` | STRING |
| 4 | `commitment` | FLOAT64 |
| 5 | `unfunded_commitment` | FLOAT64 |
| 6 | `ending_balance` | FLOAT64 |
| 7 | `ror` | FLOAT64 |
| 8 | `net_irr` | FLOAT64 |
| 9 | `report_date` | DATE |

### reporting.fund_summary_vc

| # | Column | Type |
|---|--------|------|
| 1 | `family_name` | STRING |
| 2 | `entity_name` | STRING |
| 3 | `investor_name` | STRING |
| 4 | `commitment` | FLOAT64 |
| 5 | `unfunded_commitment` | FLOAT64 |
| 6 | `ending_net_balance` | FLOAT64 |
| 7 | `net_ror_qtd` | FLOAT64 |
| 8 | `net_ror_ytd` | FLOAT64 |
| 9 | `net_ror_itd` | FLOAT64 |
| 10 | `report_date` | DATE |

### reporting.private_fund_returns

| # | Column | Type |
|---|--------|------|
| 1 | `fund` | STRING |
| 2 | `entity` | STRING |
| 3 | `date` | DATE |
| 4 | `mtd_twror` | FLOAT64 |
| 5 | `qtd_twror` | FLOAT64 |
| 6 | `ytd_twror` | FLOAT64 |
| 7 | `itd_cumulative_twror` | FLOAT64 |
| 8 | `itd_annualized_twror` | FLOAT64 |
| 9 | `trailing_1yr_cumulative_twror` | FLOAT64 |
| 10 | `trailing_1yr_annualized_twror` | FLOAT64 |
| 11 | `trailing_3yr_cumulative_twror` | FLOAT64 |
| 12 | `trailing_3yr_annualized_twror` | FLOAT64 |

### reporting.vc_commitments

| # | Column | Type |
|---|--------|------|
| 1 | `family_name` | STRING |
| 2 | `entity_name` | STRING |
| 3 | `ssc_entity_name` | STRING |
| 4 | `fund_entity_code` | STRING |
| 5 | `investment` | STRING |
| 6 | `description` | STRING |
| 7 | `original_commitment` | FLOAT64 |
| 8 | `end_commitment_balance` | FLOAT64 |
| 9 | `market_value` | FLOAT64 |
| 10 | `cost_basis` | FLOAT64 |
| 11 | `unrealized_gl` | FLOAT64 |
| 12 | `start_date` | DATE |
| 13 | `end_date` | DATE |

### reporting.vc_returns

| # | Column | Type |
|---|--------|------|
| 1 | `family_name` | STRING |
| 2 | `entity_name` | STRING |
| 3 | `as_of_date` | DATE |
| 4 | `net_irr` | FLOAT64 |
| 5 | `since_inception_return` | FLOAT64 |
| 6 | `market_value` | FLOAT64 |

## caissa

Caissa portfolio management platform — performance returns, capital account summaries (daily/monthly/quarterly), commitments, portfolio hierarchy, fund metadata, benchmarks, and exposures.

### caissa.benchmark_daily_returns

| # | Column | Type |
|---|--------|------|
| 1 | `benchmark_id` | INT64 |
| 2 | `date` | DATE |
| 3 | `return` | FLOAT64 |
| 4 | `add_timestamp` | TIMESTAMP |

### caissa.benchmark_summary_returns

| # | Column | Type |
|---|--------|------|
| 1 | `benchmark_id` | INT64 |
| 2 | `date` | DATE |
| 3 | `ytd_return` | FLOAT64 |
| 4 | `trailing_1y_return` | FLOAT64 |
| 5 | `trailing_3y_return` | FLOAT64 |
| 6 | `add_timestamp` | TIMESTAMP |

### caissa.benchmarks

| # | Column | Type |
|---|--------|------|
| 1 | `id` | INT64 |
| 2 | `name` | STRING |
| 3 | `short_name` | STRING |
| 4 | `description` | STRING |
| 5 | `asset_class` | STRING |
| 6 | `add_timestamp` | TIMESTAMP |

### caissa.capital_account_summary_daily

| # | Column | Type |
|---|--------|------|
| 1 | `start_date` | DATE |
| 2 | `end_date` | DATE |
| 3 | `entity_code` | STRING |
| 4 | `entity_name` | STRING |
| 5 | `parent_portfolio` | STRING |
| 6 | `beginning_market_value` | FLOAT64 |
| 7 | `contribution` | FLOAT64 |
| 8 | `withdrawal` | FLOAT64 |
| 9 | `weighted_administrative_contribution_bod` | FLOAT64 |
| 10 | `weighted_administrative_withdrawal_bod` | FLOAT64 |
| 11 | `net_capital_flow` | FLOAT64 |
| 12 | `management_fees` | FLOAT64 |
| 13 | `incentive_fees` | FLOAT64 |
| 14 | `other_fees_expenses` | FLOAT64 |
| 15 | `all_fees_expenses` | FLOAT64 |
| 16 | `all_income` | FLOAT64 |
| 17 | `unrealized_gain_loss` | FLOAT64 |
| 18 | `total_gain_loss` | FLOAT64 |
| 19 | `ending_market_value` | FLOAT64 |
| 20 | `type` | STRING |
| 21 | `report_date` | DATE |
| 22 | `tag` | STRING |
| 23 | `daily` | FLOAT64 |
| 24 | `file_name` | STRING |
| 25 | `add_timestamp` | TIMESTAMP |

### caissa.capital_account_summary_monthly

| # | Column | Type |
|---|--------|------|
| 1 | `start_date` | DATE |
| 2 | `end_date` | DATE |
| 3 | `entity_code` | STRING |
| 4 | `entity_name` | STRING |
| 5 | `parent_portfolio` | STRING |
| 6 | `beginning_market_value` | FLOAT64 |
| 7 | `contribution` | FLOAT64 |
| 8 | `withdrawal` | FLOAT64 |
| 9 | `weighted_administrative_contribution_bod` | FLOAT64 |
| 10 | `weighted_administrative_withdrawal_bod` | FLOAT64 |
| 11 | `net_capital_flow` | FLOAT64 |
| 12 | `management_fees` | FLOAT64 |
| 13 | `incentive_fees` | FLOAT64 |
| 14 | `other_fees_expenses` | FLOAT64 |
| 15 | `all_fees_expenses` | FLOAT64 |
| 16 | `all_income` | FLOAT64 |
| 17 | `unrealized_gain_loss` | FLOAT64 |
| 18 | `total_gain_loss` | FLOAT64 |
| 19 | `ending_market_value` | FLOAT64 |
| 20 | `type` | STRING |
| 21 | `report_date` | DATE |
| 22 | `tag` | STRING |
| 23 | `twror` | FLOAT64 |
| 24 | `modified_dietz_monthly` | FLOAT64 |
| 25 | `modified_dietz_quarterly` | FLOAT64 |
| 26 | `file_name` | STRING |
| 27 | `add_timestamp` | STRING |

### caissa.capital_account_summary_quarterly

| # | Column | Type |
|---|--------|------|
| 1 | `start_date` | DATE |
| 2 | `end_date` | DATE |
| 3 | `entity_code` | STRING |
| 4 | `entity_name` | STRING |
| 5 | `parent_portfolio` | STRING |
| 6 | `beginning_market_value` | FLOAT64 |
| 7 | `contribution` | FLOAT64 |
| 8 | `withdrawal` | FLOAT64 |
| 9 | `weighted_administrative_contribution_bod` | FLOAT64 |
| 10 | `weighted_administrative_withdrawal_bod` | FLOAT64 |
| 11 | `net_capital_flow` | FLOAT64 |
| 12 | `management_fees` | FLOAT64 |
| 13 | `incentive_fees` | FLOAT64 |
| 14 | `other_fees_expenses` | FLOAT64 |
| 15 | `all_fees_expenses` | FLOAT64 |
| 16 | `all_income` | FLOAT64 |
| 17 | `unrealized_gain_loss` | FLOAT64 |
| 18 | `total_gain_loss` | FLOAT64 |
| 19 | `ending_market_value` | FLOAT64 |
| 20 | `type` | STRING |
| 21 | `report_date` | DATE |
| 22 | `tag` | STRING |
| 23 | `file_name` | STRING |
| 24 | `add_timestamp` | STRING |

### caissa.commitments

| # | Column | Type |
|---|--------|------|
| 1 | `as_of_date` | DATE |
| 2 | `run_date` | DATE |
| 3 | `portfolio_level_1` | STRING |
| 4 | `portfolio_level_2` | STRING |
| 5 | `portfolio_level_3` | STRING |
| 6 | `fund_name` | STRING |
| 7 | `commitment_code` | STRING |
| 8 | `fund_code` | STRING |
| 9 | `vintage` | STRING |
| 10 | `style` | STRING |
| 11 | `reported_valuation_date` | DATE |
| 12 | `reported_valuation` | FLOAT64 |
| 13 | `adjusted_valuation` | FLOAT64 |
| 14 | `commitment_amount` | FLOAT64 |
| 15 | `unfunded_commitment` | FLOAT64 |
| 16 | `paid_in_since_inception` | FLOAT64 |
| 17 | `distribution_since_inception` | FLOAT64 |
| 18 | `total_value` | FLOAT64 |
| 19 | `dpi` | FLOAT64 |
| 20 | `rvpi` | FLOAT64 |
| 21 | `tvpi` | FLOAT64 |
| 22 | `since_inception_irr` | FLOAT64 |
| 23 | `file_name` | STRING |
| 24 | `add_timestamp` | TIMESTAMP |

### caissa.custom_fields

| # | Column | Type |
|---|--------|------|
| 1 | `fund` | STRING |
| 2 | `investment_program` | STRING |
| 3 | `style` | STRING |
| 4 | `vintage` | FLOAT64 |
| 5 | `file_name` | STRING |
| 6 | `add_timestamp` | TIMESTAMP |

### caissa.exposures

| # | Column | Type |
|---|--------|------|
| 1 | `as_of_date` | DATE |
| 2 | `run_date` | DATE |
| 3 | `portfolio_level_1` | STRING |
| 4 | `portfolio_level_2` | STRING |
| 5 | `portfolio_level_3` | STRING |
| 6 | `fund_name` | STRING |
| 7 | `position_name` | STRING |
| 8 | `long` | FLOAT64 |
| 9 | `short` | FLOAT64 |
| 10 | `net` | FLOAT64 |
| 11 | `gross` | FLOAT64 |
| 12 | `long_amount` | FLOAT64 |
| 13 | `short_amount` | FLOAT64 |
| 14 | `net_amount` | FLOAT64 |
| 15 | `gross_amount` | FLOAT64 |
| 16 | `percent_of_long` | FLOAT64 |
| 17 | `percent_of_short` | FLOAT64 |
| 18 | `percent_of_net` | FLOAT64 |
| 19 | `percent_of_gross` | FLOAT64 |
| 20 | `file_name` | STRING |
| 21 | `add_timestamp` | TIMESTAMP |

### caissa.funds

| # | Column | Type |
|---|--------|------|
| 1 | `fund_code` | STRING |
| 2 | `fund_name` | STRING |
| 3 | `firm_name` | STRING |
| 4 | `fund_type` | STRING |
| 5 | `fund_currency` | STRING |
| 6 | `class_name` | STRING |
| 7 | `class_code` | STRING |
| 8 | `commitment_amount` | FLOAT64 |
| 9 | `commitment_closing_date` | TIMESTAMP |
| 10 | `commitment_code` | STRING |
| 11 | `portfolio_name` | STRING |
| 12 | `portfolio_code` | STRING |
| 13 | `portfolio_currency` | STRING |
| 14 | `file_name` | STRING |
| 15 | `add_timestamp` | TIMESTAMP |

### caissa.portfolio_hierarchy

| # | Column | Type |
|---|--------|------|
| 1 | `fund` | STRING |
| 2 | `portfolio_level_1` | STRING |
| 3 | `portfolio_level_2` | STRING |
| 4 | `portfolio_level_3` | STRING |
| 5 | `portfolio_level_4` | STRING |
| 6 | `portfolio_level_5` | STRING |
| 7 | `portfolio_level_6` | STRING |
| 8 | `portfolio_level_7` | STRING |
| 9 | `portfolio_level_8` | STRING |
| 10 | `portfolio_level_9` | STRING |
| 11 | `portfolio_level_10` | STRING |
| 12 | `file_name` | STRING |
| 13 | `add_timestamp` | STRING |

### caissa.returns

| # | Column | Type |
|---|--------|------|
| 1 | `run_time` | DATE |
| 2 | `as_of_date` | DATE |
| 3 | `currency` | STRING |
| 4 | `book_closing_calendar_time_matched` | STRING |
| 5 | `valuation_reported_as_of_latest` | STRING |
| 6 | `accounting_data_created_as_of_latest` | STRING |
| 7 | `portfolio` | STRING |
| 8 | `portfolio_level_1` | STRING |
| 9 | `portfolio_level_2` | STRING |
| 10 | `portfolio_level_3` | STRING |
| 11 | `fund` | STRING |
| 12 | `fund_id` | STRING |
| 13 | `investment_class` | STRING |
| 14 | `market_value` | FLOAT64 |
| 15 | `weight` | FLOAT64 |
| 16 | `qtd` | FLOAT64 |
| 17 | `qtd_not_strict` | FLOAT64 |
| 18 | `ytd` | FLOAT64 |
| 19 | `ytd_not_strict` | FLOAT64 |
| 20 | `trailing_1_yr` | FLOAT64 |
| 21 | `trailing_1_yr_not_strict` | FLOAT64 |
| 22 | `trailing_3_yrs` | FLOAT64 |
| 23 | `trailing_3_yrs_ann` | FLOAT64 |
| 24 | `trailing_3_yrs_ann_not_strict` | FLOAT64 |
| 25 | `since_inception_ann_not_strict` | FLOAT64 |
| 26 | `since_inception_irr` | FLOAT64 |
| 27 | `inception_date` | DATE |
| 28 | `return_source` | STRING |
| 29 | `file_name` | STRING |
| 30 | `add_timestamp` | TIMESTAMP |

## returns

Computed TWROR return series — daily and monthly liquid/private returns, and periodic (MTD/QTD/YTD/ITD/trailing) returns at account, entity, and family levels.

### returns.daily_liquid_returns

| # | Column | Type |
|---|--------|------|
| 1 | `date` | DATE |
| 2 | `account_number` | STRING |
| 3 | `beginning_market_value` | FLOAT64 |
| 4 | `desposits` | FLOAT64 |
| 5 | `withdrawals` | FLOAT64 |
| 6 | `net_capital_flow` | FLOAT64 |
| 7 | `ending_market_value` | FLOAT64 |
| 8 | `daily_twror` | FLOAT64 |
| 9 | `daily_cumulative_twror` | FLOAT64 |
| 10 | `add_timestamp` | TIMESTAMP |

### returns.daily_private_flows

| # | Column | Type |
|---|--------|------|
| 1 | `date` | DATE |
| 2 | `fund` | STRING |
| 3 | `entity` | STRING |
| 4 | `market_value` | FLOAT64 |
| 5 | `gain_loss` | FLOAT64 |
| 6 | `add_timestamp` | TIMESTAMP |

### returns.daily_private_returns

| # | Column | Type |
|---|--------|------|
| 1 | `date` | DATE |
| 2 | `fund` | STRING |
| 3 | `entity` | STRING |
| 4 | `beginning_market_value` | FLOAT64 |
| 5 | `ending_market_value` | FLOAT64 |
| 6 | `gain_loss` | FLOAT64 |
| 7 | `net_capital_flow` | FLOAT64 |
| 8 | `daily_twror` | FLOAT64 |
| 9 | `daily_cumulative_twror` | FLOAT64 |
| 10 | `add_timestamp` | TIMESTAMP |

### returns.monthly_liquid_returns

| # | Column | Type |
|---|--------|------|
| 1 | `account_number` | STRING |
| 2 | `month_end_date` | DATE |
| 3 | `monthly_twror` | FLOAT64 |
| 4 | `monthly_cumulative_twror` | FLOAT64 |
| 5 | `add_timestamp` | TIMESTAMP |

### returns.monthly_private_returns

| # | Column | Type |
|---|--------|------|
| 1 | `fund` | STRING |
| 2 | `entity` | STRING |
| 3 | `month_end_date` | DATE |
| 4 | `monthly_twror` | FLOAT64 |
| 5 | `monthly_cumulative_twror` | FLOAT64 |
| 6 | `add_timestamp` | TIMESTAMP |

### returns.periodic_entity_liquid_returns

| # | Column | Type |
|---|--------|------|
| 1 | `date` | DATE |
| 2 | `entity_name` | STRING |
| 3 | `mtd_twror` | FLOAT64 |
| 4 | `qtd_twror` | FLOAT64 |
| 5 | `ytd_twror` | FLOAT64 |
| 6 | `itd_cumulative_twror` | FLOAT64 |
| 7 | `itd_annualized_twror` | FLOAT64 |
| 8 | `trailing_1yr_cumulative_twror` | FLOAT64 |
| 9 | `trailing_1yr_annualized_twror` | FLOAT64 |
| 10 | `trailing_3yr_cumulative_twror` | FLOAT64 |
| 11 | `trailing_3yr_annualized_twror` | FLOAT64 |
| 12 | `add_timestamp` | TIMESTAMP |

### returns.periodic_family_liquid_returns

| # | Column | Type |
|---|--------|------|
| 1 | `date` | DATE |
| 2 | `family_name` | STRING |
| 3 | `mtd_twror` | FLOAT64 |
| 4 | `qtd_twror` | FLOAT64 |
| 5 | `ytd_twror` | FLOAT64 |
| 6 | `itd_cumulative_twror` | FLOAT64 |
| 7 | `itd_annualized_twror` | FLOAT64 |
| 8 | `trailing_1yr_cumulative_twror` | FLOAT64 |
| 9 | `trailing_1yr_annualized_twror` | FLOAT64 |
| 10 | `trailing_3yr_cumulative_twror` | FLOAT64 |
| 11 | `trailing_3yr_annualized_twror` | FLOAT64 |
| 12 | `add_timestamp` | TIMESTAMP |

### returns.periodic_liquid_returns

| # | Column | Type |
|---|--------|------|
| 1 | `date` | DATE |
| 2 | `account_number` | STRING |
| 3 | `mtd_twror` | FLOAT64 |
| 4 | `qtd_twror` | FLOAT64 |
| 5 | `ytd_twror` | FLOAT64 |
| 6 | `itd_cumulative_twror` | FLOAT64 |
| 7 | `itd_annualized_twror` | FLOAT64 |
| 8 | `trailing_1yr_cumulative_twror` | FLOAT64 |
| 9 | `trailing_1yr_annualized_twror` | FLOAT64 |
| 10 | `trailing_3yr_cumulative_twror` | FLOAT64 |
| 11 | `trailing_3yr_annualized_twror` | FLOAT64 |
| 12 | `add_timestamp` | TIMESTAMP |

### returns.periodic_private_returns

| # | Column | Type |
|---|--------|------|
| 1 | `date` | DATE |
| 2 | `fund` | STRING |
| 3 | `entity` | STRING |
| 4 | `mtd_twror` | FLOAT64 |
| 5 | `qtd_twror` | FLOAT64 |
| 6 | `ytd_twror` | FLOAT64 |
| 7 | `itd_cumulative_twror` | FLOAT64 |
| 8 | `itd_annualized_twror` | FLOAT64 |
| 9 | `trailing_1yr_cumulative_twror` | FLOAT64 |
| 10 | `trailing_1yr_annualized_twror` | FLOAT64 |
| 11 | `trailing_3yr_cumulative_twror` | FLOAT64 |
| 12 | `trailing_3yr_annualized_twror` | FLOAT64 |
| 13 | `add_timestamp` | TIMESTAMP |

## bbg

Bloomberg reference data — equity fundamentals, fixed income details, options Greeks, and underlying equity price history.

### bbg.equity

| # | Column | Type |
|---|--------|------|
| 1 | `id` | STRING |
| 2 | `name` | STRING |
| 3 | `px_last` | FLOAT64 |
| 4 | `cur_mkt_cap` | FLOAT64 |
| 5 | `pe_ratio` | FLOAT64 |
| 6 | `best_target_price` | FLOAT64 |
| 7 | `px_volume` | FLOAT64 |
| 8 | `eqy_dvd_yld_ind_net` | FLOAT64 |
| 9 | `industry_sector` | STRING |
| 10 | `industry_group` | STRING |
| 11 | `industry_subgroup` | STRING |
| 12 | `prof_margin` | FLOAT64 |
| 13 | `gross_profit` | FLOAT64 |
| 14 | `is_eps` | FLOAT64 |
| 15 | `sales_growth` | FLOAT64 |
| 16 | `cntry_of_risk` | STRING |
| 17 | `add_timestamp` | TIMESTAMP |

### bbg.fixed_income

| # | Column | Type |
|---|--------|------|
| 1 | `id` | STRING |
| 2 | `name` | STRING |
| 3 | `crncy` | STRING |
| 4 | `maturity` | DATE |
| 5 | `yield` | FLOAT64 |
| 6 | `cpn` | FLOAT64 |
| 7 | `cpn_typ` | STRING |
| 8 | `px_last` | FLOAT64 |
| 9 | `nxt_cpn_dt` | DATE |
| 10 | `amt_outstanding` | FLOAT64 |
| 11 | `payment_rank` | STRING |
| 12 | `issue_dt` | DATE |
| 13 | `country_full_name` | STRING |
| 14 | `cntry_of_risk` | STRING |
| 15 | `rtg_sp` | STRING |
| 16 | `rtg_moody` | STRING |
| 17 | `callable` | FLOAT64 |
| 18 | `industry_sector` | STRING |
| 19 | `industry_group` | STRING |
| 20 | `industry_subgroup` | STRING |
| 21 | `add_timestamp` | TIMESTAMP |

### bbg.options

| # | Column | Type |
|---|--------|------|
| 1 | `id` | STRING |
| 2 | `name` | STRING |
| 3 | `px_last` | FLOAT64 |
| 4 | `px_bid` | FLOAT64 |
| 5 | `px_ask` | FLOAT64 |
| 6 | `undl_ticker` | STRING |
| 7 | `expire_dt` | DATE |
| 8 | `strike_px` | FLOAT64 |
| 9 | `put_call` | STRING |
| 10 | `industry_sector` | STRING |
| 11 | `industry_group` | STRING |
| 12 | `industry_subgroup` | STRING |
| 13 | `cntry_of_risk` | STRING |
| 14 | `bs_tot_asset` | FLOAT64 |
| 15 | `delta` | FLOAT64 |
| 16 | `vega` | FLOAT64 |
| 17 | `theta` | FLOAT64 |
| 18 | `px_volume` | FLOAT64 |
| 19 | `cont_size` | INT64 |
| 20 | `add_timestamp` | TIMESTAMP |

### bbg.underlying_equity

| # | Column | Type |
|---|--------|------|
| 1 | `id` | STRING |
| 2 | `name` | STRING |
| 3 | `px_last` | FLOAT64 |
| 4 | `cur_mkt_cap` | FLOAT64 |
| 5 | `pe_ratio` | FLOAT64 |
| 6 | `best_target_price` | FLOAT64 |
| 7 | `px_volume` | INT64 |
| 8 | `eqy_dvd_yld_ind_net` | FLOAT64 |
| 9 | `industry_sector` | STRING |
| 10 | `industry_group` | STRING |
| 11 | `industry_subgroup` | STRING |
| 12 | `prof_margin` | FLOAT64 |
| 13 | `gross_profit` | FLOAT64 |
| 14 | `is_eps` | FLOAT64 |
| 15 | `sales_growth` | FLOAT64 |
| 16 | `cntry_of_risk` | STRING |
| 17 | `add_timestamp` | TIMESTAMP |

### bbg.underlying_equity_price_history

| # | Column | Type |
|---|--------|------|
| 1 | `date` | DATE |
| 2 | `ticker` | STRING |
| 3 | `price` | FLOAT64 |
| 4 | `add_timestamp` | TIMESTAMP |

## parametric

Parametric tax-managed equity data — portfolio summary, realized/unrealized gains, and pre-/after-tax performance.

### parametric.portfolio_data

| # | Column | Type |
|---|--------|------|
| 1 | `client` | STRING |
| 2 | `benchmark` | STRING |
| 3 | `ppa_code` | STRING |
| 4 | `custodian_account_number` | STRING |
| 5 | `st_tax_rate` | FLOAT64 |
| 6 | `lt_tax_rate` | FLOAT64 |
| 7 | `market_value` | FLOAT64 |
| 8 | `number_of_positions` | INT64 |
| 9 | `percent_cash` | FLOAT64 |
| 10 | `net_realized_gl_ytd_st` | FLOAT64 |
| 11 | `net_realized_gl_ytd_lt` | FLOAT64 |
| 12 | `unrealized_gl` | FLOAT64 |
| 13 | `realized_gl_st` | FLOAT64 |
| 14 | `realized_gl_lt` | FLOAT64 |
| 15 | `report_date` | DATE |
| 16 | `filename` | STRING |
| 17 | `add_timestamp` | STRING |

### parametric.portfolio_performance

| # | Column | Type |
|---|--------|------|
| 1 | `client` | STRING |
| 2 | `ppa_code` | STRING |
| 3 | `custodian_account_number` | STRING |
| 4 | `inception_date` | DATE |
| 5 | `pre_tax_last_month_portfolio` | FLOAT64 |
| 6 | `pre_tax_last_month_reporting_benchmark` | FLOAT64 |
| 7 | `pre_tax_qtd_portfolio` | FLOAT64 |
| 8 | `pre_tax_qtd_reporting_benchmark` | FLOAT64 |
| 9 | `pre_tax_ytd_portfolio` | FLOAT64 |
| 10 | `pre_tax_ytd_reporting_benchmark` | FLOAT64 |
| 11 | `pre_tax_itd_cumulative_portfolio` | FLOAT64 |
| 12 | `pre_tax_itd_cumulative_reporting_benchmark` | FLOAT64 |
| 13 | `pre_tax_itd_annualized_portfolio` | FLOAT64 |
| 14 | `pre_tax_itd_annualized_reporting_benchmark` | FLOAT64 |
| 15 | `after_tax_last_month_portfolio` | FLOAT64 |
| 16 | `after_tax_last_month_reporting_benchmark` | FLOAT64 |
| 17 | `after_tax_last_month_tax_alpha` | FLOAT64 |
| 18 | `after_tax_qtd_portfolio` | FLOAT64 |
| 19 | `after_tax_qtd_reporting_benchmark` | FLOAT64 |
| 20 | `after_tax_qtd_tax_alpha` | FLOAT64 |
| 21 | `after_tax_ytd_portfolio` | FLOAT64 |
| 22 | `after_tax_ytd_reporting_benchmark` | FLOAT64 |
| 23 | `after_tax_ytd_tax_alpha` | FLOAT64 |
| 24 | `after_tax_itd_cumulative_portfolio` | FLOAT64 |
| 25 | `after_tax_itd_cumulative_reporting_benchmark` | FLOAT64 |
| 26 | `after_tax_itd_cumulative_tax_alpha` | FLOAT64 |
| 27 | `after_tax_itd_annualized_portfolio` | FLOAT64 |
| 28 | `after_tax_itd_annualized_reporting_benchmark` | FLOAT64 |
| 29 | `after_tax_itd_annualized_tax_alpha` | FLOAT64 |
| 30 | `report_date` | DATE |
| 31 | `filename` | STRING |
| 32 | `add_timestamp` | STRING |

## pimco

PIMCO fixed income data — monthly portfolio reports for single- and multi-strategy accounts including yields, duration, credit quality, and returns.

### pimco.monthly_multiple_portfolio_reports

| # | Column | Type |
|---|--------|------|
| 1 | `port_code` | STRING |
| 2 | `account_number` | STRING |
| 3 | `state_of_residence` | STRING |
| 4 | `inception_date` | DATE |
| 5 | `performance_start_date` | DATE |
| 6 | `strategy` | STRING |
| 7 | `coupon` | FLOAT64 |
| 8 | `current_yield` | FLOAT64 |
| 9 | `ytm_at_market` | FLOAT64 |
| 10 | `ytw_at_market` | FLOAT64 |
| 11 | `effective_duration` | FLOAT64 |
| 12 | `modified_duration` | FLOAT64 |
| 13 | `ytm_at_cost` | FLOAT64 |
| 14 | `ytw_at_cost` | STRING |
| 15 | `total_market_value` | FLOAT64 |
| 16 | `total_market_value_woaccrued_income` | FLOAT64 |
| 17 | `net_mtd_returns` | FLOAT64 |
| 18 | `net_qtd_returns` | FLOAT64 |
| 19 | `net_1yr_returns` | FLOAT64 |
| 20 | `net_3yr_returns` | FLOAT64 |
| 21 | `net_5yr_returns` | FLOAT64 |
| 22 | `net_10yr_returns` | FLOAT64 |
| 23 | `net_ytd_returns` | FLOAT64 |
| 24 | `net_since_inception_annualized_returns` | FLOAT64 |
| 25 | `gross_mtd_returns` | FLOAT64 |
| 26 | `gross_qtd_returns` | FLOAT64 |
| 27 | `gross_1yr_returns` | FLOAT64 |
| 28 | `gross_3yr_returns` | FLOAT64 |
| 29 | `gross_5yr_returns` | FLOAT64 |
| 30 | `gross_10yr_returns` | FLOAT64 |
| 31 | `gross_ytd_returns` | FLOAT64 |
| 32 | `gross_since_inception_annualized_returns` | FLOAT64 |
| 33 | `benchmark` | STRING |
| 34 | `benchmark_mtd_returns` | FLOAT64 |
| 35 | `benchmark_qtd_returns` | FLOAT64 |
| 36 | `benchmark_1yr_returns` | FLOAT64 |
| 37 | `benchmark_3yr_returns` | FLOAT64 |
| 38 | `benchmark_5yr_returns` | FLOAT64 |
| 39 | `benchmark_10yr_returns` | FLOAT64 |
| 40 | `benchmark_ytd_returns` | FLOAT64 |
| 41 | `benchmark_since_inception_annualized_returns` | FLOAT64 |
| 42 | `average_external_rating` | STRING |
| 43 | `average_internal_rating` | STRING |
| 44 | `net_month_to_date_contributions` | FLOAT64 |
| 45 | `cash_percent` | FLOAT64 |
| 46 | `cash_dollar` | FLOAT64 |
| 47 | `report_date` | DATE |
| 48 | `filename` | STRING |
| 49 | `add_timestamp` | TIMESTAMP |

### pimco.monthly_portfolio_report

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | STRING |
| 2 | `account_number` | STRING |
| 3 | `port_code` | STRING |
| 4 | `strategy` | STRING |
| 5 | `report_date` | DATE |
| 6 | `account_info` | STRING |
| 7 | `cash_and_equivalents` | FLOAT64 |
| 8 | `par_value_including_cash` | FLOAT64 |
| 9 | `market_value_w_o_accrued_income` | FLOAT64 |
| 10 | `accrued_income` | FLOAT64 |
| 11 | `total_market_value` | FLOAT64 |
| 12 | `estimated_annual_income` | FLOAT64 |
| 13 | `number_of_bonds` | FLOAT64 |
| 14 | `performance_inception_date` | DATE |
| 15 | `gross_return_mtd` | FLOAT64 |
| 16 | `gross_return_qtd` | FLOAT64 |
| 17 | `gross_return_ytd` | FLOAT64 |
| 18 | `gross_return_itd` | FLOAT64 |
| 19 | `book_yield_percent` | FLOAT64 |
| 20 | `yield_to_maturity_at_market_percent` | FLOAT64 |
| 21 | `yield_to_worst_at_market_percent` | FLOAT64 |
| 22 | `average_life_yrs` | FLOAT64 |
| 23 | `average_effective_maturity_yrs` | FLOAT64 |
| 24 | `effective_duration` | FLOAT64 |
| 25 | `modified_duration` | FLOAT64 |
| 26 | `convexity` | FLOAT64 |
| 27 | `par_weighted_average_current_price` | FLOAT64 |
| 28 | `par_weighted_average_coupon_rate_percent` | FLOAT64 |
| 29 | `coupon_income_current_yield_percent` | FLOAT64 |
| 30 | `top_corporate_sectors_1` | STRING |
| 31 | `top_corporate_sectors_2` | STRING |
| 32 | `top_corporate_sectors_3` | STRING |
| 33 | `top_corporate_sectors_4` | STRING |
| 34 | `top_corporate_sectors_5` | STRING |
| 35 | `top_corporate_sectors_6` | STRING |
| 36 | `percent_of_corporate_1` | FLOAT64 |
| 37 | `percent_of_corporate_2` | FLOAT64 |
| 38 | `percent_of_corporate_3` | FLOAT64 |
| 39 | `percent_of_corporate_4` | FLOAT64 |
| 40 | `percent_of_corporate_5` | FLOAT64 |
| 41 | `percent_of_corporate_6` | FLOAT64 |
| 42 | `asset_class_1` | STRING |
| 43 | `asset_class_2` | STRING |
| 44 | `asset_class_3` | STRING |
| 45 | `asset_class_4` | STRING |
| 46 | `percent_of_portfolio_asset_class_1` | FLOAT64 |
| 47 | `percent_of_portfolio_asset_class_2` | FLOAT64 |
| 48 | `percent_of_portfolio_asset_class_3` | FLOAT64 |
| 49 | `percent_of_portfolio_asset_class_4` | FLOAT64 |
| 50 | `credit_quality_1` | STRING |
| 51 | `credit_quality_2` | STRING |
| 52 | `credit_quality_3` | STRING |
| 53 | `credit_quality_4` | STRING |
| 54 | `percent_of_portfolio_credit_quality_1` | FLOAT64 |
| 55 | `percent_of_portfolio_credit_quality_2` | FLOAT64 |
| 56 | `percent_of_portfolio_credit_quality_3` | FLOAT64 |
| 57 | `percent_of_portfolio_credit_quality_4` | FLOAT64 |
| 58 | `filename` | STRING |
| 59 | `add_timestamp` | TIMESTAMP |

## quantinno

Quantinno long-short equity data — account-level summary with leverage, realized/unrealized G/L, tax savings, and restrictions.

### quantinno.account_summary

| # | Column | Type |
|---|--------|------|
| 1 | `account_title` | STRING |
| 2 | `custodian` | STRING |
| 3 | `account_number` | STRING |
| 4 | `deals_strategy` | STRING |
| 5 | `exchange_tickers` | STRING |
| 6 | `percent_remaining_in_kind` | FLOAT64 |
| 7 | `account_value` | FLOAT64 |
| 8 | `account_flags` | STRING |
| 9 | `long_leverage_target` | FLOAT64 |
| 10 | `short_leverage_target` | FLOAT64 |
| 11 | `net_leverage_target` | FLOAT64 |
| 12 | `reference` | STRING |
| 13 | `inception_date` | DATE |
| 14 | `primary_advisor` | STRING |
| 15 | `service_contact` | STRING |
| 16 | `restrictions` | INT64 |
| 17 | `restricted_tickers` | STRING |
| 18 | `country_restrictions` | FLOAT64 |
| 19 | `sector_restrictions` | FLOAT64 |
| 20 | `industry_restrictions` | FLOAT64 |
| 21 | `sub_industry_restrictions` | FLOAT64 |
| 22 | `other_restrictions` | FLOAT64 |
| 23 | `long_leverag_actual` | FLOAT64 |
| 24 | `short_leverage_actual` | FLOAT64 |
| 25 | `net_leverage_actual` | FLOAT64 |
| 26 | `realized_st_gl` | FLOAT64 |
| 27 | `realized_lt_gl` | FLOAT64 |
| 28 | `tax_savings` | FLOAT64 |
| 29 | `unrealized_gl` | FLOAT64 |
| 30 | `mtd_realized_gl` | FLOAT64 |
| 31 | `cash_inflows_30d` | FLOAT64 |
| 32 | `cash_outflows_30d` | FLOAT64 |
| 33 | `sec_inflows_30d` | FLOAT64 |
| 34 | `sec_outflows_30d` | FLOAT64 |
| 35 | `filename` | STRING |
| 36 | `as_of_date` | DATE |
| 37 | `add_timestamp` | TIMESTAMP |

## ssc

SS&C fund administrator data — VC, DI, and RA fund accounting including capital registers, holdings, transactions, valuations, trial balances, and commitments.

### ssc.di_accrued_income

| # | Column | Type |
|---|--------|------|
| 1 | `entity` | STRING |
| 2 | `gl_entity` | STRING |
| 3 | `investment` | STRING |
| 4 | `description` | STRING |
| 5 | `class` | STRING |
| 6 | `type` | STRING |
| 7 | `type_description` | STRING |
| 8 | `date` | DATE |
| 9 | `accrual_method` | STRING |
| 10 | `interest_method` | STRING |
| 11 | `coupon` | STRING |
| 12 | `payments` | STRING |
| 13 | `days` | STRING |
| 14 | `settlement_quantity` | STRING |
| 15 | `trade_quantity` | STRING |
| 16 | `capitalization_factor` | STRING |
| 17 | `ccy` | STRING |
| 18 | `purchased_finance` | STRING |
| 19 | `sale_adjustment` | STRING |
| 20 | `partial_finance` | STRING |
| 21 | `missing_finance` | STRING |
| 22 | `finance_charge` | STRING |
| 23 | `local_currency_dividend` | STRING |
| 24 | `purchased_interest` | STRING |
| 25 | `sale_adjustment_1` | STRING |
| 26 | `partial_payments` | STRING |
| 27 | `missing_payments` | STRING |
| 28 | `default_interest` | STRING |
| 29 | `interest_due` | STRING |
| 30 | `tax_withholdings` | STRING |
| 31 | `net_accrual` | STRING |
| 32 | `unrealized_fx_on_aip` | STRING |
| 33 | `unrealized_fx_on_pfc` | STRING |
| 34 | `purchased_finance_1` | STRING |
| 35 | `missing_finance_1` | STRING |
| 36 | `base_currency_dividend` | STRING |
| 37 | `purchased_interest_1` | STRING |
| 38 | `missing_payments_1` | STRING |
| 39 | `tax_withholdings_1` | STRING |
| 40 | `total_accrual` | STRING |
| 41 | `holdings_information` | STRING |
| 42 | `report_date` | DATE |
| 43 | `start_date` | DATE |
| 44 | `end_date` | DATE |
| 45 | `filename` | STRING |
| 46 | `sheet_name` | STRING |
| 47 | `add_timestamp` | TIMESTAMP |

### ssc.di_capital_acct_summary

| # | Column | Type |
|---|--------|------|
| 1 | `entity` | STRING |
| 2 | `partner` | STRING |
| 3 | `description` | STRING |
| 4 | `group_id` | STRING |
| 5 | `item` | STRING |
| 6 | `beginning_balance` | STRING |
| 7 | `contributions` | STRING |
| 8 | `distributions` | STRING |
| 9 | `capital_distributions` | STRING |
| 10 | `income_distributions` | STRING |
| 11 | `change_in_capital_balance` | STRING |
| 12 | `income_allocations` | STRING |
| 13 | `cap_gl_allocations` | STRING |
| 14 | `unreal_allocations` | STRING |
| 15 | `accrued_management_fee` | STRING |
| 16 | `accrued_catch_up` | STRING |
| 17 | `accrued_performance_fee` | STRING |
| 18 | `ending_balance` | STRING |
| 19 | `current_percentage` | STRING |
| 20 | `net_int_load_on_cont_dist` | STRING |
| 21 | `manager_fee_incl_in_cont` | STRING |
| 22 | `net_withheld_on_dist` | STRING |
| 23 | `rate_of_return` | STRING |
| 24 | `entity_desc` | STRING |
| 25 | `report_date` | DATE |
| 26 | `start_date` | DATE |
| 27 | `end_date` | DATE |
| 28 | `filename` | STRING |
| 29 | `sheet_name` | STRING |
| 30 | `add_timestamp` | TIMESTAMP |
| 31 | `gl_entity` | STRING |

### ssc.di_capital_register

| # | Column | Type |
|---|--------|------|
| 1 | `id` | STRING |
| 2 | `name` | STRING |
| 3 | `alternate_identifier` | STRING |
| 4 | `tax_id` | STRING |
| 5 | `gopid` | STRING |
| 6 | `subentitycode` | STRING |
| 7 | `partner_group` | STRING |
| 8 | `share_class` | STRING |
| 9 | `shares` | FLOAT64 |
| 10 | `nav` | FLOAT64 |
| 11 | `mtd_shares_opening` | FLOAT64 |
| 12 | `mtd_shares_contributed` | FLOAT64 |
| 13 | `mtd_shares_redeemed` | FLOAT64 |
| 14 | `mtd_shares_transferred` | FLOAT64 |
| 15 | `qtd_shares_opening` | FLOAT64 |
| 16 | `qtd_shares_contributed` | FLOAT64 |
| 17 | `qtd_shares_redeemed` | FLOAT64 |
| 18 | `qtd_shares_transferred` | FLOAT64 |
| 19 | `ytd_shares_opening` | FLOAT64 |
| 20 | `ytd_shares_contributed` | FLOAT64 |
| 21 | `ytd_shares_redeemed` | FLOAT64 |
| 22 | `ytd_shares_transferred` | FLOAT64 |
| 23 | `month_opening_gross_capital` | FLOAT64 |
| 24 | `month_opening_net_capital` | FLOAT64 |
| 25 | `year_opening_capital` | FLOAT64 |
| 26 | `mtd_contributions` | FLOAT64 |
| 27 | `mtd_redemptions` | FLOAT64 |
| 28 | `mtd_transfers` | FLOAT64 |
| 29 | `mtd_new_issue_income` | FLOAT64 |
| 30 | `mtd_gross_pl` | FLOAT64 |
| 31 | `mtd_management_fees` | FLOAT64 |
| 32 | `mtd_charged_incentive_fees` | FLOAT64 |
| 33 | `mtd_incentive_accrual` | FLOAT64 |
| 34 | `ytd_contributions` | FLOAT64 |
| 35 | `ytd_redemptions` | FLOAT64 |
| 36 | `ytd_transfers` | FLOAT64 |
| 37 | `ytd_new_issue_income` | FLOAT64 |
| 38 | `ytd_gross_pl` | FLOAT64 |
| 39 | `ytd_management_fees` | FLOAT64 |
| 40 | `ytd_charged_incentive_fees` | FLOAT64 |
| 41 | `ytd_incentive_accrual` | FLOAT64 |
| 42 | `ytd_incentive_accrual_1` | FLOAT64 |
| 43 | `mtd_gross_return` | FLOAT64 |
| 44 | `mtd_net_of_mgmt_fee_return` | FLOAT64 |
| 45 | `mtd_net_of_fees_return` | FLOAT64 |
| 46 | `net_ror_qtd` | FLOAT64 |
| 47 | `net_ror_ytd` | FLOAT64 |
| 48 | `month_ending_gross_capital` | FLOAT64 |
| 49 | `ending_gross_capital` | FLOAT64 |
| 50 | `ending_net_balance` | FLOAT64 |
| 51 | `ending_net_balance_1` | FLOAT64 |
| 52 | `entity` | STRING |
| 53 | `report_date` | DATE |
| 54 | `month_end_date` | DATE |
| 55 | `filename` | STRING |
| 56 | `sheet_name` | STRING |
| 57 | `add_timestamp` | TIMESTAMP |

### ssc.di_general_ledger

| # | Column | Type |
|---|--------|------|
| 1 | `key` | STRING |
| 2 | `date` | DATE |
| 3 | `gl_entity` | STRING |
| 4 | `account` | STRING |
| 5 | `ccy` | STRING |
| 6 | `custodian` | STRING |
| 7 | `sub_entity` | STRING |
| 8 | `sub_acct` | STRING |
| 9 | `description` | STRING |
| 10 | `audit_user` | STRING |
| 11 | `jrnl_id` | STRING |
| 12 | `jrnl_type` | STRING |
| 13 | `local_db_amount` | STRING |
| 14 | `cr_amount` | STRING |
| 15 | `base_db_amount` | STRING |
| 16 | `cr_amount_1` | STRING |
| 17 | `audit_user_1` | STRING |
| 18 | `jrnl_id_1` | STRING |
| 19 | `jrnl_type_1` | STRING |
| 20 | `report_date` | DATE |
| 21 | `start_date` | DATE |
| 22 | `end_date` | DATE |
| 23 | `filename` | STRING |
| 24 | `sheet_name` | STRING |
| 25 | `add_timestamp` | TIMESTAMP |

### ssc.di_holdings

| # | Column | Type |
|---|--------|------|
| 1 | `entity` | STRING |
| 2 | `gl_entity` | STRING |
| 3 | `investment` | STRING |
| 4 | `gid` | STRING |
| 5 | `description` | STRING |
| 6 | `class` | STRING |
| 7 | `asc_820` | STRING |
| 8 | `type` | STRING |
| 9 | `type_description` | STRING |
| 10 | `industry` | STRING |
| 11 | `group` | STRING |
| 12 | `group_description` | STRING |
| 13 | `quantity` | STRING |
| 14 | `capitalization_factor` | STRING |
| 15 | `current_face` | STRING |
| 16 | `uom` | STRING |
| 17 | `pos` | STRING |
| 18 | `ccy` | STRING |
| 19 | `quote` | STRING |
| 20 | `adj_quote` | STRING |
| 21 | `local_currency_market_value` | STRING |
| 22 | `cost_basis` | STRING |
| 23 | `unrealized_g_l` | STRING |
| 24 | `tax_adjustment` | STRING |
| 25 | `tax_cost_basis` | STRING |
| 26 | `tax_unrealized_g_l` | STRING |
| 27 | `base_currency_quote` | STRING |
| 28 | `adj_quote_1` | STRING |
| 29 | `market_value` | STRING |
| 30 | `cost_per_unit` | STRING |
| 31 | `cost_basis_1` | STRING |
| 32 | `unrealized_g_l_1` | STRING |
| 33 | `tax_adjustment_1` | STRING |
| 34 | `tax_cost_basis_1` | STRING |
| 35 | `tax_unrealized_g_l_1` | STRING |
| 36 | `pct_of_portfolio` | STRING |
| 37 | `yield` | STRING |
| 38 | `unrealized_mkt_g_l` | STRING |
| 39 | `unrealized_fx_g_l` | STRING |
| 40 | `adf1` | STRING |
| 41 | `adf2` | STRING |
| 42 | `adf3` | STRING |
| 43 | `adf4` | STRING |
| 44 | `adf5` | STRING |
| 45 | `adf6` | STRING |
| 46 | `adf7` | STRING |
| 47 | `adf8` | STRING |
| 48 | `adf9` | STRING |
| 49 | `adf10` | STRING |
| 50 | `adf11` | STRING |
| 51 | `adf12` | STRING |
| 52 | `adf13` | STRING |
| 53 | `adf14` | STRING |
| 54 | `adf15` | STRING |
| 55 | `adf16` | STRING |
| 56 | `adf17` | STRING |
| 57 | `adf18` | STRING |
| 58 | `adf19` | STRING |
| 59 | `adf20` | STRING |
| 60 | `adf21` | STRING |
| 61 | `adf22` | STRING |
| 62 | `adf23` | STRING |
| 63 | `adf24` | STRING |
| 64 | `adf25` | STRING |
| 65 | `adf26` | STRING |
| 66 | `adf27` | STRING |
| 67 | `adf28` | STRING |
| 68 | `adf29` | STRING |
| 69 | `adf30` | STRING |
| 70 | `category1` | STRING |
| 71 | `category2` | STRING |
| 72 | `category3` | STRING |
| 73 | `category4` | STRING |
| 74 | `category5` | STRING |
| 75 | `category1_desc` | STRING |
| 76 | `country` | STRING |
| 77 | `exchange` | STRING |
| 78 | `sector` | STRING |
| 79 | `bloomberg` | STRING |
| 80 | `fwd_underlying` | STRING |
| 81 | `entity_name` | STRING |
| 82 | `delta_factor` | STRING |
| 83 | `total_issued` | STRING |
| 84 | `daily_volume` | STRING |
| 85 | `_30_day_avg_volume` | STRING |
| 86 | `mtd_percent` | STRING |
| 87 | `performance_return_mtd_percent` | STRING |
| 88 | `qtd_percent` | STRING |
| 89 | `qtd` | STRING |
| 90 | `cusip` | STRING |
| 91 | `fs_field_1` | STRING |
| 92 | `fs_field_2` | STRING |
| 93 | `fs_field_3` | STRING |
| 94 | `fs_field_4` | STRING |
| 95 | `fs_field_5` | STRING |
| 96 | `report_date` | DATE |
| 97 | `start_date` | DATE |
| 98 | `end_date` | DATE |
| 99 | `filename` | STRING |
| 100 | `sheet_name` | STRING |
| 101 | `add_timestamp` | TIMESTAMP |

### ssc.di_transaction_history

| # | Column | Type |
|---|--------|------|
| 1 | `entity` | STRING |
| 2 | `gl_entity` | STRING |
| 3 | `investment` | STRING |
| 4 | `description` | STRING |
| 5 | `class` | STRING |
| 6 | `invesment_type` | STRING |
| 7 | `investment_type_description` | STRING |
| 8 | `trade_date` | DATE |
| 9 | `settle_date` | DATE |
| 10 | `txn_code` | STRING |
| 11 | `txn_type` | STRING |
| 12 | `net_amount` | STRING |
| 13 | `principal` | STRING |
| 14 | `income___expense` | STRING |
| 15 | `quantity` | STRING |
| 16 | `capitalization_factor` | STRING |
| 17 | `local_currency_ccy` | STRING |
| 18 | `price` | STRING |
| 19 | `net_amount_1` | STRING |
| 20 | `cost_proceeds` | STRING |
| 21 | `accrued_int` | STRING |
| 22 | `finance_chrg` | STRING |
| 23 | `fx_rate` | STRING |
| 24 | `base_currency_price` | STRING |
| 25 | `cost_proceeds_1` | STRING |
| 26 | `accrued_int_1` | STRING |
| 27 | `finance_chrg_1` | STRING |
| 28 | `broker` | STRING |
| 29 | `txn_no` | STRING |
| 30 | `txn_description` | STRING |
| 31 | `entity_currency` | STRING |
| 32 | `category1` | STRING |
| 33 | `category1_description` | STRING |
| 34 | `category2` | STRING |
| 35 | `category2_description` | STRING |
| 36 | `category3` | STRING |
| 37 | `category3_description` | STRING |
| 38 | `category4` | STRING |
| 39 | `category4_description` | STRING |
| 40 | `category5` | STRING |
| 41 | `category5_description` | STRING |
| 42 | `affirm_date` | STRING |
| 43 | `txn_status` | STRING |
| 44 | `counter_party` | STRING |
| 45 | `trader` | STRING |
| 46 | `ticker` | STRING |
| 47 | `reference` | STRING |
| 48 | `fwd_underlying` | STRING |
| 49 | `adf1` | STRING |
| 50 | `adf2` | STRING |
| 51 | `adf3` | STRING |
| 52 | `adf4` | STRING |
| 53 | `adf5` | STRING |
| 54 | `adf6` | STRING |
| 55 | `adf7` | STRING |
| 56 | `adf8` | STRING |
| 57 | `adf9` | STRING |
| 58 | `adf10` | STRING |
| 59 | `adf11` | STRING |
| 60 | `adf12` | STRING |
| 61 | `adf13` | STRING |
| 62 | `adf14` | STRING |
| 63 | `adf15` | STRING |
| 64 | `adf16` | STRING |
| 65 | `adf17` | STRING |
| 66 | `adf18` | STRING |
| 67 | `adf19` | STRING |
| 68 | `adf20` | STRING |
| 69 | `adf21` | STRING |
| 70 | `adf22` | STRING |
| 71 | `adf23` | STRING |
| 72 | `adf24` | STRING |
| 73 | `adf25` | STRING |
| 74 | `adf26` | STRING |
| 75 | `adf27` | STRING |
| 76 | `adf28` | STRING |
| 77 | `adf29` | STRING |
| 78 | `adf30` | STRING |
| 79 | `isin` | STRING |
| 80 | `debit` | STRING |
| 81 | `credit` | STRING |
| 82 | `payee_vendor_name` | STRING |
| 83 | `check_` | STRING |
| 84 | `invoice_ref_` | STRING |
| 85 | `notes` | STRING |
| 86 | `audit_info` | STRING |
| 87 | `commissions` | STRING |
| 88 | `fees` | STRING |
| 89 | `relief_method` | STRING |
| 90 | `report_date` | DATE |
| 91 | `start_date` | DATE |
| 92 | `end_date` | DATE |
| 93 | `filename` | STRING |
| 94 | `sheet_name` | STRING |
| 95 | `add_timestamp` | TIMESTAMP |

### ssc.limited_partners

| # | Column | Type |
|---|--------|------|
| 1 | `fund` | STRING |
| 2 | `partner_name` | STRING |

### ssc.ra_capital_roll

| # | Column | Type |
|---|--------|------|
| 1 | `partner_name` | STRING |
| 2 | `partnershortname` | STRING |
| 3 | `partner_id` | FLOAT64 |
| 4 | `commitment_percentage` | FLOAT64 |
| 5 | `commitment` | FLOAT64 |
| 6 | `unfunded_commitment` | FLOAT64 |
| 7 | `unfunded_percent` | FLOAT64 |
| 8 | `beginning_balance` | FLOAT64 |
| 9 | `call_investments` | FLOAT64 |
| 10 | `exp_admin_fees` | FLOAT64 |
| 11 | `exp_audit_fees` | FLOAT64 |
| 12 | `exp_bank_fees` | FLOAT64 |
| 13 | `professional_fees` | FLOAT64 |
| 14 | `tax_fees` | FLOAT64 |
| 15 | `inc_interest_income` | FLOAT64 |
| 16 | `exp_due_diligence_expenses` | FLOAT64 |
| 17 | `exp_legal_fees` | FLOAT64 |
| 18 | `exp_organizational_expense` | FLOAT64 |
| 19 | `inc_property_income` | FLOAT64 |
| 20 | `unrealized_adjustment` | FLOAT64 |
| 21 | `ending_balance` | FLOAT64 |
| 22 | `ror` | FLOAT64 |
| 23 | `net_irr` | FLOAT64 |
| 24 | `gross_irr` | FLOAT64 |
| 25 | `pic_multiple` | FLOAT64 |
| 26 | `nav_percent` | FLOAT64 |
| 27 | `entity` | STRING |
| 28 | `start_date` | DATE |
| 29 | `end_date` | DATE |
| 30 | `filename` | STRING |
| 31 | `sheet_name` | STRING |
| 32 | `add_timestamp` | TIMESTAMP |

### ssc.ra_investment_commitment

| # | Column | Type |
|---|--------|------|
| 1 | `name_currency` | STRING |
| 2 | `re_type` | STRING |
| 3 | `property_type` | STRING |
| 4 | `location` | STRING |
| 5 | `total_commitment` | FLOAT64 |
| 6 | `total_funded` | FLOAT64 |
| 7 | `total_unfunded` | FLOAT64 |
| 8 | `investment_cont_dist_amount_current_quarter` | FLOAT64 |
| 9 | `ending_cost` | FLOAT64 |
| 10 | `g_l` | FLOAT64 |
| 11 | `fmv` | FLOAT64 |
| 12 | `beginning_fmv` | FLOAT64 |
| 13 | `capital_cont_dist` | FLOAT64 |
| 14 | `ending_fmv` | FLOAT64 |
| 15 | `ugl` | FLOAT64 |
| 16 | `investment_income` | FLOAT64 |
| 17 | `quarter_end_date` | DATE |
| 18 | `filename` | STRING |
| 19 | `sheet_name` | STRING |
| 20 | `add_timestamp` | TIMESTAMP |

### ssc.ra_transaction

| # | Column | Type |
|---|--------|------|
| 1 | `entity` | STRING |
| 2 | `investment_id` | STRING |
| 3 | `investment_name` | STRING |
| 4 | `class_id` | STRING |
| 5 | `localcurrency` | STRING |
| 6 | `effectivedate` | DATE |
| 7 | `amount` | FLOAT64 |
| 8 | `amount_local` | FLOAT64 |
| 9 | `recallable_amount` | INT64 |
| 10 | `recallable_amount_local` | INT64 |
| 11 | `transaction_type` | STRING |
| 12 | `drawdown_fund_sub_transaction_types` | STRING |
| 13 | `report_date` | STRING |
| 14 | `filename` | STRING |
| 15 | `sheet_name` | STRING |
| 16 | `add_timestamp` | STRING |

### ssc.ra_trial_balance

| # | Column | Type |
|---|--------|------|
| 1 | `account_code` | STRING |
| 2 | `account_code_1` | STRING |
| 3 | `account_description` | STRING |
| 4 | `opening_balance` | FLOAT64 |
| 5 | `debit_amount` | FLOAT64 |
| 6 | `credit_amount` | FLOAT64 |
| 7 | `net_activity` | FLOAT64 |
| 8 | `ending_balance` | FLOAT64 |
| 9 | `report_date` | DATE |
| 10 | `entity` | STRING |
| 11 | `start_date` | DATE |
| 12 | `end_date` | DATE |
| 13 | `filename` | STRING |
| 14 | `sheet_name` | STRING |
| 15 | `add_timestamp` | STRING |

### ssc.ra_valuation

| # | Column | Type |
|---|--------|------|
| 1 | `entity` | STRING |
| 2 | `investment_id` | STRING |
| 3 | `investment_name` | STRING |
| 4 | `class_id` | STRING |
| 5 | `localcurrency` | STRING |
| 6 | `effectivedate` | DATE |
| 7 | `reporteddate` | DATE |
| 8 | `amount` | FLOAT64 |
| 9 | `amount_local` | FLOAT64 |
| 10 | `valuation_tag_type` | STRING |
| 11 | `shares_if_unit_based` | FLOAT64 |
| 12 | `price_if_unit_based` | FLOAT64 |
| 13 | `report_date` | DATE |
| 14 | `filename` | STRING |
| 15 | `sheet_name` | STRING |
| 16 | `add_timestamp` | STRING |

### ssc.vc_account_detail

| # | Column | Type |
|---|--------|------|
| 1 | `txn_date` | DATE |
| 2 | `settle_date` | DATE |
| 3 | `batch` | STRING |
| 4 | `entity` | STRING |
| 5 | `ccy` | STRING |
| 6 | `account` | STRING |
| 7 | `account_name` | STRING |
| 8 | `custodian` | STRING |
| 9 | `sub_account` | STRING |
| 10 | `sub_entity` | STRING |
| 11 | `fx_rate` | STRING |
| 12 | `local_amount` | FLOAT64 |
| 13 | `local_balance` | FLOAT64 |
| 14 | `base_amount` | FLOAT64 |
| 15 | `base_balance` | FLOAT64 |
| 16 | `description` | STRING |
| 17 | `source` | STRING |
| 18 | `txn_code` | STRING |
| 19 | `txn_no` | STRING |
| 20 | `investment` | STRING |
| 21 | `investment_description` | STRING |
| 22 | `reference` | STRING |
| 23 | `quarter_end_date` | DATE |
| 24 | `sheet_name` | STRING |
| 25 | `filename` | STRING |
| 26 | `add_timestamp` | TIMESTAMP |

### ssc.vc_capital_register

| # | Column | Type |
|---|--------|------|
| 1 | `id` | STRING |
| 2 | `name` | STRING |
| 3 | `quarter_opening_gross_capital` | FLOAT64 |
| 4 | `quarter_opening_net_capital` | FLOAT64 |
| 5 | `qtd_contributions` | FLOAT64 |
| 6 | `qtd_redemptions` | FLOAT64 |
| 7 | `qtd_transfers` | FLOAT64 |
| 8 | `qtd_gross_pl` | FLOAT64 |
| 9 | `qtd_new_issue_income` | FLOAT64 |
| 10 | `qtd_management_fees` | FLOAT64 |
| 11 | `qtd_charged_incentive_fees` | FLOAT64 |
| 12 | `quarter_ending_gross_capital` | FLOAT64 |
| 13 | `qtd_incentive_accrual` | FLOAT64 |
| 14 | `ytd_incentive_accrual` | FLOAT64 |
| 15 | `ending_net_balance` | FLOAT64 |
| 16 | `qtd_gross_return` | FLOAT64 |
| 17 | `qtd_net_of_mgmt_fee_return` | FLOAT64 |
| 18 | `qtd_net_of_fees_return` | FLOAT64 |
| 19 | `year_opening_capital` | FLOAT64 |
| 20 | `ytd_contributions` | FLOAT64 |
| 21 | `ytd_redemptions` | FLOAT64 |
| 22 | `ytd_transfers` | FLOAT64 |
| 23 | `ytd_gross_pl` | FLOAT64 |
| 24 | `ytd_new_issue_income` | FLOAT64 |
| 25 | `ytd_management_fees` | FLOAT64 |
| 26 | `ytd_charged_incentive_fees` | FLOAT64 |
| 27 | `ending_gross_capital` | FLOAT64 |
| 28 | `ytd_incentive_accrual_1` | FLOAT64 |
| 29 | `ending_net_balance_1` | FLOAT64 |
| 30 | `net_ror_qtd` | FLOAT64 |
| 31 | `net_ror_ytd` | FLOAT64 |
| 32 | `shares` | FLOAT64 |
| 33 | `nav` | FLOAT64 |
| 34 | `share_class` | STRING |
| 35 | `partner_group` | STRING |
| 36 | `alternate_identifier` | STRING |
| 37 | `tax_id` | FLOAT64 |
| 38 | `gopid` | STRING |
| 39 | `subentitycode` | STRING |
| 40 | `mtd_shares_opening` | FLOAT64 |
| 41 | `mtd_shares_contributed` | FLOAT64 |
| 42 | `mtd_shares_redeemed` | FLOAT64 |
| 43 | `mtd_shares_transferred` | FLOAT64 |
| 44 | `qtd_shares_opening` | FLOAT64 |
| 45 | `qtd_shares_contributed` | FLOAT64 |
| 46 | `qtd_shares_redeemed` | FLOAT64 |
| 47 | `qtd_shares_transferred` | FLOAT64 |
| 48 | `ytd_shares_opening` | FLOAT64 |
| 49 | `ytd_shares_contributed` | FLOAT64 |
| 50 | `ytd_shares_redeemed` | FLOAT64 |
| 51 | `ytd_shares_transferred` | FLOAT64 |
| 52 | `qtd_accrued_placement_fee` | FLOAT64 |
| 53 | `ytd_accrued_placement_fee` | FLOAT64 |
| 54 | `qtd_syndication_costs` | FLOAT64 |
| 55 | `ytd_syndication_costs` | FLOAT64 |
| 56 | `external_partner_id` | STRING |
| 57 | `percent_ownership` | FLOAT64 |
| 58 | `share_class_1` | STRING |
| 59 | `series` | FLOAT64 |
| 60 | `commitment` | FLOAT64 |
| 61 | `unfunded_commitment` | FLOAT64 |
| 62 | `roi` | FLOAT64 |
| 63 | `gl_entity` | STRING |
| 64 | `qtd_net_income` | FLOAT64 |
| 65 | `ytd_net_income` | FLOAT64 |
| 66 | `management_fee_percent_per_investor` | STRING |
| 67 | `incentive_fee_percent_per_investor` | STRING |
| 68 | `investor_type` | FLOAT64 |
| 69 | `parent_account` | FLOAT64 |
| 70 | `advisor` | FLOAT64 |
| 71 | `geopgraphy` | FLOAT64 |
| 72 | `class_description` | STRING |
| 73 | `series_description` | FLOAT64 |
| 74 | `net_ror_itd` | FLOAT64 |
| 75 | `group_id` | FLOAT64 |
| 76 | `entity` | STRING |
| 77 | `quarter_end_date` | DATE |
| 78 | `filename` | STRING |
| 79 | `sheet_name` | STRING |
| 80 | `add_timestamp` | TIMESTAMP |

### ssc.vc_holdings

| # | Column | Type |
|---|--------|------|
| 1 | `entity` | STRING |
| 2 | `investment` | STRING |
| 3 | `description` | STRING |
| 4 | `quantity` | FLOAT64 |
| 5 | `uom` | STRING |
| 6 | `quote` | FLOAT64 |
| 7 | `adj_quote` | FLOAT64 |
| 8 | `market_value` | FLOAT64 |
| 9 | `cost_per_unit` | FLOAT64 |
| 10 | `cost_basis` | FLOAT64 |
| 11 | `unrealized_g_l` | FLOAT64 |
| 12 | `tax_adjustment` | FLOAT64 |
| 13 | `tax_cost_basis` | FLOAT64 |
| 14 | `tax_unrealized_g_l` | FLOAT64 |
| 15 | `pct_of_portfolio` | FLOAT64 |
| 16 | `quarter_end_date` | DATE |
| 17 | `filename` | STRING |
| 18 | `sheet_name` | STRING |
| 19 | `add_timestamp` | TIMESTAMP |

### ssc.vc_investment_commitment

| # | Column | Type |
|---|--------|------|
| 1 | `entity` | STRING |
| 2 | `gl_entity` | STRING |
| 3 | `investment` | STRING |
| 4 | `description` | STRING |
| 5 | `class` | STRING |
| 6 | `type` | STRING |
| 7 | `type_description` | STRING |
| 8 | `group` | STRING |
| 9 | `group_description` | STRING |
| 10 | `quantity` | FLOAT64 |
| 11 | `ccy` | STRING |
| 12 | `original_commitment` | FLOAT64 |
| 13 | `beg_commitment_balance` | FLOAT64 |
| 14 | `new_addl_commitments` | FLOAT64 |
| 15 | `commitments_paid` | FLOAT64 |
| 16 | `end_commitment_balance` | FLOAT64 |
| 17 | `market_value` | FLOAT64 |
| 18 | `cost_basis` | FLOAT64 |
| 19 | `unrealized_gl` | FLOAT64 |
| 20 | `original_commitment_1` | FLOAT64 |
| 21 | `beg_commitment_balance_1` | FLOAT64 |
| 22 | `new_addl_commitments_1` | FLOAT64 |
| 23 | `commitments_paid_1` | FLOAT64 |
| 24 | `end_commitment_balance_1` | FLOAT64 |
| 25 | `market_value_1` | FLOAT64 |
| 26 | `cost_basis_1` | FLOAT64 |
| 27 | `unrealized_gl_1` | FLOAT64 |
| 28 | `start_date` | DATE |
| 29 | `end_date` | DATE |
| 30 | `filename` | STRING |
| 31 | `sheet_name` | STRING |
| 32 | `add_timestamp` | TIMESTAMP |

### ssc.vc_transaction

| # | Column | Type |
|---|--------|------|
| 1 | `entity` | STRING |
| 2 | `investment_id` | STRING |
| 3 | `investment_name` | STRING |
| 4 | `class_id` | STRING |
| 5 | `localcurrency` | STRING |
| 6 | `effectivedate` | DATE |
| 7 | `amount` | FLOAT64 |
| 8 | `amount_local` | FLOAT64 |
| 9 | `recallable_amount` | FLOAT64 |
| 10 | `recallable_amount_local` | FLOAT64 |
| 11 | `transaction_type` | STRING |
| 12 | `drawdown_fund_sub_transaction_types` | STRING |
| 13 | `report_date` | DATE |
| 14 | `filename` | STRING |
| 15 | `sheet_name` | STRING |
| 16 | `add_timestamp` | TIMESTAMP |

### ssc.vc_trial_balance

| # | Column | Type |
|---|--------|------|
| 1 | `account` | STRING |
| 2 | `description` | STRING |
| 3 | `beginning_balance` | FLOAT64 |
| 4 | `activity` | FLOAT64 |
| 5 | `ending_balance` | FLOAT64 |
| 6 | `section` | STRING |
| 7 | `entity` | STRING |
| 8 | `report_date` | DATE |
| 9 | `start_date` | DATE |
| 10 | `end_date` | DATE |
| 11 | `filename` | STRING |
| 12 | `sheet_name` | STRING |
| 13 | `add_timestamp` | TIMESTAMP |

### ssc.vc_valuation

| # | Column | Type |
|---|--------|------|
| 1 | `entity` | STRING |
| 2 | `investment_id` | STRING |
| 3 | `investment_name` | STRING |
| 4 | `class_id` | STRING |
| 5 | `localcurrency` | STRING |
| 6 | `effectivedate` | DATE |
| 7 | `reporteddate` | DATE |
| 8 | `amount` | FLOAT64 |
| 9 | `amount_local` | FLOAT64 |
| 10 | `valuation_tag_type` | STRING |
| 11 | `shares_if_unit_based` | FLOAT64 |
| 12 | `price_if_unit_based` | FLOAT64 |
| 13 | `report_date` | DATE |
| 14 | `filename` | STRING |
| 15 | `sheet_name` | STRING |
| 16 | `add_timestamp` | TIMESTAMP |

## cashflow_projections

Burgiss private markets cashflow projection schedules — contribution and distribution pacing models (Y1–Y16).

### cashflow_projections.burgiss_contribution_schedule

| # | Column | Type |
|---|--------|------|
| 1 | `Name` | STRING |
| 2 | `Y1` | FLOAT64 |
| 3 | `Y2` | FLOAT64 |
| 4 | `Y3` | FLOAT64 |
| 5 | `Y4` | FLOAT64 |
| 6 | `Y5` | FLOAT64 |
| 7 | `Y6` | FLOAT64 |
| 8 | `Y7` | FLOAT64 |
| 9 | `Y8` | FLOAT64 |
| 10 | `Y9` | FLOAT64 |
| 11 | `Y10` | FLOAT64 |
| 12 | `Y11` | FLOAT64 |
| 13 | `Y12` | FLOAT64 |
| 14 | `Y13` | FLOAT64 |
| 15 | `Y14` | FLOAT64 |
| 16 | `Y15` | FLOAT64 |
| 17 | `Y16` | FLOAT64 |

### cashflow_projections.burgiss_distribution_schedule

| # | Column | Type |
|---|--------|------|
| 1 | `Name` | STRING |
| 2 | `Y1` | FLOAT64 |
| 3 | `Y2` | FLOAT64 |
| 4 | `Y3` | FLOAT64 |
| 5 | `Y4` | FLOAT64 |
| 6 | `Y5` | FLOAT64 |
| 7 | `Y6` | FLOAT64 |
| 8 | `Y7` | FLOAT64 |
| 9 | `Y8` | FLOAT64 |
| 10 | `Y9` | FLOAT64 |
| 11 | `Y10` | FLOAT64 |
| 12 | `Y11` | FLOAT64 |
| 13 | `Y12` | FLOAT64 |
| 14 | `Y13` | FLOAT64 |
| 15 | `Y14` | FLOAT64 |
| 16 | `Y15` | FLOAT64 |
| 17 | `Y16` | INT64 |

## taxes

Tax reference tables — federal income tax rates, federal capital gains rates, and state income tax rates by filing status.

### taxes.federal_capital_gains_rates

| # | Column | Type |
|---|--------|------|
| 1 | `year` | STRING |
| 2 | `rate` | STRING |
| 3 | `unmarried_taxable_income_over` | STRING |
| 4 | `married_taxable_income_over` | STRING |
| 5 | `hoh_taxable_income_over` | STRING |

### taxes.federal_income_tax_rates

| # | Column | Type |
|---|--------|------|
| 1 | `year` | STRING |
| 2 | `rate` | STRING |
| 3 | `single_filing` | STRING |
| 4 | `married_joint_filing` | STRING |
| 5 | `head_of_household_filing` | STRING |

### taxes.state_income_tax_rates

| # | Column | Type |
|---|--------|------|
| 1 | `year` | STRING |
| 2 | `state` | STRING |
| 3 | `single_filer_rate` | STRING |
| 4 | `single_filer_bracket` | STRING |
| 5 | `married_filing_jointly_rate` | STRING |
| 6 | `married_filing_jointly_bracket` | STRING |
| 7 | `standard_deduction_single` | STRING |
| 8 | `standard_deduction_couple` | STRING |
| 9 | `personal_exemption_single` | STRING |
| 10 | `personal_exemption_couple` | STRING |
| 11 | `personal_exemption_dependent` | STRING |