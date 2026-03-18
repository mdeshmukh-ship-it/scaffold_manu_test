import { useEffect, useMemo } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
  ReferenceLine,
  Cell,
} from 'recharts'
import { Shield, TrendingDown, Activity, BarChart3 } from 'lucide-react'
import {
  useCIORiskMetrics,
  useCIORollingMetrics,
  useCIOTwror,
  useCIOPeriodVol,
} from '@/hooks/useCIOData'
import { Spinner } from '@/components/generic/Spinner'

type Props = {
  reportDate: string
  accounts: string[]
}

const TEAL = '#3A7D7B'
const ORANGE = '#E07830'
const GRID = 'rgba(255,255,255,0.06)'
const AXIS = '#6b7280'

const tooltipStyle = {
  backgroundColor: '#1a2234',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#e6e8ee',
}

export default function RiskTab({ reportDate, accounts }: Props) {
  const { data: metrics, loading: mLoading, fetch: fetchMetrics } = useCIORiskMetrics(reportDate, accounts)
  const { data: rollingData, loading: rLoading, fetch: fetchRolling } = useCIORollingMetrics(reportDate, accounts)
  const { data: twrorData, loading: tLoading, fetch: fetchTwror } = useCIOTwror(accounts)
  const { data: periodVol, loading: pvLoading, fetch: fetchPV } = useCIOPeriodVol(reportDate, accounts)

  useEffect(() => {
    void fetchMetrics()
    void fetchRolling()
    void fetchTwror()
    void fetchPV()
  }, [fetchMetrics, fetchRolling, fetchTwror, fetchPV])

  const loading = mLoading || rLoading || tLoading || pvLoading

  // Drawdown series for area chart
  const drawdownSeries = useMemo(() => {
    if (!rollingData || rollingData.length === 0) return []
    let peak = 0
    return rollingData.map((pt) => {
      const r = pt.return_365d
      if (r > peak) peak = r
      const dd = peak > 0 ? ((peak - r) / (100 + peak)) * 100 : 0
      return { date: pt.date, drawdown: -Math.abs(dd) }
    })
  }, [rollingData])

  // Period returns bar chart data — average across accounts from TWROR
  const periodReturnData = useMemo(() => {
    if (twrorData.length === 0) return []
    const avg = (field: 'qtd_twror' | 'ytd_twror' | 'one_year_twror' | 'three_year_twror' | 'inception_twror') => {
      const vals = twrorData.map((r) => r[field]).filter((v): v is number => v != null)
      return vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length) * 100 : 0
    }
    return [
      { period: 'QTD', value: parseFloat(avg('qtd_twror').toFixed(2)) },
      { period: 'YTD', value: parseFloat(avg('ytd_twror').toFixed(2)) },
      { period: '1Y', value: parseFloat(avg('one_year_twror').toFixed(2)) },
      { period: '3Y', value: parseFloat(avg('three_year_twror').toFixed(2)) },
      { period: 'ITD', value: parseFloat(avg('inception_twror').toFixed(2)) },
    ]
  }, [twrorData])

  // Period vol bar chart data
  const periodVolData = useMemo(() => {
    if (!periodVol) return []
    return [
      { period: 'QTD', value: periodVol.qtd_vol ?? 0 },
      { period: 'YTD', value: periodVol.ytd_vol ?? 0 },
      { period: '1Y', value: periodVol['1y_vol'] ?? 0 },
      { period: '3Y', value: periodVol['3y_vol'] ?? 0 },
      { period: 'ITD', value: periodVol.itd_vol ?? 0 },
    ]
  }, [periodVol])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="text-emerald-400 text-xl" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Risk KPI Cards */}
      {metrics && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <RiskKPI icon={Activity} label="Annualized Volatility" value={`${metrics.volatility_pct.toFixed(1)}%`} color="text-orange-400" />
          <RiskKPI icon={TrendingDown} label="Max Drawdown" value={`-${metrics.max_drawdown_pct.toFixed(1)}%`} color="text-red-400" />
          <RiskKPI icon={Shield} label="Sharpe Ratio" value={metrics.sharpe_ratio.toFixed(2)} color="text-teal-400" />
          <RiskKPI icon={BarChart3} label="Sortino Ratio" value={metrics.sortino_ratio.toFixed(2)} color="text-blue-400" />
        </div>
      )}

      {/* Max Drawdown Detail Panel */}
      {metrics && (
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-primary-foreground">
            <TrendingDown className="size-4 text-red-400" />
            Max Drawdown Analysis
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-neutral-750/50 p-4">
              <p className="text-[11px] font-medium uppercase text-secondary-foreground">Max Drawdown</p>
              <p className="mt-1 text-2xl font-bold text-red-400">-{metrics.max_drawdown_pct.toFixed(2)}%</p>
              <p className="mt-1 text-xs text-secondary-foreground">Largest peak-to-trough decline</p>
            </div>
            <div className="rounded-lg bg-neutral-750/50 p-4">
              <p className="text-[11px] font-medium uppercase text-secondary-foreground">Peak Date</p>
              <p className="mt-1 text-lg font-semibold text-primary-foreground">{metrics.max_dd_peak_date}</p>
              <p className="mt-2 text-[11px] font-medium uppercase text-secondary-foreground">Trough Date</p>
              <p className="mt-1 text-lg font-semibold text-primary-foreground">{metrics.max_dd_trough_date}</p>
            </div>
            <div className="rounded-lg bg-neutral-750/50 p-4">
              <p className="text-[11px] font-medium uppercase text-secondary-foreground">Best Month</p>
              <p className="mt-1 text-lg font-semibold text-green-400">{metrics.best_month}: +{metrics.best_month_return_pct.toFixed(2)}%</p>
              <p className="mt-2 text-[11px] font-medium uppercase text-secondary-foreground">Worst Month</p>
              <p className="mt-1 text-lg font-semibold text-red-400">{metrics.worst_month}: {metrics.worst_month_return_pct.toFixed(2)}%</p>
            </div>
          </div>
        </div>
      )}

      {/* ROW 1: 365-Day Rolling Return & Volatility — SIDE BY SIDE */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Chart 1: 365-Day Rolling Return */}
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
            365-Day Rolling Return
          </h3>
          {rollingData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={rollingData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: AXIS }} tickFormatter={(d: string) => d.slice(0, 7)} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: TEAL }} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(2)}%`, '365d Return']} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                <Area type="monotone" dataKey="return_365d" stroke={TEAL} fill="rgba(58,125,123,0.2)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[320px] items-center justify-center text-sm text-secondary-foreground">
              Need 1+ year of data
            </div>
          )}
        </div>

        {/* Chart 2: 365-Day Rolling Volatility */}
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
            365-Day Rolling Volatility
          </h3>
          {rollingData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={rollingData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: AXIS }} tickFormatter={(d: string) => d.slice(0, 7)} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: ORANGE }} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(2)}%`, '365d Volatility']} />
                <Area type="monotone" dataKey="vol_365d" stroke={ORANGE} fill="rgba(224,120,48,0.2)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[320px] items-center justify-center text-sm text-secondary-foreground">
              Need 1+ year of data
            </div>
          )}
        </div>
      </div>

      {/* ROW 2: Period Returns & Period Volatility — SIDE BY SIDE */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Chart 3: Period Returns (QTD, YTD, 1Y, 3Y, ITD) */}
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
            Period Returns (TWROR)
          </h3>
          {periodReturnData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={periodReturnData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="period" tick={{ fontSize: 12, fill: AXIS }} />
                <YAxis tick={{ fontSize: 11, fill: AXIS }} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(2)}%`, 'Return']} />
                <Bar dataKey="value" name="Return" radius={[4, 4, 0, 0]}>
                  {periodReturnData.map((entry, i) => (
                    <Cell key={i} fill={entry.value >= 0 ? TEAL : '#c44a4a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[320px] items-center justify-center text-sm text-secondary-foreground">
              No TWROR data available
            </div>
          )}
        </div>

        {/* Chart 4: Period Volatility (QTD, YTD, 1Y, 3Y, ITD) */}
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
            Period Volatility (Annualized)
          </h3>
          {periodVolData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={periodVolData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="period" tick={{ fontSize: 12, fill: AXIS }} />
                <YAxis tick={{ fontSize: 11, fill: AXIS }} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(2)}%`, 'Volatility']} />
                <Bar dataKey="value" name="Volatility" fill={ORANGE} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[320px] items-center justify-center text-sm text-secondary-foreground">
              No volatility data available
            </div>
          )}
        </div>
      </div>

      {/* Drawdown Over Time */}
      {drawdownSeries.length > 0 && (
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
            Drawdown Over Time
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={drawdownSeries} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: AXIS }} tickFormatter={(d: string) => d.slice(0, 7)} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: AXIS }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(2)}%`, 'Drawdown']} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
              <Area type="monotone" dataKey="drawdown" stroke="#c44a4a" fill="rgba(196,74,74,0.3)" strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function RiskKPI({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Shield
  label: string
  value: string
  color: string
}) {
  return (
    <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-4">
      <div className="flex items-center gap-2">
        <Icon className={`size-4 ${color}`} />
        <span className="text-[11px] font-medium uppercase text-secondary-foreground">{label}</span>
      </div>
      <div className={`mt-2 text-xl font-bold ${color}`}>{value}</div>
    </div>
  )
}
