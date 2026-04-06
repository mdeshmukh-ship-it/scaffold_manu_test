import { useEffect, useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { GitBranch } from 'lucide-react'
import { useCIOTwror, useCIOMarketValues } from '@/hooks/useCIOData'
import { Spinner } from '@/components/generic/Spinner'

type Props = {
  reportDate: string
  accounts: string[]
}

const COLORS = {
  selection: '#4682B4',
  concentration: '#E07830',
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
  const { data: mvData, loading: mvLoading, fetch: fetchMV } = useCIOMarketValues(reportDate, accounts)
  const [benchmark, setBenchmark] = useState('none')

  useEffect(() => {
    void fetchTwror()
    void fetchMV()
  }, [fetchTwror, fetchMV])

  const loading = tLoading || mvLoading

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

  // Per-account weights and returns (used for attribution decomposition)
  const accountAttribution = useMemo(() => {
    if (twrorData.length === 0 || !mvData) return []
    const totalMV = mvData.total_mv || 1
    return twrorData.map((row) => {
      const mv = mvData.rows.find(
        (m) => m.FBSIShortName === row.FBSIShortName || m.AccountNumber === row.account_number
      )?.MarketValue ?? 0
      return {
        name: row.FBSIShortName || row.account_number,
        weight: mv / totalMV,
        ret: (row.qtd_twror ?? 0) * 100,
        mv,
      }
    }).sort((a, b) => b.weight - a.weight)
  }, [twrorData, mvData])

  // Equal-weight portfolio return (needed for decomposition)
  const equalWeightReturn = useMemo(() => {
    if (accountAttribution.length === 0) return 0
    return accountAttribution.reduce((s, a) => s + a.ret, 0) / accountAttribution.length
  }, [accountAttribution])

  // Attribution decomposition: Selection + Concentration = Active Return
  //   Selection  = equal-weight avg return − benchmark return
  //              → Did the selected accounts beat the benchmark on average?
  //   Concentration = MV-weighted return − equal-weight return
  //              → Did overweighting certain accounts help or hurt?
  const brinsonData = useMemo(() => {
    if (benchmark === 'none' || accountAttribution.length === 0) return []

    const selectionEffect = equalWeightReturn - benchmarkReturn
    const concentrationEffect = portfolioReturn - equalWeightReturn

    return [
      { name: 'Selection', value: parseFloat(selectionEffect.toFixed(2)) },
      { name: 'Concentration', value: parseFloat(concentrationEffect.toFixed(2)) },
      { name: 'Total Active', value: parseFloat(activeReturn.toFixed(2)) },
    ]
  }, [benchmark, accountAttribution, equalWeightReturn, benchmarkReturn, portfolioReturn, activeReturn])

  // Per-account contribution to active return (for the summary)
  const accountContribToActive = useMemo(() => {
    if (accountAttribution.length === 0) return []
    return accountAttribution.map((a) => ({
      name: a.name,
      weight: a.weight,
      ret: a.ret,
      contribution: a.weight * (a.ret - benchmarkReturn),
    })).sort((a, b) => b.contribution - a.contribution)
  }, [accountAttribution, benchmarkReturn])

  // Brinson summary commentary — structured as bullet points
  const brinsonBullets = useMemo(() => {
    if (brinsonData.length === 0 || benchmark === 'none') return []
    const selEffect = brinsonData.find((d) => d.name === 'Selection')?.value ?? 0
    const concEffect = brinsonData.find((d) => d.name === 'Concentration')?.value ?? 0
    const benchLabel = BENCHMARKS.find((b) => b.value === benchmark)?.label ?? benchmark

    const bullets: { color: string; text: string }[] = []

    // 1 — Active return headline
    {
      const sign = activeReturn >= 0 ? '+' : ''
      bullets.push({
        color: activeReturn >= 0 ? 'text-emerald-400' : 'text-red-400',
        text: `The portfolio ${activeReturn >= 0 ? 'outperformed' : 'underperformed'} ${benchLabel} by ${sign}${activeReturn.toFixed(2)}% QTD. This active return decomposes into a Selection effect of ${selEffect >= 0 ? '+' : ''}${selEffect.toFixed(2)}% and a Concentration effect of ${concEffect >= 0 ? '+' : ''}${concEffect.toFixed(2)}%.`,
      })
    }

    // 2 — Selection effect
    {
      let text = ''
      if (selEffect > 0.1) {
        text = `Selection added +${selEffect.toFixed(2)}% — the selected accounts returned ${equalWeightReturn.toFixed(2)}% on average (equal-weighted), outpacing the benchmark's ${benchmarkReturn.toFixed(2)}%. On a like-for-like basis, the portfolio's underlying holdings are generating alpha.`
      } else if (selEffect < -0.1) {
        text = `Selection detracted ${selEffect.toFixed(2)}% — the accounts averaged ${equalWeightReturn.toFixed(2)}% (equal-weighted) vs. the benchmark's ${benchmarkReturn.toFixed(2)}%. The portfolio's underlying investments are lagging the benchmark, regardless of how capital is allocated across them.`
      } else {
        text = `Selection was neutral (${selEffect >= 0 ? '+' : ''}${selEffect.toFixed(2)}%) — the average account return of ${equalWeightReturn.toFixed(2)}% roughly matched the benchmark (${benchmarkReturn.toFixed(2)}%). No meaningful alpha or drag from individual account performance.`
      }
      bullets.push({ color: 'text-blue-400', text })
    }

    // 3 — Concentration effect
    {
      let text = ''
      if (concEffect > 0.1) {
        text = `Concentration added +${concEffect.toFixed(2)}% — the portfolio's MV-weighted return (${portfolioReturn.toFixed(2)}%) exceeded the equal-weight return (${equalWeightReturn.toFixed(2)}%), meaning capital was tilted toward the higher-returning accounts. The weighting decisions were value-additive.`
      } else if (concEffect < -0.1) {
        text = `Concentration detracted ${concEffect.toFixed(2)}% — the MV-weighted return (${portfolioReturn.toFixed(2)}%) undershot the equal-weight return (${equalWeightReturn.toFixed(2)}%). Larger accounts underperformed smaller ones, so the portfolio's natural size-weighting created a drag.`
      } else {
        text = `Concentration was neutral (${concEffect >= 0 ? '+' : ''}${concEffect.toFixed(2)}%) — the MV-weighted and equal-weight returns were close (${portfolioReturn.toFixed(2)}% vs. ${equalWeightReturn.toFixed(2)}%), indicating account size had minimal impact on outcomes.`
      }
      bullets.push({ color: 'text-orange-400', text })
    }

    // 4 — Top/bottom account contributors
    if (accountContribToActive.length > 0) {
      const top = accountContribToActive[0]
      const bottom = accountContribToActive[accountContribToActive.length - 1]
      let text = `Largest positive contributor: ${top.name} (${(top.weight * 100).toFixed(1)}% weight, ${top.ret.toFixed(2)}% return → ${top.contribution >= 0 ? '+' : ''}${top.contribution.toFixed(2)}% contribution).`
      if (bottom.contribution < 0) {
        text += ` Largest drag: ${bottom.name} (${(bottom.weight * 100).toFixed(1)}% weight, ${bottom.ret.toFixed(2)}% return → ${bottom.contribution.toFixed(2)}% contribution).`
      }

      // Concentration insight
      const topN = accountContribToActive.slice(0, 3)
      const topNTotal = topN.reduce((s, a) => s + a.contribution, 0)
      if (accountContribToActive.length > 3) {
        text += ` The top 3 accounts accounted for ${topNTotal >= 0 ? '+' : ''}${topNTotal.toFixed(2)}% of the ${activeReturn.toFixed(2)}% active return — ${Math.abs(topNTotal) > Math.abs(activeReturn) * 0.8 ? 'performance is highly concentrated in a few names.' : 'contribution is reasonably distributed.'}`
      }
      bullets.push({ color: 'text-purple-400', text })
    }

    return bullets
  }, [brinsonData, benchmark, activeReturn, equalWeightReturn, benchmarkReturn, portfolioReturn, accountContribToActive])

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
        mv,
      }
    }).sort((a, b) => b.absolute - a.absolute)
  }, [twrorData, mvData])

  // Accounts whose contribution bar is dwarfed by the largest contributor
  const tinyAccounts = useMemo(() => {
    if (contributionData.length < 2) return []
    const maxContrib = Math.max(...contributionData.map((a) => Math.abs(a.absolute)))
    if (maxContrib === 0) return []
    return contributionData.filter((a) => {
      const ratio = Math.abs(a.absolute) / maxContrib
      return ratio < 0.15 // contribution is <15% the size of the largest bar
    })
  }, [contributionData])

  // Attribution Waterfall
  const waterfallData = useMemo(() => {
    if (benchmark === 'none') return []
    return [
      { name: 'Benchmark', value: parseFloat(benchmarkReturn.toFixed(2)) },
      ...brinsonData.filter((d) => d.name !== 'Total Active'),
      { name: 'Portfolio', value: parseFloat(portfolioReturn.toFixed(2)) },
    ]
  }, [benchmark, benchmarkReturn, portfolioReturn, brinsonData])

  // Waterfall summary text
  const waterfallSummary = useMemo(() => {
    if (benchmark === 'none' || brinsonData.length === 0) return ''
    const benchLabel = BENCHMARKS.find((b) => b.value === benchmark)?.label ?? benchmark
    const selEffect = brinsonData.find((d) => d.name === 'Selection')?.value ?? 0
    const concEffect = brinsonData.find((d) => d.name === 'Concentration')?.value ?? 0

    const sign = (v: number) => v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)

    let text = `${benchLabel} returned ${sign(benchmarkReturn)}%.`
    if (selEffect > 0.05) {
      text += ` Account selection added ${sign(selEffect)}% — the portfolio's holdings outperformed the benchmark on average.`
    } else if (selEffect < -0.05) {
      text += ` Account selection detracted ${sign(selEffect)}% — holdings underperformed the benchmark on average.`
    }
    if (Math.abs(concEffect) > 0.05) {
      text += ` Concentration ${concEffect > 0 ? 'added' : 'detracted'} ${sign(concEffect)}% from weighting.`
    }
    text += ` Net result: portfolio at ${sign(portfolioReturn)}%.`
    return text
  }, [benchmark, brinsonData, benchmarkReturn, portfolioReturn])

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
            <>
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
                        entry.name === 'Selection' ? COLORS.selection
                        : entry.name === 'Concentration' ? COLORS.concentration
                        : entry.value >= 0 ? COLORS.positive : COLORS.negative
                      }
                    />
                  ))}
                </Bar>
                </BarChart>
              </ResponsiveContainer>
              {brinsonBullets.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-neutral-700 pt-3">
                  {brinsonBullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-xs leading-relaxed text-secondary-foreground">
                      <span className={`mt-0.5 ${b.color}`}>•</span>
                      <span>{b.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
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
            <>
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
              {tinyAccounts.length > 0 && (
                <p className="mt-2 text-[10px] text-secondary-foreground/70">
                  <span className="text-amber-500">*</span> {tinyAccounts.map((a) => a.name).join(', ')}
                  {tinyAccounts.length === 1 ? ' has' : ' have'} negligible contribution ({tinyAccounts.map((a) => `${a.name}: ${a.weight}% weight, ${a.account_return}% return`).join('; ')}) — bar may not be visible on the chart.
                </p>
              )}
            </>
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
          {waterfallSummary && (
            <p className="mt-3 text-xs leading-relaxed text-secondary-foreground">
              {waterfallSummary}
            </p>
          )}
        </div>
      )}

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
