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
import { Shield, TrendingDown, Activity, BarChart3, FileText } from 'lucide-react'
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

      {/* Risk Analysis Summary */}
      {metrics && (
        <RiskAnalysis
          volatility={metrics.volatility_pct}
          maxDrawdown={metrics.max_drawdown_pct}
          sharpe={metrics.sharpe_ratio}
          sortino={metrics.sortino_ratio}
          peakDate={metrics.max_dd_peak_date}
          troughDate={metrics.max_dd_trough_date}
          bestMonth={metrics.best_month}
          bestMonthReturn={metrics.best_month_return_pct}
          worstMonth={metrics.worst_month}
          worstMonthReturn={metrics.worst_month_return_pct}
          itdReturn={metrics.itd_return_pct}
          periodReturns={periodReturnData}
          periodVol={periodVolData}
          rollingData={rollingData}
        />
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

function RiskAnalysis({
  volatility,
  maxDrawdown,
  sharpe,
  sortino,
  peakDate,
  troughDate,
  bestMonth,
  bestMonthReturn,
  worstMonth,
  worstMonthReturn,
  itdReturn,
  periodReturns,
  periodVol,
  rollingData,
}: {
  volatility: number
  maxDrawdown: number
  sharpe: number
  sortino: number
  peakDate: string
  troughDate: string
  bestMonth: string
  bestMonthReturn: number
  worstMonth: string
  worstMonthReturn: number
  itdReturn: number
  periodReturns: { period: string; value: number }[]
  periodVol: { period: string; value: number }[]
  rollingData: { date: string; return_365d: number; vol_365d: number }[]
}) {
  // ── Derived metrics ──────────────────────────────────────────────
  const pQtd = periodReturns.find((p) => p.period === 'QTD')?.value
  const pYtd = periodReturns.find((p) => p.period === 'YTD')?.value
  const p1y  = periodReturns.find((p) => p.period === '1Y')?.value
  const pItd = periodReturns.find((p) => p.period === 'ITD')?.value

  const pvQtd = periodVol.find((p) => p.period === 'QTD')?.value
  const pvYtd = periodVol.find((p) => p.period === 'YTD')?.value
  const pv1y  = periodVol.find((p) => p.period === '1Y')?.value
  const pvItd = periodVol.find((p) => p.period === 'ITD')?.value

  const recentRolling = rollingData.length > 0 ? rollingData[rollingData.length - 1] : null
  const peakRollingVol = rollingData.length > 0 ? Math.max(...rollingData.map((d) => d.vol_365d)) : 0
  const troughRollingVol = rollingData.length > 0 ? Math.min(...rollingData.map((d) => d.vol_365d)) : 0
  const peakRollingReturn = rollingData.length > 0 ? Math.max(...rollingData.map((d) => d.return_365d)) : 0
  const recentVol = recentRolling?.vol_365d ?? 0
  const recentReturn = recentRolling?.return_365d ?? 0

  // Tail-risk asymmetry: Sortino >> Sharpe means downside is tighter than upside
  const tailAsymmetry = sharpe > 0 ? sortino / sharpe : 0

  // Monthly return dispersion
  const monthlySpread = bestMonthReturn - worstMonthReturn

  // Drawdown severity relative to vol (>2× vol is outsized)
  const ddToVol = volatility > 0 ? maxDrawdown / volatility : 0

  // Drawdown duration in months (approximate)
  const ddStart = new Date(peakDate)
  const ddEnd = new Date(troughDate)
  const ddMonths = Math.max(1, Math.round((ddEnd.getTime() - ddStart.getTime()) / (30.44 * 24 * 60 * 60 * 1000)))

  // Vol regime: is current vol in the bottom or top quartile of its rolling range?
  const volRange = peakRollingVol - troughRollingVol
  const volPercentile = volRange > 0 ? (recentVol - troughRollingVol) / volRange : 0.5

  // ── Commentary ───────────────────────────────────────────────────
  const bullets: { color: string; title: string; body: string }[] = []

  // 1 ─ Volatility
  {
    const label = volatility > 25 ? 'Elevated' : volatility > 15 ? 'Moderate' : volatility > 8 ? 'Low' : 'Very low'
    let body = ''
    if (volatility <= 8) {
      body = `At ${volatility.toFixed(1)}% annualized, the portfolio exhibits minimal daily variation, consistent with a conservative, bond- or cash-heavy allocation.`
    } else if (volatility <= 15) {
      body = `At ${volatility.toFixed(1)}% annualized, the portfolio sits within a normal range for a diversified, balanced allocation — risk is well-contained relative to typical multi-asset portfolios.`
    } else if (volatility <= 25) {
      body = `At ${volatility.toFixed(1)}% annualized, the portfolio carries risk in line with an equity-tilted allocation. This level is typical for growth-oriented portfolios and suggests moderate concentration.`
    } else {
      body = `At ${volatility.toFixed(1)}% annualized, the portfolio runs above-average risk, likely reflecting concentrated positions, illiquid private holdings, or a smaller number of high-conviction bets.`
    }
    // Vol regime trend
    if (pvQtd != null && pvItd != null && pvItd > 0) {
      const ratio = pvQtd / pvItd
      if (ratio < 0.6) {
        body += ` Notably, QTD vol (${pvQtd.toFixed(1)}%) is running well below the ITD average (${pvItd.toFixed(1)}%), pointing to a quieter risk regime — the portfolio has de-risked or markets have compressed.`
      } else if (ratio > 1.4) {
        body += ` QTD vol (${pvQtd.toFixed(1)}%) has expanded meaningfully above the ITD average (${pvItd.toFixed(1)}%), signaling an uptick in near-term risk — worth monitoring whether this is transient or structural.`
      } else {
        body += ` QTD vol (${pvQtd.toFixed(1)}%) is tracking near its ITD average (${pvItd.toFixed(1)}%), suggesting a stable risk profile.`
      }
    }
    bullets.push({ color: 'text-orange-400', title: `${label} volatility`, body })
  }

  // 2 ─ Risk-adjusted returns (Sharpe vs Sortino)
  {
    let body = `Sharpe of ${sharpe.toFixed(2)} and Sortino of ${sortino.toFixed(2)}`
    if (sharpe >= 1.0) {
      body += ' — the portfolio is earning a meaningful premium per unit of risk taken.'
    } else if (sharpe >= 0.5) {
      body += ' — adequate compensation for risk, though room exists to improve efficiency.'
    } else if (sharpe >= 0) {
      body += ' — the portfolio is generating positive but thin risk-adjusted returns; the risk budget may not be optimally deployed.'
    } else {
      body += ' — negative risk-adjusted returns indicate the portfolio is destroying value relative to a risk-free alternative.'
    }
    // Tail asymmetry insight
    if (tailAsymmetry > 1.5 && sharpe > 0) {
      body += ` The Sortino significantly exceeds the Sharpe (${tailAsymmetry.toFixed(1)}× ratio), which is a positive signal: downside deviation is well-contained relative to overall vol — the portfolio captures more upside than downside.`
    } else if (tailAsymmetry < 0.8 && tailAsymmetry > 0) {
      body += ` The Sortino trailing the Sharpe (${tailAsymmetry.toFixed(1)}× ratio) is a caution flag — downside moves are proportionally larger than upside, suggesting negatively skewed returns.`
    }
    bullets.push({
      color: 'text-teal-400',
      title: sharpe >= 1 ? 'Strong risk-adjusted returns' : sharpe >= 0.5 ? 'Adequate risk-adjusted returns' : sharpe >= 0 ? 'Thin risk-adjusted returns' : 'Negative risk-adjusted returns',
      body,
    })
  }

  // 3 ─ Drawdown
  {
    const ddLabel = maxDrawdown > 20 ? 'Deep' : maxDrawdown > 10 ? 'Moderate' : maxDrawdown > 3 ? 'Contained' : 'Minimal'
    let body = `The largest peak-to-trough decline was -${maxDrawdown.toFixed(1)}%, occurring over ~${ddMonths} month${ddMonths > 1 ? 's' : ''} (${peakDate.slice(0, 10)} → ${troughDate.slice(0, 10)}).`
    if (ddToVol > 2.5) {
      body += ` At ${ddToVol.toFixed(1)}× the annualized vol, this drawdown was outsized relative to the portfolio's normal risk profile — suggesting a tail event or a correlated sell-off rather than typical market noise.`
    } else if (ddToVol > 1.5) {
      body += ` At ${ddToVol.toFixed(1)}× the annualized vol, the drawdown was proportionate to the risk being taken — painful but within the expected range for this volatility level.`
    } else {
      body += ` At ${ddToVol.toFixed(1)}× the annualized vol, the drawdown was shallow relative to risk, reflecting good downside protection.`
    }
    bullets.push({ color: 'text-red-400', title: `${ddLabel} drawdown (-${maxDrawdown.toFixed(1)}%)`, body })
  }

  // 4 ─ Monthly return dispersion
  {
    let body = `Best month: ${bestMonth} (${bestMonthReturn >= 0 ? '+' : ''}${bestMonthReturn.toFixed(2)}%). Worst month: ${worstMonth} (${worstMonthReturn.toFixed(2)}%).`
    body += ` The ${monthlySpread.toFixed(1)}pp spread between the best and worst months`
    if (monthlySpread > 20) {
      body += ' reveals fat tails in the return distribution — a small number of extreme months are driving a disproportionate share of outcomes. Position sizing and rebalancing discipline are critical in this regime.'
    } else if (monthlySpread > 10) {
      body += ' indicates meaningful dispersion. Returns are not smooth, and the portfolio experiences occasional outsized swings in both directions.'
    } else if (monthlySpread > 4) {
      body += ' is within a normal range for a diversified portfolio. Monthly outcomes are reasonably clustered around the mean.'
    } else {
      body += ' is tight, consistent with low-volatility, steady-return characteristics.'
    }
    bullets.push({ color: 'text-purple-400', title: 'Return dispersion', body })
  }

  // 5 ─ Rolling regime analysis
  if (rollingData.length > 0) {
    let body = ''
    const volCompression = peakRollingVol > 0 ? (1 - recentVol / peakRollingVol) * 100 : 0
    const returnFromPeak = peakRollingReturn > 0 ? (recentReturn / peakRollingReturn) * 100 : 0

    if (volCompression > 50) {
      body = `Rolling 365-day vol has compressed ${volCompression.toFixed(0)}% from its peak (${peakRollingVol.toFixed(0)}% → ${recentVol.toFixed(0)}%), confirming a decisive regime shift toward lower risk.`
      if (recentReturn > 0) {
        body += ` Meanwhile, the trailing return remains positive at ${recentReturn.toFixed(0)}% — the portfolio is generating returns in a calmer environment, which is the ideal setup.`
      } else {
        body += ` However, trailing returns have turned negative (${recentReturn.toFixed(0)}%), suggesting the low-vol regime may also be a low-return one — the portfolio may benefit from selectively adding risk.`
      }
    } else if (volPercentile > 0.75) {
      body = `Rolling vol is in the upper quartile of its historical range (${recentVol.toFixed(0)}% vs. peak ${peakRollingVol.toFixed(0)}%), indicating a heightened risk environment. `
      body += recentReturn > 0
        ? `The portfolio is still generating positive trailing returns (${recentReturn.toFixed(0)}%), but the elevated vol warrants vigilance.`
        : `With trailing returns at ${recentReturn.toFixed(0)}%, the risk-reward has deteriorated — consider whether the current positioning is appropriate.`
    } else {
      body = `Rolling vol (${recentVol.toFixed(0)}%) and return (${recentReturn.toFixed(0)}%) are both within their mid-range — no extreme regime signals. The portfolio is operating in a steady-state environment.`
    }
    bullets.push({ color: 'text-emerald-400', title: 'Rolling regime analysis', body })
  }

  // 6 ─ Period return vs volatility synthesis
  if (periodReturns.length > 0 && periodVol.length > 0) {
    let body = ''
    // Compute information ratios across periods
    const periods = ['QTD', 'YTD', '1Y', 'ITD'] as const
    const periodPairs = periods
      .map((p) => {
        const ret = periodReturns.find((r) => r.period === p)?.value
        const vol = periodVol.find((v) => v.period === p)?.value
        return ret != null && vol != null && vol > 0 ? { period: p, ret, vol, ratio: ret / vol } : null
      })
      .filter(Boolean) as { period: string; ret: number; vol: number; ratio: number }[]

    if (periodPairs.length >= 2) {
      const shortTerm = periodPairs.find((p) => p.period === 'QTD') || periodPairs[0]
      const longTerm = periodPairs.find((p) => p.period === 'ITD') || periodPairs[periodPairs.length - 1]

      const improving = shortTerm.ratio > longTerm.ratio
      body = `Return-per-unit-risk across periods: ${periodPairs.map((p) => `${p.period} ${p.ratio.toFixed(2)}`).join(', ')}.`
      if (improving) {
        body += ` The improving short-term ratio (${shortTerm.period}: ${shortTerm.ratio.toFixed(2)} vs. ${longTerm.period}: ${longTerm.ratio.toFixed(2)}) suggests the portfolio's risk efficiency is trending in the right direction — recent performance is delivering more return per unit of risk.`
      } else if (shortTerm.ratio < 0 && longTerm.ratio > 0) {
        body += ` Short-term risk efficiency has turned negative (${shortTerm.period}: ${shortTerm.ratio.toFixed(2)}) while long-term remains positive (${longTerm.period}: ${longTerm.ratio.toFixed(2)}). This divergence is worth watching — if it persists, the risk budget may need reallocation.`
      } else {
        body += ` Risk efficiency has declined from ${longTerm.period} (${longTerm.ratio.toFixed(2)}) to ${shortTerm.period} (${shortTerm.ratio.toFixed(2)}). The portfolio is absorbing more vol per unit of return in the near term.`
      }
    }
    if (body) {
      bullets.push({ color: 'text-blue-400', title: 'Risk efficiency across periods', body })
    }
  }

  return (
    <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary-foreground">
        <FileText className="size-4 text-teal-400" />
        Risk Analysis
      </h3>
      <ul className="space-y-2.5 text-sm leading-relaxed text-secondary-foreground">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className={`mt-1 ${b.color}`}>•</span>
            <span>
              <strong className="text-primary-foreground">{b.title}</strong>
              {' — '}{b.body}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
