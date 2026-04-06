import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/router'
import {
  Landmark,
  ListChecks,
  ArrowRightLeft,
  Target,
  ShoppingCart,
  Search,
  Download,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from 'lucide-react'

import useCurrentUser from '@/hooks/useCurrentUser'
import {
  useDAFFamilies,
  useDAFAccounts,
  useDAFTransactions,
  useDAFLots,
  type DAFTransaction,
  type DAFLot,
} from '@/hooks/useDAFData'
import { Spinner } from '@/components/generic/Spinner'
import { Button } from '@/components/generic/Button'
import SectionContainer from '@/components/generic/SectionContainer'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDollar = (n: number) => `$${fmt(Math.abs(n))}`

const fmtQty = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })

const today = () => {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

const oneYearAgo = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().slice(0, 10)
}

/** Format a raw numeric string with commas (e.g. "10000" → "10,000") */
const formatWithCommas = (raw: string): string => {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  if (!cleaned) return ''
  const parts = cleaned.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.join('.')
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'accounts', label: 'Accounts', icon: ListChecks },
  { id: 'transactions', label: 'Transactions', icon: ArrowRightLeft },
  { id: 'lots', label: 'Lot Analysis', icon: Target },
  { id: 'buysell', label: 'Buy / Sell History', icon: ShoppingCart },
] as const

type TabId = (typeof TABS)[number]['id']

// ---------------------------------------------------------------------------
// MetricCard
// ---------------------------------------------------------------------------

const MetricCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-4">
    <p className="text-[11px] font-medium uppercase text-secondary-foreground">
      {label}
    </p>
    <p className="mt-1 text-lg font-semibold text-primary-foreground">{value}</p>
  </div>
)

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------

type Column<T> = {
  key: keyof T
  label: string
  format?: (v: unknown) => string
  align?: 'left' | 'right'
  sortable?: boolean
}

type SortState<T> = { key: keyof T; dir: 'asc' | 'desc' } | null

function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  maxHeight = '450px',
}: {
  data: T[]
  columns: Column<T>[]
  maxHeight?: string
}) {
  const [sort, setSort] = useState<SortState<T>>(null)

  const toggleSort = (key: keyof T) => {
    setSort((prev) => {
      if (prev?.key === key) {
        return prev.dir === 'asc' ? { key, dir: 'desc' } : null
      }
      return { key, dir: 'asc' }
    })
  }

  const sortedData = useMemo(() => {
    if (!sort) return data
    const { key, dir } = sort
    return [...data].sort((a, b) => {
      const va = a[key]
      const vb = b[key]
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb))
      return dir === 'asc' ? cmp : -cmp
    })
  }, [data, sort])

  return (
    <div className="overflow-auto rounded-md border border-neutral-750" style={{ maxHeight }}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 border-b border-neutral-750 bg-neutral-850">
          <tr>
            {columns.map((col) => {
              const isSorted = sort?.key === col.key
              return (
                <th
                  key={String(col.key)}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                  className={`whitespace-nowrap px-3 py-2 text-[11px] font-medium uppercase text-secondary-foreground ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  } ${col.sortable ? 'cursor-pointer select-none hover:text-primary-foreground' : ''}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      isSorted
                        ? sort.dir === 'asc'
                          ? <ChevronUp className="size-3" />
                          : <ChevronDown className="size-3" />
                        : <ChevronsUpDown className="size-3 opacity-40" />
                    )}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, i) => (
            <tr
              key={i}
              className="border-b border-neutral-800 transition-colors hover:bg-neutral-800/50"
            >
              {columns.map((col) => {
                const raw = row[col.key]
                const text = col.format ? col.format(raw) : String(raw ?? '')
                return (
                  <td
                    key={String(col.key)}
                    className={`whitespace-nowrap px-3 py-2 text-primary-foreground ${
                      col.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                    }`}
                  >
                    {text}
                  </td>
                )
              })}
            </tr>
          ))}
          {sortedData.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="py-8 text-center text-sm text-secondary-foreground"
              >
                No data available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const DAFLotSelector = () => {
  const router = useRouter()
  const { currentUser, isUnauthorized, loading: userLoading } = useCurrentUser()

  // Tab
  const [activeTab, setActiveTab] = useState<TabId>('accounts')

  // Filters
  const [selectedFamily, setSelectedFamily] = useState('')
  const [selectedAccountNums, setSelectedAccountNums] = useState<string[]>([])
  const [startDate, setStartDate] = useState(oneYearAgo())
  const [endDate, setEndDate] = useState(today())
  const [dafTarget, setDafTarget] = useState('')
  const [txSearch, setTxSearch] = useState('')
  const [termFilter, setTermFilter] = useState<'all' | 'long' | 'short'>('all')
  const [hasRun, setHasRun] = useState(false)

  // Data
  const { families, loading: familiesLoading } = useDAFFamilies()
  const { accounts, loading: accountsLoading } = useDAFAccounts(selectedFamily)
  const {
    rows: txRows,
    stats: txStats,
    loading: txLoading,
    error: txError,
    fetch: fetchTx,
  } = useDAFTransactions(selectedAccountNums, startDate, endDate)
  const {
    rows: lotRows,
    stats: lotStats,
    loading: lotsLoading,
    error: lotsError,
    fetch: fetchLots,
  } = useDAFLots(selectedAccountNums)

  // Auto-select first family
  useEffect(() => {
    if (families.length > 0 && !selectedFamily) {
      setSelectedFamily(families[0])
    }
  }, [families, selectedFamily])

  // Auto-select all accounts when family changes
  useEffect(() => {
    if (accounts.length > 0) {
      setSelectedAccountNums(accounts.map((a) => a.AccountNumber))
    } else {
      setSelectedAccountNums([])
    }
  }, [accounts])

  // Login redirect
  useEffect(() => {
    if (isUnauthorized || (!userLoading && !currentUser)) {
      void router.replace('/login?next=/daf')
    }
  }, [router, isUnauthorized, userLoading, currentUser])

  // Run all queries
  const handleRun = useCallback(() => {
    setHasRun(true)
    fetchTx()
    fetchLots()
  }, [fetchTx, fetchLots])

  // Filtered transactions
  const filteredTx = useMemo(() => {
    if (!txSearch) return txRows
    const q = txSearch.toLowerCase()
    return txRows.filter(
      (r) =>
        r.Description?.toLowerCase().includes(q) ||
        r.CUSIP?.toLowerCase().includes(q) ||
        r.TransactionType?.toLowerCase().includes(q) ||
        r.AccountNumber?.toLowerCase().includes(q)
    )
  }, [txRows, txSearch])

  // Filtered lots
  const filteredLots = useMemo(() => {
    if (termFilter === 'all') return lotRows
    if (termFilter === 'long') return lotRows.filter((r) => r.TermLabel === 'Long-Term')
    return lotRows.filter((r) => r.TermLabel === 'Short-Term')
  }, [lotRows, termFilter])

  // DAF target lots — prioritize long-term appreciated positions (largest gain first)
  const dafTargetNum = parseFloat(dafTarget.replace(/,/g, '').replace('$', '')) || 0

  // Split lots by category
  const dafCandidates = useMemo(
    () => lotRows.filter((r) => (r.UnrealizedGL || 0) > 0 && r.TermLabel === 'Long-Term'),
    [lotRows]
  )
  const tlhCandidates = useMemo(
    () => lotRows.filter((r) => (r.UnrealizedGL || 0) < 0),
    [lotRows]
  )
  const stAppreciated = useMemo(
    () => lotRows.filter((r) => (r.UnrealizedGL || 0) > 0 && r.TermLabel !== 'Long-Term'),
    [lotRows]
  )

  const suggestedLots = useMemo(() => {
    if (dafTargetNum <= 0) return []
    // Best DAF gifts: long-term, largest unrealized gain first
    const sorted = [...dafCandidates].sort(
      (a, b) => (b.UnrealizedGL || 0) - (a.UnrealizedGL || 0)
    )
    let running = 0
    const selected: DAFLot[] = []
    for (const lot of sorted) {
      if (running >= dafTargetNum) break
      const val = lot.CurrentMV || 0
      if (val > 0) {
        selected.push(lot)
        running += val
      }
    }
    return selected
  }, [dafCandidates, dafTargetNum])

  const suggestedTotal = suggestedLots.reduce(
    (acc, r) => acc + (r.CurrentMV || 0),
    0
  )
  const suggestedAvoidedGains = suggestedLots.reduce(
    (acc, r) => acc + (r.UnrealizedGL || 0),
    0
  )

  // CSV download helper
  const downloadCsv = (data: Record<string, unknown>[], filename: string) => {
    if (data.length === 0) return
    const keys = Object.keys(data[0])
    const csv = [
      keys.join(','),
      ...data.map((row) => keys.map((k) => JSON.stringify(row[k] ?? '')).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // --- Transaction table columns ---
  const txColumns: Column<DAFTransaction>[] = [
    { key: 'Date', label: 'Date', sortable: true },
    { key: 'AccountNumber', label: 'Account' },
    { key: 'TransactionType', label: 'Type' },
    { key: 'TransactionCategory', label: 'Category' },
    { key: 'CUSIP', label: 'CUSIP' },
    { key: 'Description', label: 'Description' },
    { key: 'Quantity', label: 'Qty', align: 'right', format: (v) => fmtQty(Number(v) || 0), sortable: true },
    { key: 'Amount', label: 'Amount', align: 'right', format: (v) => fmtDollar(Number(v) || 0), sortable: true },
    { key: 'MarketValue', label: 'Mkt Value', align: 'right', format: (v) => fmtDollar(Number(v) || 0), sortable: true },
    { key: 'Commission', label: 'Comm', align: 'right', format: (v) => fmtDollar(Number(v) || 0) },
  ]

  // --- Lot table columns ---
  const lotColumns: Column<DAFLot>[] = [
    { key: 'Date', label: 'Acquired', sortable: true },
    { key: 'Description', label: 'Description' },
    { key: 'CUSIP', label: 'CUSIP' },
    { key: 'Quantity', label: 'Shares', align: 'right', format: (v) => fmtQty(Number(v) || 0), sortable: true },
    { key: 'CostBasis', label: 'Cost Basis', align: 'right', format: (v) => fmtDollar(Number(v) || 0), sortable: true },
    { key: 'CurrentMV', label: 'Current MV', align: 'right', format: (v) => fmtDollar(Number(v) || 0), sortable: true },
    { key: 'UnrealizedGL', label: 'Gain / Loss', align: 'right', format: (v) => {
      const n = Number(v) || 0
      return `${n >= 0 ? '+' : ''}${fmtDollar(n)}`
    }, sortable: true },
    { key: 'GainPct', label: 'Gain %', align: 'right', format: (v) => `${Number(v) >= 0 ? '+' : ''}${fmt(Number(v) || 0)}%`, sortable: true },
    { key: 'HoldingDays', label: 'Days', align: 'right', format: (v) => Number(v || 0).toLocaleString(), sortable: true },
    { key: 'TermLabel', label: 'Term' },
    { key: 'Category', label: 'Action' },
  ]

  // --- Account table columns ---
  const acctColumns: Column<Record<string, unknown>>[] = [
    { key: 'AccountNumber', label: 'Account #' },
    { key: 'PrimaryAccountHolder', label: 'Account Holder' },
    { key: 'FBSIShortName', label: 'FBSI Name' },
    { key: 'CustomShortName', label: 'Custom Name' },
    { key: 'InvestmentProgram', label: 'Program' },
    { key: 'EstablishedDate', label: 'Established' },
    { key: 'Benchmark', label: 'Benchmark' },
  ]

  if (userLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner className="text-blue-400 text-2xl" />
      </div>
    )
  }
  if (!currentUser) return null

  return (
    <div className="flex min-h-screen flex-col bg-neutral-900">
      {/* Header */}
      <header className="border-b border-neutral-750 bg-neutral-850 px-6 py-4">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-700 to-blue-500">
              <Landmark className="size-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-primary-foreground">
                DAF Lot Selector
              </h1>
              <p className="text-xs text-secondary-foreground">
                Identify lots to sell from Quantinno accounts to fund DAF
                contributions
              </p>
            </div>
          </div>
          <div className="text-xs text-secondary-foreground">
            {currentUser.email}
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="border-b border-neutral-750 bg-neutral-850/50 px-6 py-3">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-end gap-4">
          {/* Family */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase text-secondary-foreground">
              Family
            </label>
            <select
              value={selectedFamily}
              disabled={familiesLoading}
              onChange={(e) => {
                setSelectedFamily(e.target.value)
                setSelectedAccountNums([])
              }}
              className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-primary-foreground outline-none focus:border-blue-500 disabled:opacity-50"
            >
              <option value="">
                {familiesLoading ? 'Loading...' : 'Select family...'}
              </option>
              {families.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          {/* Accounts */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase text-secondary-foreground">
              Accounts
            </label>
            <select
              multiple
              value={selectedAccountNums}
              onChange={(e) =>
                setSelectedAccountNums(
                  Array.from(e.target.selectedOptions, (o) => o.value)
                )
              }
              className="h-[34px] min-w-[200px] rounded-md border border-neutral-700 bg-neutral-800 px-2 text-xs text-primary-foreground outline-none focus:border-blue-500"
            >
              {accounts.map((a) => (
                <option key={a.AccountNumber} value={a.AccountNumber}>
                  {a.FBSIShortName || a.AccountNumber}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase text-secondary-foreground">
              From
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-primary-foreground outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase text-secondary-foreground">
              To
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-primary-foreground outline-none focus:border-blue-500"
            />
          </div>

          {/* DAF Target */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase text-secondary-foreground">
              DAF Target ($)
            </label>
            <input
              type="text"
              value={dafTarget}
              placeholder="e.g. 100,000"
              onChange={(e) => setDafTarget(formatWithCommas(e.target.value))}
              className="w-[160px] rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-primary-foreground outline-none focus:border-blue-500"
            />
          </div>

          {/* Run */}
          <Button
            onClick={handleRun}
            disabled={txLoading || lotsLoading || selectedAccountNums.length === 0}
            type="button"
            className="bg-gradient-to-r from-blue-600 to-blue-500 px-6 text-white hover:from-blue-500 hover:to-blue-400"
          >
            {txLoading || lotsLoading ? (
              <>
                <Spinner className="mr-2 size-3.5" /> Loading...
              </>
            ) : (
              '▶ Run'
            )}
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-neutral-750 bg-neutral-850/30 px-6">
        <div className="scrollbar-none mx-auto flex max-w-[1400px] gap-0 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-3 text-xs font-medium transition-colors ${
                  isActive
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-secondary-foreground hover:border-neutral-600 hover:text-primary-foreground'
                }`}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Error Banner */}
      {(txError || lotsError) && (
        <div className="mx-auto mt-2 max-w-[1400px] px-6">
          <div className="rounded-lg border border-rose-700/50 bg-rose-900/30 px-4 py-3 text-sm text-rose-300">
            <strong>Error:</strong> {txError || lotsError}
          </div>
        </div>
      )}

      {/* Tab Content */}
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-[1400px]">
          {/* ── Accounts ── */}
          {activeTab === 'accounts' && (
            <div className="space-y-4">
              <SectionContainer title={`Quantinno Accounts — ${selectedFamily}`}>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MetricCard label="Total Accounts" value={String(accounts.length)} />
                  <MetricCard
                    label="Investment Programs"
                    value={String(
                      new Set(accounts.map((a) => a.InvestmentProgram).filter(Boolean))
                        .size
                    )}
                  />
                  <MetricCard
                    label="Earliest Account"
                    value={
                      accounts.length > 0
                        ? accounts
                            .map((a) => a.EstablishedDate)
                            .filter(Boolean)
                            .sort()[0]?.slice(0, 10) ?? 'N/A'
                        : 'N/A'
                    }
                  />
                  <MetricCard
                    label="Benchmarks Set"
                    value={String(
                      new Set(accounts.map((a) => a.Benchmark).filter(Boolean)).size
                    )}
                  />
                </div>
                <div className="mt-4">
                  <DataTable
                    data={accounts as unknown as Record<string, unknown>[]}
                    columns={acctColumns}
                  />
                </div>
              </SectionContainer>
            </div>
          )}

          {/* ── Transactions ── */}
          {activeTab === 'transactions' && (
            <div className="space-y-4">
              <SectionContainer title={`Transactions — ${selectedFamily}`}>
                {txRows.length === 0 && !txLoading ? (
                  <p className="mt-3 text-sm text-secondary-foreground">
                    {hasRun
                      ? 'No transactions found for the selected accounts and date range.'
                      : <>Click <strong>▶ Run</strong> to load transactions.</>}
                  </p>
                ) : (
                  <>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <MetricCard
                        label="Total Transactions"
                        value={txStats.count.toLocaleString()}
                      />
                      <MetricCard
                        label="Net Amount"
                        value={fmtDollar(txStats.net_amount)}
                      />
                      <MetricCard
                        label="Buy Transactions"
                        value={txStats.buy_count.toLocaleString()}
                      />
                      <MetricCard
                        label="Sell Transactions"
                        value={txStats.sell_count.toLocaleString()}
                      />
                    </div>

                    {/* Search */}
                    <div className="mt-4 flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary-foreground" />
                        <input
                          type="text"
                          value={txSearch}
                          onChange={(e) => setTxSearch(e.target.value)}
                          placeholder="Search by description, CUSIP, type…"
                          className="w-full rounded-md border border-neutral-700 bg-neutral-800 py-2 pl-9 pr-3 text-sm text-primary-foreground outline-none placeholder:text-muted-foreground focus:border-blue-500"
                        />
                      </div>
                      <button
                        onClick={() =>
                          downloadCsv(
                            filteredTx,
                            `${selectedFamily}_transactions_${startDate}_${endDate}.csv`
                          )
                        }
                        className="flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-secondary-foreground transition-colors hover:bg-neutral-700 hover:text-primary-foreground"
                      >
                        <Download className="size-3.5" /> CSV
                      </button>
                    </div>

                    <div className="mt-3">
                      <DataTable data={filteredTx} columns={txColumns} maxHeight="500px" />
                    </div>
                  </>
                )}
              </SectionContainer>
            </div>
          )}

          {/* ── Lot Analysis ── */}
          {activeTab === 'lots' && (
            <div className="space-y-4">
              {lotRows.length === 0 && !lotsLoading ? (
                <SectionContainer title={`Lot Analysis — ${selectedFamily}`}>
                  <div className="mt-3">
                    {hasRun ? (
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-primary-foreground">
                        <strong>No open investment positions found</strong> for this family.
                      </div>
                    ) : (
                      <p className="text-sm text-secondary-foreground">
                        Click <strong>▶ Run</strong> to analyze positions.
                      </p>
                    )}
                  </div>
                </SectionContainer>
              ) : (
                <>
                  {/* ── Portfolio Summary ── */}
                  <SectionContainer title="Portfolio Summary">
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                      <MetricCard label="Positions" value={lotStats.count.toLocaleString()} />
                      <MetricCard label="Total Cost Basis" value={fmtDollar(lotStats.total_cost_basis)} />
                      <MetricCard label="Current Market Value" value={fmtDollar(lotStats.total_current_mv)} />
                      <MetricCard
                        label="Net Unrealized G/L"
                        value={`${lotStats.total_unrealized_gl >= 0 ? '+' : ''}${fmtDollar(lotStats.total_unrealized_gl)}`}
                      />
                      <MetricCard
                        label="Total Unrealized Gains"
                        value={`+${fmtDollar(lotStats.total_gains)}`}
                      />
                      <MetricCard
                        label="Total Unrealized Losses"
                        value={fmtDollar(lotStats.total_losses)}
                      />
                    </div>
                  </SectionContainer>

                  {/* ── DAF Gift Candidates ── */}
                  <SectionContainer
                    title={
                      <span className="flex items-center gap-2">
                        <span className="inline-block size-2.5 rounded-full bg-green-400" />
                        DAF Gift Candidates — Long-Term Appreciated
                        <span className="ml-1 rounded bg-green-700/40 px-2 py-0.5 text-[11px] font-normal text-green-300">
                          {dafCandidates.length} lots
                        </span>
                      </span>
                    }
                  >
                    <p className="mt-1 text-xs text-secondary-foreground">
                      Donate these in-kind to the DAF to <strong>avoid capital gains tax</strong> on
                      the appreciation and deduct <strong>fair market value</strong> (up to 30% of AGI).
                      Sorted by largest unrealized gain.
                    </p>
                    {dafCandidates.length > 0 ? (
                      <div className="mt-3">
                        <DataTable data={dafCandidates} columns={lotColumns} maxHeight="350px" />
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-amber-400">
                        No long-term appreciated positions available.
                      </p>
                    )}
                  </SectionContainer>

                  {/* ── Tax-Loss Harvest Candidates ── */}
                  <SectionContainer
                    title={
                      <span className="flex items-center gap-2">
                        <span className="inline-block size-2.5 rounded-full bg-red-400" />
                        Tax-Loss Harvest Candidates
                        <span className="ml-1 rounded bg-red-700/40 px-2 py-0.5 text-[11px] font-normal text-red-300">
                          {tlhCandidates.length} lots
                        </span>
                      </span>
                    }
                  >
                    <p className="mt-1 text-xs text-secondary-foreground">
                      Sell these to <strong>realize losses</strong> that offset capital gains + up to $3,000
                      of ordinary income/year. Losses carry forward indefinitely and become
                      permanent if donated to charity.
                    </p>
                    {tlhCandidates.length > 0 ? (
                      <div className="mt-3">
                        <DataTable data={tlhCandidates} columns={lotColumns} maxHeight="350px" />
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-green-400">
                        No embedded losses — all positions are at a gain.
                      </p>
                    )}
                  </SectionContainer>

                  {/* ── Short-Term Appreciated ── */}
                  {stAppreciated.length > 0 && (
                    <SectionContainer
                      title={
                        <span className="flex items-center gap-2">
                          <span className="inline-block size-2.5 rounded-full bg-amber-400" />
                          Short-Term Appreciated (hold or sell with caution)
                          <span className="ml-1 rounded bg-amber-700/40 px-2 py-0.5 text-[11px] font-normal text-amber-300">
                            {stAppreciated.length} lots
                          </span>
                        </span>
                      }
                    >
                      <p className="mt-1 text-xs text-secondary-foreground">
                        These have gains but are held &lt;1 year. Donating short-term assets to a DAF
                        only yields a deduction at <strong>cost basis</strong> (not FMV). Consider holding
                        until they qualify as long-term.
                      </p>
                      <div className="mt-3">
                        <DataTable data={stAppreciated} columns={lotColumns} maxHeight="300px" />
                      </div>
                    </SectionContainer>
                  )}

                  {/* ── DAF Funding Plan ── */}
                  {dafTargetNum > 0 && (
                    <SectionContainer
                      title={
                        <span className="flex items-center gap-2">
                          <Target className="size-4 text-blue-400" />
                          DAF Funding Plan — Target {fmtDollar(dafTargetNum)}
                        </span>
                      }
                    >
                      <p className="mt-1 text-xs text-secondary-foreground">
                        Recommended positions to donate in-kind: <strong>long-term appreciated lots</strong> with
                        the largest unrealized gains (avoids capital gains + full FMV deduction).
                      </p>
                      {suggestedLots.length > 0 ? (
                        <>
                          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <MetricCard label="Lots to Donate" value={suggestedLots.length.toLocaleString()} />
                            <MetricCard label="Total FMV (Deduction)" value={fmtDollar(suggestedTotal)} />
                            <MetricCard
                              label="Capital Gains Avoided"
                              value={`+${fmtDollar(suggestedAvoidedGains)}`}
                            />
                            <MetricCard
                              label={suggestedTotal >= dafTargetNum ? 'Surplus' : 'Shortfall'}
                              value={fmtDollar(Math.abs(suggestedTotal - dafTargetNum))}
                            />
                          </div>
                          <div className="mt-3">
                            <DataTable data={suggestedLots} columns={lotColumns} maxHeight="300px" />
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() =>
                                downloadCsv(suggestedLots, `${selectedFamily}_DAF_gift_plan_${today()}.csv`)
                              }
                              className="flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-secondary-foreground transition-colors hover:bg-neutral-700 hover:text-primary-foreground"
                            >
                              <Download className="size-3.5" /> Download Gift Plan CSV
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="mt-3 text-sm text-amber-400">
                          No long-term appreciated lots available to meet the DAF target.
                          Consider using harvested losses to free up cash, or wait for short-term lots to age.
                        </p>
                      )}
                    </SectionContainer>
                  )}

                  {/* ── All Lots ── */}
                  <SectionContainer title="All Open Lots">
                    <div className="mt-3 flex gap-2">
                      {(['all', 'long', 'short'] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setTermFilter(f)}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                            termFilter === f
                              ? 'bg-blue-600 text-white'
                              : 'border border-neutral-700 bg-neutral-800 text-secondary-foreground hover:bg-neutral-700'
                          }`}
                        >
                          {f === 'all' ? 'All' : f === 'long' ? 'Long-Term' : 'Short-Term'}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3">
                      <DataTable data={filteredLots} columns={lotColumns} maxHeight="500px" />
                    </div>
                    <div className="mt-3">
                      <button
                        onClick={() => downloadCsv(filteredLots, `${selectedFamily}_all_lots_${today()}.csv`)}
                        className="flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-secondary-foreground transition-colors hover:bg-neutral-700 hover:text-primary-foreground"
                      >
                        <Download className="size-3.5" /> Download All Lots CSV
                      </button>
                    </div>
                  </SectionContainer>
                </>
              )}
            </div>
          )}

          {/* ── Buy / Sell History ── */}
          {activeTab === 'buysell' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SectionContainer title="Buys (excl. Money Market)">
                {(() => {
                  const buys = txRows.filter(
                    (r) =>
                      r.TransactionType === 'BOT' &&
                      r.TransactionCategory !== 'Money Market'
                  )
                  const buyTotal = buys.reduce(
                    (s, r) => s + Math.abs(r.Amount || 0),
                    0
                  )
                  return buys.length === 0 ? (
                    <p className="mt-3 text-sm text-secondary-foreground">
                      {!hasRun
                        ? 'Click ▶ Run to load.'
                        : 'No investment buys in this period.'}
                    </p>
                  ) : (
                    <>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <MetricCard
                          label="Total Buys"
                          value={buys.length.toLocaleString()}
                        />
                        <MetricCard
                          label="Total Buy Amount"
                          value={fmtDollar(buyTotal)}
                        />
                      </div>
                      <div className="mt-3">
                        <DataTable
                          data={buys}
                          columns={txColumns}
                          maxHeight="350px"
                        />
                      </div>
                    </>
                  )
                })()}
              </SectionContainer>
              <SectionContainer title="Sells (excl. Money Market)">
                {(() => {
                  const sells = txRows.filter(
                    (r) =>
                      r.TransactionType === 'SLD' &&
                      r.TransactionCategory !== 'Money Market'
                  )
                  const sellTotal = sells.reduce(
                    (s, r) => s + Math.abs(r.Amount || 0),
                    0
                  )
                  return sells.length === 0 ? (
                    <p className="mt-3 text-sm text-secondary-foreground">
                      {!hasRun
                        ? 'Click ▶ Run to load.'
                        : 'No investment sells in this period.'}
                    </p>
                  ) : (
                    <>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <MetricCard
                          label="Total Sells"
                          value={sells.length.toLocaleString()}
                        />
                        <MetricCard
                          label="Total Sell Proceeds"
                          value={fmtDollar(sellTotal)}
                        />
                      </div>
                      <div className="mt-3">
                        <DataTable
                          data={sells}
                          columns={txColumns}
                          maxHeight="350px"
                        />
                      </div>
                    </>
                  )
                })()}
              </SectionContainer>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-750 bg-neutral-850 px-6 py-3">
        <div className="mx-auto max-w-[1400px] text-xs text-secondary-foreground">
          Data source: <code className="text-primary-foreground">perennial-data-prod</code>{' '}
          · Accounts: <code className="text-primary-foreground">fidelity.accounts</code> ·
          Transactions:{' '}
          <code className="text-primary-foreground">fidelity.daily_transactions</code>
        </div>
      </footer>
    </div>
  )
}

export default DAFLotSelector
