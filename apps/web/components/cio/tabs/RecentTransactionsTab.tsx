import { useEffect, useMemo, useState } from 'react'
import { Receipt, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts'
import {
  useCIORecentTransactions,
  type TransactionRow,
} from '@/hooks/useCIOData'
import { Spinner } from '@/components/generic/Spinner'

type Props = {
  reportDate: string
  accounts: string[]
}

const TEAL = '#3A7D7B'
const ORANGE = '#E07830'
const AXIS = '#6b7280'
const GRID = 'rgba(255,255,255,0.06)'

const tooltipStyle = {
  backgroundColor: '#1a2234',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#e6e8ee',
}

const formatCurrency = (v: number) => {
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

type SortKey = 'date' | 'amount' | 'account_name' | 'description' | 'category'
type SortDir = 'asc' | 'desc'

export default function RecentTransactionsTab({ reportDate, accounts }: Props) {
  const { data, loading, fetch } = useCIORecentTransactions(reportDate, accounts)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('amount')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filterCategory, setFilterCategory] = useState<string>('all')

  useEffect(() => {
    void fetch()
  }, [fetch])

  // Summary stats
  const stats = useMemo(() => {
    let buys = 0
    let sells = 0
    let buyCount = 0
    let sellCount = 0
    let otherCount = 0
    for (const r of data) {
      const amt = r.amount || 0
      if (r.buy_sell === 'B' || amt < 0) {
        buys += Math.abs(amt)
        buyCount++
      } else if (r.buy_sell === 'S' || amt > 0) {
        sells += Math.abs(amt)
        sellCount++
      } else {
        otherCount++
      }
    }
    return { buys, sells, buyCount, sellCount, otherCount, total: data.length }
  }, [data])

  // Category breakdown for chart
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { buys: number; sells: number }> = {}
    for (const r of data) {
      const cat = r.category || r.transaction_type || 'Other'
      if (!map[cat]) map[cat] = { buys: 0, sells: 0 }
      const amt = Math.abs(r.amount || 0)
      if (r.buy_sell === 'B' || (r.amount || 0) < 0) {
        map[cat].buys += amt
      } else {
        map[cat].sells += amt
      }
    }
    return Object.entries(map)
      .map(([name, { buys, sells }]) => ({ name, buys, sells }))
      .sort((a, b) => (b.buys + b.sells) - (a.buys + a.sells))
      .slice(0, 10)
  }, [data])

  // Unique categories
  const categories = useMemo(() => {
    const set = new Set(data.map((r) => r.category || r.transaction_type || 'Other'))
    return Array.from(set).sort()
  }, [data])

  // Filtered & sorted
  const displayed = useMemo(() => {
    let rows = [...data]
    if (filterCategory !== 'all') {
      rows = rows.filter((r) => (r.category || r.transaction_type || 'Other') === filterCategory)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(
        (r) =>
          r.description?.toLowerCase().includes(q) ||
          r.account_name?.toLowerCase().includes(q) ||
          r.category?.toLowerCase().includes(q) ||
          r.transaction_type?.toLowerCase().includes(q)
      )
    }
    rows.sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      if (sortKey === 'amount') {
        av = Math.abs(a.amount || 0)
        bv = Math.abs(b.amount || 0)
      } else {
        av = (a as any)[sortKey] ?? ''
        bv = (b as any)[sortKey] ?? ''
      }
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      const cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [data, filterCategory, search, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'amount' || key === 'date' ? 'desc' : 'asc')
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) => (
    <ArrowUpDown
      className={`inline-block ml-1 size-3 ${sortKey === col ? 'text-emerald-400' : 'text-neutral-500'}`}
    />
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="text-blue-400 text-xl" />
        <span className="ml-3 text-secondary-foreground">Loading transactions...</span>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-secondary-foreground">
        <Receipt className="mb-3 size-10 opacity-40" />
        <p>No transaction data available. Click <strong>▶ Run</strong> first, then switch to this tab.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-neutral-750 bg-neutral-850 p-5">
          <p className="text-[11px] font-medium uppercase text-secondary-foreground">Total Transactions</p>
          <p className="mt-1 text-2xl font-bold text-primary-foreground">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-neutral-750 bg-neutral-850 p-5">
          <p className="text-[11px] font-medium uppercase text-secondary-foreground">
            <ArrowDown className="mr-1 inline size-3 text-rose-400" />Buys / Outflows
          </p>
          <p className="mt-1 text-2xl font-bold text-rose-400">{formatCurrency(stats.buys)}</p>
          <p className="mt-0.5 text-[10px] text-secondary-foreground">{stats.buyCount} transactions</p>
        </div>
        <div className="rounded-xl border border-neutral-750 bg-neutral-850 p-5">
          <p className="text-[11px] font-medium uppercase text-secondary-foreground">
            <ArrowUp className="mr-1 inline size-3 text-emerald-400" />Sells / Inflows
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">{formatCurrency(stats.sells)}</p>
          <p className="mt-0.5 text-[10px] text-secondary-foreground">{stats.sellCount} transactions</p>
        </div>
        <div className="rounded-xl border border-neutral-750 bg-neutral-850 p-5">
          <p className="text-[11px] font-medium uppercase text-secondary-foreground">Categories</p>
          <p className="mt-1 text-2xl font-bold text-primary-foreground">{categories.length}</p>
        </div>
      </div>

      {/* Bar chart by category */}
      {categoryBreakdown.length > 0 && (
        <div className="rounded-xl border border-neutral-750 bg-neutral-850 p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">Volume by Category (QTD)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={categoryBreakdown} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis type="number" tick={{ fontSize: 10, fill: AXIS }} tickFormatter={formatCurrency} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: AXIS }} width={120} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="buys" name="Buys / Outflows" fill={ORANGE} radius={[0, 4, 4, 0]} />
              <Bar dataKey="sells" name="Sells / Inflows" fill={TEAL} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Transaction table */}
      <div className="rounded-xl border border-neutral-750 bg-neutral-850 p-5">
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description, account, or category..."
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 py-2 pl-9 pr-3 text-sm text-primary-foreground outline-none focus:border-emerald-600"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-primary-foreground outline-none focus:border-emerald-600"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="max-h-[500px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-neutral-850">
              <tr className="border-b border-neutral-700 text-[11px] font-medium uppercase text-secondary-foreground">
                <th className="cursor-pointer whitespace-nowrap px-3 py-2" onClick={() => handleSort('date')}>
                  Date <SortIcon col="date" />
                </th>
                <th className="cursor-pointer whitespace-nowrap px-3 py-2" onClick={() => handleSort('account_name')}>
                  Account <SortIcon col="account_name" />
                </th>
                <th className="cursor-pointer whitespace-nowrap px-3 py-2" onClick={() => handleSort('category')}>
                  Category <SortIcon col="category" />
                </th>
                <th className="cursor-pointer whitespace-nowrap px-3 py-2" onClick={() => handleSort('description')}>
                  Description <SortIcon col="description" />
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-center">B / S</th>
                <th className="cursor-pointer whitespace-nowrap px-3 py-2 text-right" onClick={() => handleSort('amount')}>
                  Amount <SortIcon col="amount" />
                </th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((row, i) => {
                const isBuy = row.buy_sell === 'B' || (row.amount || 0) < 0
                return (
                  <tr key={`${row.account_number}-${row.date}-${i}`} className="border-b border-neutral-800 hover:bg-neutral-800/50">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-secondary-foreground">
                      {String(row.date).slice(0, 10)}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-xs text-primary-foreground">
                      {row.account_name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="rounded-full bg-neutral-700 px-2 py-0.5 text-[10px] font-medium text-neutral-300">
                        {row.category || row.transaction_type}
                      </span>
                    </td>
                    <td className="max-w-[240px] truncate px-3 py-2 text-xs text-primary-foreground">
                      {row.description}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-center">
                      {isBuy ? (
                        <span className="rounded bg-rose-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-rose-400">BUY</span>
                      ) : (
                        <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">SELL</span>
                      )}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right font-mono text-xs ${isBuy ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {isBuy ? '-' : '+'}{formatCurrency(Math.abs(row.amount || 0))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-right text-[10px] text-neutral-500">
          Showing {displayed.length} of {data.length} transactions (QTD, &gt; $100)
        </p>
      </div>
    </div>
  )
}
