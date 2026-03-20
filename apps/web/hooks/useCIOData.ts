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
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!reportDate || !clientName) return
    setLoading(true)
    try {
      const accountsCsv = accounts.length > 0 ? accounts.join(',') : ''
      const url = `/api/cio/account-summary?report_date=${encodeURIComponent(reportDate)}&client_name=${encodeURIComponent(clientName)}${accountsCsv ? `&accounts=${encodeURIComponent(accountsCsv)}` : ''}`
      const res = await requestApiJson<{ funds: AccountSummaryFund[]; totals: AccountSummary }>(url)
      setTotals(res.totals)
      setFunds(res.funds)
    } catch {
      setTotals(null)
      setFunds([])
    } finally {
      setLoading(false)
    }
  }, [reportDate, clientName, accounts])

  return { totals, funds, loading, fetch }
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

export function useCIORaFundHoldings(reportDate: string) {
  const [data, setData] = useState<RaFundHolding[]>([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!reportDate) return
    setLoading(true)
    try {
      const url = `/api/cio/ra-fund-holdings?report_date=${encodeURIComponent(reportDate)}`
      const res = await requestApiJson<{ rows: RaFundHolding[] }>(url)
      setData(res.rows)
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [reportDate])

  return { data, loading, fetch }
}

export function useCIOCapitalCallsTimeline(reportDate: string) {
  const [data, setData] = useState<CapitalCallRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!reportDate) return
    setLoading(true)
    try {
      const url = `/api/cio/capital-calls-timeline?report_date=${encodeURIComponent(reportDate)}`
      const res = await requestApiJson<{ rows: CapitalCallRow[] }>(url)
      setData(res.rows)
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [reportDate])

  return { data, loading, fetch }
}
