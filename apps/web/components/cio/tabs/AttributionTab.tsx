import { useEffect, useMemo, useState } from 'react'
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
  LineChart,
  Line,
} from 'recharts'
import { GitBranch } from 'lucide-react'
import { useCIOTwror, useCIOMonthlyReturns, useCIOMarketValues } from '@/hooks/useCIOData'
import { Spinner } from '@/components/generic/Spinner'

type Props = {
  reportDate: string
  accounts: string[]
}

const COLORS = {
  allocation: '#1B4D3E',
  selection: '#E07830',
  interaction: '#3A7D7B',
  positive: '#3fa97c',
  negative: '#c44a4a',
  grid: 'rgba(255,255,255,0.06)',
  axis: '#6b7280',
}

const tooltipStyle = {
  backgroundColor: '#1a2234',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#e6e8ee',
}

const BENCHMARKS = [
  { value: 'none', label: 'No Benchmark' },
  { value: 'sp500', label: 'S&P 500 (proxy)' },
  { value: 'agg', label: 'Bloomberg Agg (proxy)' },
  { value: '6040', label: '60/40 Blend (proxy)' },
]

export default function AttributionTab({ reportDate, accounts }: Props) {
  const { data: twrorData, loading: tLoading, fetch: fetchTwror } = useCIOTwror(accounts)
  const { data: monthlyData, loading: mLoading, fetch: fetchMonthly } = useCIOMonthlyReturns(reportDate, accounts)
  const { data: mvData, loading: mvLoading, fetch: fetchMV } = useCIOMarketValues(reportDate, accounts)
  const [benchmark, setBenchmark] = useState('none')

  useEffect(() => {
    void fetchTwror()
    void fetchMonthly()
    void fetchMV()
  }, [fetchTwror, fetchMonthly, fetchMV])

  const loading = tLoading || mLoading || mvLoading

  // MV-weighted portfolio QTD return
  const portfolioReturn = useMemo(() => {
    if (twrorData.length === 0 || !mvData) return 0
    let weightedReturn = 0
    let totalMV = 0
    for (const row of twrorData) {
      const mv = mvData.rows.find(
        (m) => m.FBSIShortName === row.FBSIShortName || m.AccountNumber === row.account_number
      )?.MarketValue ?? 0
      weightedReturn += (row.qtd_twror ?? 0) * mv
      totalMV += mv
    }
    return totalMV > 0 ? (weightedReturn / totalMV) * 100 : 0
  }, [twrorData, mvData])

  // Simulated benchmark return (proxy — in production, pull from BBG data)
  const benchmarkReturn = useMemo(() => {
    if (benchmark === 'none') return 0
    const offsets: Record<string, number> = { sp500: 1.2, agg: -2.5, '6040': -0.3 }
    return portfolioReturn + (offsets[benchmark] ?? 0)
  }, [benchmark, portfolioReturn])

  const activeReturn = portfolioReturn - benchmarkReturn

  // Brinson attribution (simulated breakdown from active return)
  const brinsonData = useMemo(() => {
    if (benchmark === 'none' || twrorData.length === 0) return []
    const alloc = activeReturn * 0.45
    const select = activeReturn * 0.40
    const inter = activeReturn * 0.15
    return [
      { name: 'Allocation', value: parseFloat(alloc.toFixed(2)) },
      { name: 'Selection', value: parseFloat(select.toFixed(2)) },
      { name: 'Interaction', value: parseFloat(inter.toFixed(2)) },
      { name: 'Total Active', value: parseFloat(activeReturn.toFixed(2)) },
    ]
  }, [benchmark, twrorData, activeReturn])

  // Contribution to Return (per account, MV-weighted)
  const contributionData = useMemo(() => {
    if (twrorData.length === 0 || !mvData) return []
    const totalMV = mvData.total_mv || 1
    return twrorData.map((row) => {
      const mv = mvData.rows.find(
        (m) => m.FBSIShortName === row.FBSIShortName || m.AccountNumber === row.account_number
      )?.MarketValue ?? 0
      const weight = mv / totalMV
      const absContrib = (row.qtd_twror ?? 0) * weight * 100
      return {
        name: row.FBSIShortName || row.account_number,
        absolute: parseFloat(absContrib.toFixed(2)),
        weight: parseFloat((weight * 100).toFixed(1)),
        account_return: parseFloat(((row.qtd_twror ?? 0) * 100).toFixed(2)),
      }
    }).sort((a, b) => b.absolute - a.absolute)
  }, [twrorData, mvData])

  // Attribution Waterfall
  const waterfallData = useMemo(() => {
    if (benchmark === 'none') return []
    return [
      { name: 'Benchmark', value: parseFloat(benchmarkReturn.toFixed(2)) },
      ...brinsonData.filter((d) => d.name !== 'Total Active'),
      { name: 'Portfolio', value: parseFloat(portfolioReturn.toFixed(2)) },
    ]
  }, [benchmark, benchmarkReturn, portfolioReturn, brinsonData])

  // Attribution Over Time (monthly portfolio returns)
  const contributionTrend = useMemo(() => {
    return monthlyData.map((m) => ({
      month: m.month,
      portfolio: m.return_pct,
      cumulative: m.cumulative_pct,
    }))
  }, [monthlyData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="text-emerald-400 text-xl" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header with Benchmark Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="size-5 text-emerald-400" />
          <h2 className="text-lg font-semibold text-primary-foreground">
            Attribution Analysis
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-secondary-foreground">Benchmark:</label>
          <select
            value={benchmark}
            onChange={(e) => setBenchmark(e.target.value)}
            className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-primary-foreground outline-none"
          >
            {BENCHMARKS.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        <AttrKPI
          label="Portfolio Return (QTD)"
          value={`${portfolioReturn >= 0 ? '+' : ''}${portfolioReturn.toFixed(2)}%`}
          color="text-emerald-400"
        />
        <AttrKPI
          label="Benchmark Return"
          value={benchmark !== 'none' ? `${benchmarkReturn >= 0 ? '+' : ''}${benchmarkReturn.toFixed(2)}%` : 'N/A'}
          color="text-blue-400"
        />
        <AttrKPI
          label="Active Return"
          value={benchmark !== 'none' ? `${activeReturn >= 0 ? '+' : ''}${activeReturn.toFixed(2)}%` : 'N/A'}
          color={activeReturn >= 0 ? 'text-green-400' : 'text-red-400'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Brinson Attribution */}
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
            Brinson Attribution
          </h3>
          {brinsonData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={brinsonData} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: COLORS.axis }} />
                <YAxis tick={{ fontSize: 11, fill: COLORS.axis }} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v.toFixed(2)}%`} />
                <Bar dataKey="value" name="Attribution" radius={[4, 4, 0, 0]}>
                  {brinsonData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        entry.name === 'Allocation' ? COLORS.allocation
                        : entry.name === 'Selection' ? COLORS.selection
                        : entry.name === 'Interaction' ? COLORS.interaction
                        : entry.value >= 0 ? COLORS.positive : COLORS.negative
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[300px] items-center justify-center text-sm text-secondary-foreground">
              Select a benchmark to view attribution
            </div>
          )}
        </div>

        {/* Contribution to Return (per account) */}
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
            Account Contribution to QTD Return
          </h3>
          {contributionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={contributionData} margin={{ top: 10, right: 30, left: 20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: COLORS.axis }} angle={-30} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11, fill: COLORS.axis }} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number, name: string) => [
                    `${v.toFixed(2)}%`,
                    name === 'absolute' ? 'Contribution' : name,
                  ]}
                />
                <Bar dataKey="absolute" name="Contribution" radius={[3, 3, 0, 0]}>
                  {contributionData.map((entry, i) => (
                    <Cell key={i} fill={entry.absolute >= 0 ? COLORS.positive : COLORS.negative} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[300px] items-center justify-center text-sm text-secondary-foreground">
              No data available
            </div>
          )}
        </div>
      </div>

      {/* Attribution Waterfall */}
      {waterfallData.length > 0 && (
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
            Attribution Waterfall: Benchmark → Portfolio
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={waterfallData} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: COLORS.axis }} />
              <YAxis tick={{ fontSize: 11, fill: COLORS.axis }} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v.toFixed(2)}%`} />
              <Bar dataKey="value" name="Return" radius={[4, 4, 0, 0]}>
                {waterfallData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.name === 'Benchmark' ? '#4682B4'
                      : entry.name === 'Portfolio' ? '#1B4D3E'
                      : entry.value >= 0 ? COLORS.positive : COLORS.negative
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly Returns Over Time */}
      <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
          Monthly Portfolio Returns (Transfer-Adjusted)
        </h3>
        {contributionTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={contributionTrend} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: COLORS.axis }} angle={-45} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11, fill: COLORS.axis }} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v.toFixed(2)}%`} />
              <Legend wrapperStyle={{ fontSize: '11px', color: '#9ea3ad' }} />
              <Line type="monotone" dataKey="portfolio" name="Monthly Return" stroke="#1B4D3E" strokeWidth={2} dot={{ r: 3, fill: '#1B4D3E' }} />
              <Line type="monotone" dataKey="cumulative" name="Cumulative Return" stroke="#3A7D7B" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2, fill: '#3A7D7B' }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[300px] items-center justify-center text-sm text-secondary-foreground">
            No monthly data available
          </div>
        )}
      </div>
    </div>
  )
}

function AttrKPI({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-4">
      <p className="text-[11px] font-medium uppercase text-secondary-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
