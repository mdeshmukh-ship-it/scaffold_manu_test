import { useCallback, useEffect, useState } from 'react'
import { requestApiJson } from '@/lib/requestApiJson'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccountRow = {
  AccountNumber: string
  PrimaryAccountHolder: string
  FBSIShortName: string
  ClientName: string
  EstablishedDate: string | null
  MarketValue: number
}

export type TwrorRow = {
  account_number: string
  FBSIShortName: string
  qtd_twror: number | null
  ytd_twror: number | null
  one_year_twror: number | null
  three_year_twror: number | null
  five_year_twror: number | null
  inception_twror: number | null
}

export type MonthlyReturn = {
  month: string
  return_pct: number
  cumulative_pct: number
  ending_value: number
}

export type CumulativePoint = {
  date: string
  cumulative_pct: number
}

export type RollingPoint = {
  date: string
  return_365d: number
  vol_365d: number
}

export type RiskMetrics = {
  itd_return_pct: number
  annualized_return_pct: number
  volatility_pct: number
  sharpe_ratio: number
  sortino_ratio: number
  max_drawdown_pct: number
  max_dd_peak_date: string
  max_dd_trough_date: string
  best_month: string
  best_month_return_pct: number
  worst_month: string
  worst_month_return_pct: number
  total_days: number
}

export type PeriodVol = {
  qtd_vol: number
  ytd_vol: number
  '1y_vol': number
  '3y_vol': number
  itd_vol: number
}

export type AccountSummaryFund = {
  fund: string
  beginning_value: number
  ending_value: number
  net_contributions_withdrawals: number
  investment_earnings: number
}

export type AccountSummary = {
  beginning_value: number
  ending_value: number
  net_contributions_withdrawals: number
  investment_earnings: number
}

export type AssetClassRow = {
  asset_class: string
  market_value: number
}

export type RaFundHolding = {
  fund_name: string
  asset_class: string
  investment_type: string
  valuation: number
  total_called_capital: number
}

export type CapitalCallRow = {
  fund_name: string
  month: string
  capital_called: number
  distributions: number
}

// Cash Flow & Liquidity Forecast types
export type CashFlowProjection = {
  month_offset: number
  projected_cash: number
  net_flows: number
  capital_calls: number
  distributions: number
  net_change: number
}

export type UnfundedDetail = {
  fund_type: string
  fund_name: string
  total_commitment: number
  total_called: number
  unfunded: number
}

export type HistoricalFlow = {
  month: string
  deposits: number
  withdrawals: number
  net_flow: number
}

export type CashFlowForecast = {
  current_cash: number
  total_portfolio_mv: number
  liquid_pct: number
  total_unfunded_commitments: number
  avg_monthly_net_flow: number
  avg_monthly_capital_call: number
  avg_monthly_distributions: number
  months_of_runway: number
  projection: CashFlowProjection[]
  unfunded_detail: UnfundedDetail[]
  historical_flows: HistoricalFlow[]
}

// Balance Sheet types
export type LiquidAssetRow = {
  category: string
  subcategory: string
  value: number
  source: string
}

export type PrivateAssetRow = {
  category: string
  subcategory: string
  asset_class: string
  investment_type: string
  value: number
  cost_basis: number
  source: string
}

export type ManualEntry = {
  id: string
  category: string
  description: string
  value: number
  as_of_date: string
  notes: string | null
}

export type BalanceSheetData = {
  report_date: string
  liquid_assets: LiquidAssetRow[]
  liquid_total: number
  private_assets: PrivateAssetRow[]
  private_total: number
  financial_total: number
  portfolio_mv: number
  manual_assets: ManualEntry[]
  manual_assets_total: number
  manual_liabilities: ManualEntry[]
  manual_liabilities_total: number
  total_assets: number
  total_liabilities: number
  net_worth: number
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useCIOClients() {
  const [clients, setClients] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async (retries = 2) => {
    setLoading(true)
    setError(null)
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await requestApiJson<{ clients: string[] }>('/api/cio/clients')
        setClients(res.clients)
        setError(null)
        setLoading(false)
        return
      } catch (err: any) {
        if (attempt < retries) {
          // Wait a bit before retrying (BigQuery cold start may need time)
          await new Promise((r) => setTimeout(r, 2000))
        } else {
          setError(err.message || 'Failed to load clients')
        }
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => { void fetch() }, [fetch])

  return { clients, loading, error, refetch: fetch }
}

export function useCIOEntities(clientName: string) {
  const [entities, setEntities] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!clientName) return
    setLoading(true)
    requestApiJson<{ entities: string[] }>(`/api/cio/entities?client_name=${encodeURIComponent(clientName)}`)
      .then((res) => setEntities(res.entities))
      .catch(() => setEntities([]))
      .finally(() => setLoading(false))
  }, [clientName])

  return { entities, loading }
}

export function useCIOAccounts(clientName: string, entities: string[]) {
  const [accounts, setAccounts] = useState<{ AccountNumber: string; AccountName: string }[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!clientName || entities.length === 0) {
      setAccounts([])
      return
    }
    setLoading(true)
    const entitiesCsv = entities.join(',')
    requestApiJson<{ accounts: { AccountNumber: string; AccountName: string }[] }>(
      `/api/cio/accounts?client_name=${encodeURIComponent(clientName)}&entities=${encodeURIComponent(entitiesCsv)}`
    )
      .then((res) => setAccounts(res.accounts))
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false))
  }, [clientName, entities])

  return { accounts, loading }
}

export function useCIOMarketValues(reportDate: string, accounts: string[]) {
  const [data, setData] = useState<{ rows: AccountRow[]; total_mv: number; count: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!reportDate) return
    setLoading(true)
    setError(null)
    try {
      const accountsCsv = accounts.length > 0 ? accounts.join(',') : ''
      const url = `/api/cio/market-values?report_date=${encodeURIComponent(reportDate)}${accountsCsv ? `&accounts=${encodeURIComponent(accountsCsv)}` : ''}`
      const res = await requestApiJson<{ rows: AccountRow[]; total_mv: number; count: number }>(url)
      setData(res)
    } catch (err: any) {
      setError(err.message || 'Failed to load market values')
    } finally {
      setLoading(false)
    }
  }, [reportDate, accounts])

  return { data, loading, error, fetch }
}

export function useCIOTwror(accounts: string[]) {
  const [data, setData] = useState<TwrorRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const accountsCsv = accounts.length > 0 ? accounts.join(',') : ''
      const url = `/api/cio/twror${accountsCsv ? `?accounts=${encodeURIComponent(accountsCsv)}` : ''}`
      const res = await requestApiJson<{ rows: TwrorRow[] }>(url)
      setData(res.rows)
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [accounts])

  return { data, loading, fetch }
}

export function useCIOMonthlyReturns(reportDate: string, accounts: string[]) {
  const [data, setData] = useState<MonthlyReturn[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!reportDate) return
    setLoading(true)
    setError(null)
    try {
      const accountsCsv = accounts.length > 0 ? accounts.join(',') : ''
      const url = `/api/cio/monthly-returns?report_date=${encodeURIComponent(reportDate)}${accountsCsv ? `&accounts=${encodeURIComponent(accountsCsv)}` : ''}`
      const res = await requestApiJson<{ months: MonthlyReturn[] }>(url)
      setData(res.months)
    } catch (err: any) {
      setError(err.message || 'Failed to load monthly returns')
    } finally {
      setLoading(false)
    }
  }, [reportDate, accounts])

  return { data, loading, error, fetch }
}

export function useCIORiskMetrics(reportDate: string, accounts: string[]) {
  const [data, setData] = useState<RiskMetrics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!reportDate) return
    setLoading(true)
    setError(null)
    try {
      const accountsCsv = accounts.length > 0 ? accounts.join(',') : ''
      const url = `/api/cio/risk-metrics?report_date=${encodeURIComponent(reportDate)}${accountsCsv ? `&accounts=${encodeURIComponent(accountsCsv)}` : ''}`
      const res = await requestApiJson<{ metrics: RiskMetrics }>(url)
      setData(res.metrics)
    } catch (err: any) {
      setError(err.message || 'Failed to load risk metrics')
    } finally {
      setLoading(false)
    }
  }, [reportDate, accounts])

  return { data, loading, error, fetch }
}

export function useCIOCumulativeReturns(reportDate: string, accounts: string[]) {
  const [data, setData] = useState<CumulativePoint[]>([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!reportDate) return
    setLoading(true)
    try {
      const accountsCsv = accounts.length > 0 ? accounts.join(',') : ''
      const url = `/api/cio/cumulative-returns?report_date=${encodeURIComponent(reportDate)}${accountsCsv ? `&accounts=${encodeURIComponent(accountsCsv)}` : ''}`
      const res = await requestApiJson<{ series: CumulativePoint[] }>(url)
      setData(res.series)
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [reportDate, accounts])

  return { data, loading, fetch }
}

export function useCIORollingMetrics(reportDate: string, accounts: string[]) {
  const [data, setData] = useState<RollingPoint[]>([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!reportDate) return
    setLoading(true)
    try {
      const accountsCsv = accounts.length > 0 ? accounts.join(',') : ''
      const url = `/api/cio/rolling-metrics?report_date=${encodeURIComponent(reportDate)}${accountsCsv ? `&accounts=${encodeURIComponent(accountsCsv)}` : ''}`
      const res = await requestApiJson<{ series: RollingPoint[] }>(url)
      setData(res.series)
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [reportDate, accounts])

  return { data, loading, fetch }
}

export function useCIOPeriodVol(reportDate: string, accounts: string[]) {
  const [data, setData] = useState<PeriodVol | null>(null)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!reportDate) return
    setLoading(true)
    try {
      const accountsCsv = accounts.length > 0 ? accounts.join(',') : ''
      const url = `/api/cio/period-vol?report_date=${encodeURIComponent(reportDate)}${accountsCsv ? `&accounts=${encodeURIComponent(accountsCsv)}` : ''}`
      const res = await requestApiJson<{ vol: PeriodVol }>(url)
      setData(res.vol)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [reportDate, accounts])

  return { data, loading, fetch }
}

export function useCIOAccountSummary(reportDate: string, clientName: string, accounts: string[]) {
  const [totals, setTotals] = useState<AccountSummary | null>(null)
  const [funds, setFunds] = useState<AccountSummaryFund[]>([])
  const [ytdTotals, setYtdTotals] = useState<AccountSummary | null>(null)
  const [ytdFunds, setYtdFunds] = useState<AccountSummaryFund[]>([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!reportDate || !clientName) return
    setLoading(true)
    try {
      const accountsCsv = accounts.length > 0 ? accounts.join(',') : ''
      const url = `/api/cio/account-summary?report_date=${encodeURIComponent(reportDate)}&client_name=${encodeURIComponent(clientName)}${accountsCsv ? `&accounts=${encodeURIComponent(accountsCsv)}` : ''}`
      const res = await requestApiJson<{
        funds: AccountSummaryFund[]
        totals: AccountSummary
        ytd_funds: AccountSummaryFund[]
        ytd_totals: AccountSummary
      }>(url)
      setTotals(res.totals)
      setFunds(res.funds)
      setYtdTotals(res.ytd_totals ?? null)
      setYtdFunds(res.ytd_funds ?? [])
    } catch {
      setTotals(null)
      setFunds([])
      setYtdTotals(null)
      setYtdFunds([])
    } finally {
      setLoading(false)
    }
  }, [reportDate, clientName, accounts])

  return { totals, funds, ytdTotals, ytdFunds, loading, fetch }
}

export function useCIOAssetClass(reportDate: string, accounts: string[]) {
  const [data, setData] = useState<AssetClassRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!reportDate) return
    setLoading(true)
    try {
      const accountsCsv = accounts.length > 0 ? accounts.join(',') : ''
      const url = `/api/cio/asset-class?report_date=${encodeURIComponent(reportDate)}${accountsCsv ? `&accounts=${encodeURIComponent(accountsCsv)}` : ''}`
      const res = await requestApiJson<{ rows: AssetClassRow[] }>(url)
      setData(res.rows)
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [reportDate, accounts])

  return { data, loading, fetch }
}

export function useCIORaFundHoldings(reportDate: string, clientName: string = '') {
  const [data, setData] = useState<RaFundHolding[]>([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!reportDate) return
    setLoading(true)
    try {
      let url = `/api/cio/ra-fund-holdings?report_date=${encodeURIComponent(reportDate)}`
      if (clientName) url += `&client_name=${encodeURIComponent(clientName)}`
      const res = await requestApiJson<{ rows: RaFundHolding[] }>(url)
      setData(res.rows)
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [reportDate, clientName])

  return { data, loading, fetch }
}

export function useCIOCapitalCallsTimeline(reportDate: string, clientName: string = '') {
  const [data, setData] = useState<CapitalCallRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!reportDate) return
    setLoading(true)
    try {
      let url = `/api/cio/capital-calls-timeline?report_date=${encodeURIComponent(reportDate)}`
      if (clientName) url += `&client_name=${encodeURIComponent(clientName)}`
      const res = await requestApiJson<{ rows: CapitalCallRow[] }>(url)
      setData(res.rows)
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [reportDate, clientName])

  return { data, loading, fetch }
}

export function useCIOCashFlowForecast(reportDate: string, clientName: string, accounts: string[]) {
  const [data, setData] = useState<CashFlowForecast | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!reportDate || !clientName) return
    setLoading(true)
    setError(null)
    try {
      const accountsCsv = accounts.length > 0 ? accounts.join(',') : ''
      const url = `/api/cio/cash-flow-forecast?report_date=${encodeURIComponent(reportDate)}&client_name=${encodeURIComponent(clientName)}${accountsCsv ? `&accounts=${encodeURIComponent(accountsCsv)}` : ''}`
      const res = await requestApiJson<CashFlowForecast>(url)
      setData(res)
    } catch (err: any) {
      setError(err.message || 'Failed to load cash flow forecast')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [reportDate, clientName, accounts])

  return { data, loading, error, fetch }
}

export function useCIOBalanceSheet(reportDate: string, clientName: string, accounts: string[]) {
  const [data, setData] = useState<BalanceSheetData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!reportDate || !clientName) return
    setLoading(true)
    setError(null)
    try {
      const accountsCsv = accounts.length > 0 ? accounts.join(',') : ''
      const url = `/api/cio/balance-sheet?report_date=${encodeURIComponent(reportDate)}&client_name=${encodeURIComponent(clientName)}${accountsCsv ? `&accounts=${encodeURIComponent(accountsCsv)}` : ''}`
      const res = await requestApiJson<BalanceSheetData>(url)
      setData(res)
    } catch (err: any) {
      setError(err.message || 'Failed to load balance sheet')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [reportDate, clientName, accounts])

  const addManualEntry = useCallback(async (entry: {
    client_name: string
    entry_type: 'asset' | 'liability'
    category: string
    description: string
    value: number
    as_of_date: string
    notes?: string
  }) => {
    await requestApiJson<{ ok: boolean; id: string }>('/api/cio/balance-sheet/manual', {
      method: 'POST',
      body: entry,
    })
    await fetch()
  }, [fetch])

  const deleteManualEntry = useCallback(async (id: string) => {
    await requestApiJson<{ ok: boolean }>(`/api/cio/balance-sheet/manual?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    await fetch()
  }, [fetch])

  return { data, loading, error, fetch, addManualEntry, deleteManualEntry }
}

// ---------------------------------------------------------------------------
// Top Positions
// ---------------------------------------------------------------------------

export type PositionRow = {
  account_name: string
  account_number: string
  symbol: string
  description: string
  asset_class: string
  market_value: number
  price: number
  quantity: number
}

export function useCIOTopPositions(reportDate: string, accounts: string[]) {
  const [data, setData] = useState<PositionRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!reportDate) return
    setLoading(true)
    try {
      const accountsCsv = accounts.length > 0 ? accounts.join(',') : ''
      const url = `/api/cio/top-positions?report_date=${encodeURIComponent(reportDate)}${accountsCsv ? `&accounts=${encodeURIComponent(accountsCsv)}` : ''}`
      const res = await requestApiJson<{ rows: PositionRow[] }>(url)
      setData(res.rows)
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [reportDate, accounts])

  return { data, loading, fetch }
}

// ---------------------------------------------------------------------------
// Recent Transactions
// ---------------------------------------------------------------------------

export type TransactionRow = {
  account_name: string
  account_number: string
  date: string
  transaction_type: string
  category: string
  description: string
  amount: number
  quantity: number
  buy_sell: string
}

export function useCIORecentTransactions(reportDate: string, accounts: string[]) {
  const [data, setData] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!reportDate) return
    setLoading(true)
    try {
      const accountsCsv = accounts.length > 0 ? accounts.join(',') : ''
      const url = `/api/cio/recent-transactions?report_date=${encodeURIComponent(reportDate)}${accountsCsv ? `&accounts=${encodeURIComponent(accountsCsv)}` : ''}`
      const res = await requestApiJson<{ rows: TransactionRow[] }>(url)
      setData(res.rows)
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [reportDate, accounts])

  return { data, loading, fetch }
}

// ---------------------------------------------------------------------------
// Private Fund Types
// ---------------------------------------------------------------------------

export function useCIOPrivateFundTypes(clientName: string) {
  const [fundTypes, setFundTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!clientName) {
      setFundTypes([])
      return
    }
    setLoading(true)
    requestApiJson<{ fund_types: string[] }>(
      `/api/cio/private-fund-types?client_name=${encodeURIComponent(clientName)}`
    )
      .then((res) => setFundTypes(res.fund_types))
      .catch(() => setFundTypes([]))
      .finally(() => setLoading(false))
  }, [clientName])

  return { fundTypes, loading }
}

// ---------------------------------------------------------------------------
// Private Fund Detail
// ---------------------------------------------------------------------------

export type VCSummaryRow = {
  investor_name: string
  fund_entity: string
  commitment: number | null
  unfunded_commitment: number | null
  beginning_balance: number | null
  ending_net_balance: number | null
  qtd_contributions: number | null
  qtd_redemptions: number | null
  net_ror_qtd: number | null
  net_ror_ytd: number | null
  net_ror_itd: number | null
  quarter_end_date: string
  fund_nav: number | null
  fund_commitment: number | null
  ownership_pct: number | null
  commitment_ownership_pct: number | null
}

export type VCCommitmentRow = {
  investment: string
  description: string | null
  style: string | null
  original_commitment: number | null
  cost_basis: number | null
  market_value: number | null
  moic: number | null
  holding_type: string | null
  end_date: string | null
  pct_of_fund: number | null
  family_ownership_pct: number | null
  client_share_mv: number | null
}

export type DISummaryRow = {
  investor_name: string
  fund_entity: string
  beginning_balance: number | null
  ending_net_balance: number | null
  contributions: number | null
  distributions: number | null
  net_ror_qtd: number | null
  net_ror_ytd: number | null
  month_end_date: string
  fund_nav: number | null
  ownership_pct: number | null
}

export type RASummaryRow = {
  partner_name: string
  fund_entity: string
  commitment: number | null
  unfunded_commitment: number | null
  beginning_balance: number | null
  ending_balance: number | null
  call_investments: number | null
  ror: number | null
  net_irr: number | null
  end_date: string
  fund_nav: number | null
  fund_commitment: number | null
  ownership_pct: number | null
  commitment_ownership_pct: number | null
}

export type RACommitmentRow = {
  partner_name: string
  investment: string
  commitment: number | null
  unfunded: number | null
  fair_market_value: number | null
  cost_basis: number | null
  unrealized_gl: number | null
  end_date: string
  family_ownership_pct: number | null
  client_share_fmv: number | null
}

export type PrivateFundDetail = {
  fund_type: string
  summary: VCSummaryRow[] | DISummaryRow[] | RASummaryRow[]
  commitments?: VCCommitmentRow[] | RACommitmentRow[]
  totals: {
    commitment?: number
    unfunded?: number
    nav: number
  }
}

export function useCIOPrivateFundDetail(reportDate: string, clientName: string, fundType: string) {
  const [data, setData] = useState<PrivateFundDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!reportDate || !clientName || !fundType) return
    setLoading(true)
    setError(null)
    try {
      const url = `/api/cio/private-fund-detail?report_date=${encodeURIComponent(reportDate)}&client_name=${encodeURIComponent(clientName)}&fund_type=${encodeURIComponent(fundType)}`
      const res = await requestApiJson<PrivateFundDetail>(url)
      setData(res)
    } catch (err: any) {
      setError(err.message || `Failed to load ${fundType} detail`)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [reportDate, clientName, fundType])

  return { data, loading, error, fetch }
}
