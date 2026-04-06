import { useCallback, useEffect, useState } from 'react'
import { requestApiJson } from '@/lib/requestApiJson'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DAFAccount = {
  AccountNumber: string
  PrimaryAccountHolder: string
  FBSIShortName: string
  CustomShortName: string
  ClientName: string
  EstablishedDate: string | null
  InvestmentProgram: string | null
  Benchmark: string | null
}

export type DAFTransaction = {
  Date: string
  AccountNumber: string
  KeyCode: number | null
  TransactionType: string
  TransactionCategory: string
  TransactionSubcategory: string
  BuySellCode: string | null
  SecurityType: string
  CUSIP: string
  Description: string
  Quantity: number
  Amount: number
  MarketValue: number
  Commission: number
  RunDate: string | null
  TradeDate: string | null
  EntryDate: string | null
}

export type DAFLot = {
  Date: string
  AccountNumber: string
  CUSIP: string
  Description: string
  Quantity: number
  CostBasis: number
  CurrentMV: number
  UnrealizedGL: number
  GainPct: number
  HoldingDays: number
  TermLabel: string
  Category: string
  TransactionType: string
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useDAFFamilies() {
  const [families, setFamilies] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    requestApiJson<{ families: string[] }>('/api/daf/families')
      .then((res) => {
        if (!cancelled) setFamilies(res.families)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { families, loading }
}

export function useDAFAccounts(family: string) {
  const [accounts, setAccounts] = useState<DAFAccount[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!family) {
      setAccounts([])
      return
    }
    let cancelled = false
    setLoading(true)
    requestApiJson<{ accounts: DAFAccount[] }>(
      `/api/daf/accounts?family=${encodeURIComponent(family)}`
    )
      .then((res) => {
        if (!cancelled) setAccounts(res.accounts)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [family])

  return { accounts, loading }
}

export function useDAFTransactions(
  accountNumbers: string[],
  startDate: string,
  endDate: string
) {
  const [rows, setRows] = useState<DAFTransaction[]>([])
  const [stats, setStats] = useState({
    count: 0,
    net_amount: 0,
    buy_count: 0,
    sell_count: 0,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(() => {
    if (accountNumbers.length === 0 || !startDate || !endDate) return
    setLoading(true)
    setError(null)
    requestApiJson<{
      rows: DAFTransaction[]
      count: number
      net_amount: number
      buy_count: number
      sell_count: number
    }>(
      `/api/daf/transactions?accounts=${accountNumbers.join(',')}&start_date=${startDate}&end_date=${endDate}`
    )
      .then((res) => {
        setRows(res.rows)
        setStats({
          count: res.count,
          net_amount: res.net_amount,
          buy_count: res.buy_count,
          sell_count: res.sell_count,
        })
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [accountNumbers, startDate, endDate])

  return { rows, stats, loading, error, fetch }
}

export function useDAFLots(accountNumbers: string[]) {
  const [rows, setRows] = useState<DAFLot[]>([])
  const [stats, setStats] = useState({
    count: 0,
    total_cost_basis: 0,
    total_current_mv: 0,
    total_unrealized_gl: 0,
    total_gains: 0,
    total_losses: 0,
    daf_candidates: 0,
    tlh_candidates: 0,
    unique_securities: 0,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(() => {
    if (accountNumbers.length === 0) return
    setLoading(true)
    setError(null)
    requestApiJson<{
      rows: DAFLot[]
      count: number
      total_cost_basis: number
      total_current_mv: number
      total_unrealized_gl: number
      total_gains: number
      total_losses: number
      daf_candidates: number
      tlh_candidates: number
      unique_securities: number
    }>(`/api/daf/lots?accounts=${accountNumbers.join(',')}`)
      .then((res) => {
        setRows(res.rows)
        setStats({
          count: res.count,
          total_cost_basis: res.total_cost_basis,
          total_current_mv: res.total_current_mv,
          total_unrealized_gl: res.total_unrealized_gl,
          total_gains: res.total_gains,
          total_losses: res.total_losses,
          daf_candidates: res.daf_candidates,
          tlh_candidates: res.tlh_candidates,
          unique_securities: res.unique_securities,
        })
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [accountNumbers])

  return { rows, stats, loading, error, fetch }
}
