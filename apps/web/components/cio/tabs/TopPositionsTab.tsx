import { useEffect, useMemo, useState } from 'react'
import { Layers, Search, ArrowUpDown } from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'
import {
  useCIOTopPositions,
  type PositionRow,
} from '@/hooks/useCIOData'
import { Spinner } from '@/components/generic/Spinner'

type Props = {
  reportDate: string
  accounts: string[]
}

const COLORS = [
  '#1B4D3E', '#C4B998', '#E07830', '#2D5A4A', '#0D7377',
  '#D4A853', '#5C4D7D', '#8B4513', '#2E8B57', '#CD853F',
  '#4682B4', '#9370DB',
]

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

type SortKey = 'symbol' | 'description' | 'asset_class' | 'market_value' | 'account_name'
type SortDir = 'asc' | 'desc'

export default function TopPositionsTab({ reportDate, accounts }: Props) {
  const { data, loading, fetch } = useCIOTopPositions(reportDate, accounts)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('market_value')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filterClass, setFilterClass] = useState<string>('all')

  useEffect(() => {
    void fetch()
  }, [fetch])

  // Asset class breakdown for pie chart
  const assetBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    for (const row of data) {
      const cls = row.asset_class || 'Other'
      map[cls] = (map[cls] || 0) + (row.market_value || 0)
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [data])

  const totalMV = useMemo(() => data.reduce((s, r) => s + (r.market_value || 0), 0), [data])

  // Unique asset classes for filter
  const assetClasses = useMemo(() => {
    const set = new Set(data.map((r) => r.asset_class || 'Other'))
    return Array.from(set).sort()
  }, [data])

  // Filtered & sorted data
  const displayed = useMemo(() => {
    let rows = [...data]
    if (filterClass !== 'all') {
      rows = rows.filter((r) => (r.asset_class || 'Other') === filterClass)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(
        (r) =>
          r.symbol?.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.account_name?.toLowerCase().includes(q)
      )
    }
    rows.sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      const cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [data, filterClass, search, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'market_value' ? 'desc' : 'asc')
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
        <span className="ml-3 text-secondary-foreground">Loading positions...</span>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-secondary-foreground">
        <Layers className="mb-3 size-10 opacity-40" />
        <p>No position data available. Click <strong>▶ Run</strong> first, then switch to this tab.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-750 bg-neutral-850 p-5">
          <p className="text-[11px] font-medium uppercase text-secondary-foreground">Total Market Value</p>
          <p className="mt-1 text-2xl font-bold text-primary-foreground">{formatCurrency(totalMV)}</p>
        </div>
        <div className="rounded-xl border border-neutral-750 bg-neutral-850 p-5">
          <p className="text-[11px] font-medium uppercase text-secondary-foreground">Positions</p>
          <p className="mt-1 text-2xl font-bold text-primary-foreground">{data.length}</p>
        </div>
        <div className="rounded-xl border border-neutral-750 bg-neutral-850 p-5">
          <p className="text-[11px] font-medium uppercase text-secondary-foreground">Asset Classes</p>
          <p className="mt-1 text-2xl font-bold text-primary-foreground">{assetClasses.length}</p>
        </div>
      </div>

      {/* Pie chart + controls row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Pie chart */}
        <div className="rounded-xl border border-neutral-750 bg-neutral-850 p-5 lg:col-span-1">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">Asset Class Breakdown</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={assetBreakdown}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={2}
              >
                {assetBreakdown.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px', color: '#9ca3af' }}
                formatter={(value: string, entry: any) => {
                  const pct = totalMV > 0 ? ((entry.payload.value / totalMV) * 100).toFixed(1) : '0'
                  return `${value} (${pct}%)`
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-neutral-750 bg-neutral-850 p-5 lg:col-span-2">
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search symbol, name, or account..."
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 py-2 pl-9 pr-3 text-sm text-primary-foreground outline-none focus:border-emerald-600"
              />
            </div>
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-primary-foreground outline-none focus:border-emerald-600"
            >
              <option value="all">All Classes</option>
              {assetClasses.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Holdings table */}
          <div className="max-h-[500px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-neutral-850">
                <tr className="border-b border-neutral-700 text-[11px] font-medium uppercase text-secondary-foreground">
                  <th className="cursor-pointer whitespace-nowrap px-3 py-2" onClick={() => handleSort('symbol')}>
                    Symbol <SortIcon col="symbol" />
                  </th>
                  <th className="cursor-pointer whitespace-nowrap px-3 py-2" onClick={() => handleSort('description')}>
                    Description <SortIcon col="description" />
                  </th>
                  <th className="cursor-pointer whitespace-nowrap px-3 py-2" onClick={() => handleSort('account_name')}>
                    Account <SortIcon col="account_name" />
                  </th>
                  <th className="cursor-pointer whitespace-nowrap px-3 py-2" onClick={() => handleSort('asset_class')}>
                    Class <SortIcon col="asset_class" />
                  </th>
                  <th className="cursor-pointer whitespace-nowrap px-3 py-2 text-right" onClick={() => handleSort('market_value')}>
                    Market Value <SortIcon col="market_value" />
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Weight</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Price</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((row, i) => {
                  const weight = totalMV > 0 ? (row.market_value / totalMV) * 100 : 0
                  return (
                    <tr key={`${row.account_number}-${row.symbol}-${i}`} className="border-b border-neutral-800 hover:bg-neutral-800/50">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold text-emerald-400">
                        {row.symbol}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2 text-xs text-primary-foreground">
                        {row.description}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-xs text-secondary-foreground">
                        {row.account_name}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className="rounded-full bg-neutral-700 px-2 py-0.5 text-[10px] font-medium text-neutral-300">
                          {row.asset_class}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs text-primary-foreground">
                        {formatCurrency(row.market_value)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-secondary-foreground">
                        {weight.toFixed(2)}%
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs text-secondary-foreground">
                        ${row.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs text-secondary-foreground">
                        {row.quantity?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-right text-[10px] text-neutral-500">
            Showing {displayed.length} of {data.length} positions
          </p>
        </div>
      </div>
    </div>
  )
}
