import { useEffect, useMemo } from 'react'
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
  ReferenceLine,
} from 'recharts'
import { Droplets } from 'lucide-react'
import {
  useCIORaFundHoldings,
  useCIOCapitalCallsTimeline,
  useCIOAssetClass,
  useCIOMarketValues,
  type RaFundHolding,
  type CapitalCallRow,
} from '@/hooks/useCIOData'
import { Spinner } from '@/components/generic/Spinner'

type Props = {
  reportDate: string
  accounts: string[]
  clientName: string
}

const FUND_COLORS: Record<string, string> = {
  RA: '#3498db',
  VC: '#e67e22',
  DI: '#2ecc71',
  Other: '#9b59b6',
}

// Distinct colors for calls (blue/green tones) vs distributions (red/warm tones)
const CALL_COLORS: Record<string, string> = {
  VC: '#3498db',
  DI: '#2ecc71',
  RA: '#1abc9c',
}
const DIST_COLORS: Record<string, string> = {
  VC: '#e74c3c',
  DI: '#e67e22',
  RA: '#f39c12',
}

const tooltipStyle = {
  backgroundColor: '#1a2234',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#e6e8ee',
}

const AXIS = '#6b7280'
const GRID = 'rgba(255,255,255,0.06)'

const formatCurrency = (v: number) => {
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

function classifyFundType(fundName: string): string {
  const upper = fundName.toUpperCase()
  if (upper.includes('RA') || upper.includes('REAL ASSET')) return 'RA'
  if (upper.includes('VC') || upper.includes('VENTURE')) return 'VC'
  if (upper.includes('DI') || upper.includes('DIRECT')) return 'DI'
  return 'Other'
}

export default function LiquidityTab({ reportDate, accounts, clientName }: Props) {
  const { data: raHoldings, loading: raLoading, fetch: fetchRa } = useCIORaFundHoldings(reportDate, clientName)
  const { data: capitalCalls, loading: ccLoading, fetch: fetchCC } = useCIOCapitalCallsTimeline(reportDate, clientName)
  const { data: assetClassData, loading: acLoading, fetch: fetchAC } = useCIOAssetClass(reportDate, accounts)
  const { data: mvData, loading: mvLoading, fetch: fetchMV } = useCIOMarketValues(reportDate, accounts)

  useEffect(() => {
    void fetchRa()
    void fetchCC()
    void fetchAC()
    void fetchMV()
  }, [fetchRa, fetchCC, fetchAC, fetchMV])

  const loading = raLoading || ccLoading || acLoading || mvLoading

  // Group holdings by fund for table
  const holdingsByFund = useMemo(() => {
    if (raHoldings.length === 0) return []
    return raHoldings.map((h) => ({
      fund_name: h.fund_name,
      asset_class: h.asset_class,
      investment_type: h.investment_type,
      valuation: h.valuation,
      called_capital: h.total_called_capital,
      unfunded: Math.max(0, h.total_called_capital - h.valuation),
      fund_type: classifyFundType(h.fund_name),
    }))
  }, [raHoldings])

  // Commitment pacing by fund type (RA, VC, etc.)
  const commitmentByType = useMemo(() => {
    const byType: Record<string, { valuation: number; called: number; unfunded: number }> = {}
    for (const h of holdingsByFund) {
      const t = h.fund_type
      if (!byType[t]) byType[t] = { valuation: 0, called: 0, unfunded: 0 }
      byType[t].valuation += h.valuation
      byType[t].called += h.called_capital
      byType[t].unfunded += h.unfunded
    }
    return Object.entries(byType).map(([type, data]) => ({
      fund_type: type,
      valuation: Math.round(data.valuation),
      called_capital: Math.round(data.called),
      unfunded: Math.round(data.unfunded),
    }))
  }, [holdingsByFund])

  // Capital calls & distributions by fund type and month (calls positive, distributions negative)
  const callsTimeline = useMemo(() => {
    if (capitalCalls.length === 0) return { data: [] as Record<string, any>[], callKeys: [] as string[], distKeys: [] as string[] }
    const fundTypes = new Set<string>()
    const byMonth: Record<string, Record<string, { calls: number; dist: number }>> = {}
    for (const row of capitalCalls) {
      const ft = row.fund_name // already 'VC', 'DI', or 'RA' from the backend
      fundTypes.add(ft)
      if (!byMonth[row.month]) byMonth[row.month] = {}
      if (!byMonth[row.month][ft]) byMonth[row.month][ft] = { calls: 0, dist: 0 }
      byMonth[row.month][ft].calls += row.capital_called
      byMonth[row.month][ft].dist += row.distributions
    }
    const fts = [...fundTypes].sort()
    const data = Object.entries(byMonth)
      .map(([month, funds]) => {
        const row: Record<string, any> = { month }
        for (const ft of fts) {
          row[`${ft} Calls`] = Math.round(funds[ft]?.calls ?? 0)
          row[`${ft} Dist.`] = -Math.round(funds[ft]?.dist ?? 0) // negative below axis
        }
        return row
      })
      .sort((a, b) => (a.month as string).localeCompare(b.month as string))
    return {
      data,
      callKeys: fts.map((ft) => `${ft} Calls`),
      distKeys: fts.filter((ft) => data.some((d) => d[`${ft} Dist.`] < 0)).map((ft) => `${ft} Dist.`),
    }
  }, [capitalCalls])

  // Totals for explanation
  const totalValuation = holdingsByFund.reduce((s, h) => s + h.valuation, 0)
  const totalCalled = holdingsByFund.reduce((s, h) => s + h.called_capital, 0)
  const totalUnfunded = holdingsByFund.reduce((s, h) => s + h.unfunded, 0)

  // Liquidity waterfall: classify by liquidity horizon
  const liquidityWaterfall = useMemo(() => {
    const buckets: { horizon: string; value: number; color: string }[] = []
    // Liquid assets from asset class breakdown
    const cashMV = assetClassData.find((a) => a.asset_class === 'Cash')?.market_value ?? 0
    const equityMV = assetClassData.find((a) => a.asset_class === 'Equity')?.market_value ?? 0
    const fimV = assetClassData.find((a) => a.asset_class === 'Fixed Income')?.market_value ?? 0
    const otherLiquid = assetClassData
      .filter((a) => !['Cash', 'Equity', 'Fixed Income', 'Venture Capital'].includes(a.asset_class))
      .reduce((s, a) => s + a.market_value, 0)

    // Private fund valuations by type
    const vcVal = holdingsByFund.filter((h) => h.fund_type === 'VC').reduce((s, h) => s + h.valuation, 0)
    const diVal = holdingsByFund.filter((h) => h.fund_type === 'DI').reduce((s, h) => s + h.valuation, 0)
    const raVal = holdingsByFund.filter((h) => h.fund_type === 'RA').reduce((s, h) => s + h.valuation, 0)
    const otherPrivate = holdingsByFund.filter((h) => h.fund_type === 'Other').reduce((s, h) => s + h.valuation, 0)

    if (cashMV > 0) buckets.push({ horizon: '1 Day', value: cashMV, color: '#2ecc71' })
    if (equityMV > 0) buckets.push({ horizon: '1 Week', value: equityMV, color: '#3498db' })
    if (fimV > 0) buckets.push({ horizon: '1 Month', value: fimV, color: '#1abc9c' })
    if (otherLiquid > 0) buckets.push({ horizon: '1 Month', value: otherLiquid, color: '#1abc9c' })
    const quarterlyTotal = diVal
    const yearlyTotal = vcVal + raVal + otherPrivate
    if (quarterlyTotal > 0) buckets.push({ horizon: 'Quarterly', value: quarterlyTotal, color: '#e67e22' })
    if (yearlyTotal > 0) buckets.push({ horizon: 'Yearly+', value: yearlyTotal, color: '#e74c3c' })

    // Merge duplicate horizons (e.g., two "1 Month" entries)
    const merged: Record<string, { value: number; color: string }> = {}
    for (const b of buckets) {
      if (merged[b.horizon]) {
        merged[b.horizon].value += b.value
      } else {
        merged[b.horizon] = { value: b.value, color: b.color }
      }
    }
    return Object.entries(merged).map(([horizon, data]) => ({ horizon, ...data }))
  }, [assetClassData, holdingsByFund])

  const totalPortfolioMV = (mvData?.total_mv ?? 0) + totalValuation

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="text-emerald-400 text-xl" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Explanation */}
      <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
        <div className="flex items-center gap-2">
          <Droplets className="size-5 text-teal-400" />
          <h2 className="text-sm font-semibold text-primary-foreground">
            Liquidity & Private Assets
          </h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-secondary-foreground">
          This view shows private asset holdings, capital calls, and distributions
          from BigQuery data.
          {totalValuation > 0 && (
            <>
              {' '}Total current valuation:{' '}
              <span className="font-semibold text-teal-400">{formatCurrency(totalValuation)}</span>,
              total called capital:{' '}
              <span className="font-semibold text-blue-400">{formatCurrency(totalCalled)}</span>,
              unfunded commitments:{' '}
              <span className="font-semibold text-orange-400">{formatCurrency(totalUnfunded)}</span>.
            </>
          )}
        </p>
      </div>

      {/* Liquidity Waterfall */}
      {liquidityWaterfall.length > 0 && (
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
            Liquidity Waterfall
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={liquidityWaterfall} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="horizon" tick={{ fontSize: 12, fill: AXIS }} />
              <YAxis tick={{ fontSize: 11, fill: AXIS }} tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="value" name="Market Value" radius={[4, 4, 0, 0]}>
                {liquidityWaterfall.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-[10px] leading-relaxed text-secondary-foreground/70">
            Liquidity horizons: <span style={{ color: '#2ecc71' }}>1 Day</span> = cash & money market;{' '}
            <span style={{ color: '#3498db' }}>1 Week</span> = public equities (T+2);{' '}
            <span style={{ color: '#1abc9c' }}>1 Month</span> = fixed income & other liquid;{' '}
            <span style={{ color: '#e67e22' }}>Quarterly</span> = DI funds;{' '}
            <span style={{ color: '#e74c3c' }}>Yearly+</span> = VC, RA & other illiquid.
          </p>
        </div>
      )}

      {/* Fund Holdings Table */}
      <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
          Private Asset Holdings by Fund
        </h3>
        {holdingsByFund.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-700 text-xs uppercase text-secondary-foreground">
                  <th className="px-3 py-2">Fund</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Asset Class</th>
                  <th className="px-3 py-2 text-right">Valuation</th>
                  <th className="px-3 py-2 text-right">Called Capital</th>
                  <th className="px-3 py-2 text-right">Unfunded</th>
                </tr>
              </thead>
              <tbody>
                {holdingsByFund.map((row, i) => (
                  <tr key={i} className="border-b border-neutral-750/50 hover:bg-neutral-750/30 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-primary-foreground">{row.fund_name}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className="rounded px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: FUND_COLORS[row.fund_type] ?? '#666' }}
                      >
                        {row.fund_type}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-secondary-foreground">{row.asset_class || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-primary-foreground">{formatCurrency(row.valuation)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-secondary-foreground">{formatCurrency(row.called_capital)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-orange-400">{formatCurrency(row.unfunded)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-secondary-foreground">
            No private asset holdings found for this report date.
          </p>
        )}
      </div>

      {/* Commitment Pacing by Fund Type (RA, VC, etc.) */}
      <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
          Commitment Pacing by Fund Type
        </h3>
        {commitmentByType.length > 0 ? (
          <>
            {/* Custom legend — guaranteed order */}
            <div className="mb-2 flex items-center justify-center gap-5 text-[11px] text-secondary-foreground">
              <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: '#2ecc71' }} /> Current Valuation</span>
              <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: '#3498db' }} /> Called Capital</span>
              <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: '#e67e22' }} /> Unfunded</span>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={commitmentByType} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="fund_type" tick={{ fontSize: 12, fill: AXIS }} />
                <YAxis tick={{ fontSize: 11, fill: AXIS }} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="valuation" name="Current Valuation" fill="#2ecc71" radius={[3, 3, 0, 0]} />
                <Bar dataKey="called_capital" name="Called Capital" fill="#3498db" radius={[3, 3, 0, 0]} />
                <Bar dataKey="unfunded" name="Unfunded" fill="#e67e22" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        ) : (
          <div className="flex h-[320px] items-center justify-center text-sm text-secondary-foreground">
            No commitment data
          </div>
        )}
      </div>

      {/* Capital Calls & Distributions Timeline */}
      <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
          Capital Calls & Distributions Timeline
        </h3>
        <p className="mb-3 text-xs text-secondary-foreground">
          Full historical capital calls and distributions from SSC fund registers (VC, DI, RA).
          Calls shown above the axis, distributions below.
        </p>
        {callsTimeline.data.length > 0 ? (
          <>
            {/* Custom legend */}
            <div className="mb-2 flex flex-wrap items-center justify-center gap-4 text-[11px] text-secondary-foreground">
              {callsTimeline.callKeys.map((k) => {
                const ft = k.replace(' Calls', '')
                return (
                  <span key={k} className="flex items-center gap-1.5">
                    <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: CALL_COLORS[ft] ?? '#666' }} />
                    {k}
                  </span>
                )
              })}
              {callsTimeline.distKeys.map((k) => {
                const ft = k.replace(' Dist.', '')
                return (
                  <span key={k} className="flex items-center gap-1.5">
                    <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: DIST_COLORS[ft] ?? '#666' }} />
                    {k}
                  </span>
                )
              })}
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={callsTimeline.data} margin={{ top: 10, right: 30, left: 20, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: AXIS }} angle={-45} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11, fill: AXIS }} tickFormatter={(v) => formatCurrency(Math.abs(v))} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number, name: string) => [formatCurrency(Math.abs(v)), name]}
                />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                {/* Calls stacked above axis */}
                {callsTimeline.callKeys.map((k) => {
                  const ft = k.replace(' Calls', '')
                  return (
                    <Bar key={k} dataKey={k} stackId="calls" fill={CALL_COLORS[ft] ?? '#666'} radius={[2, 2, 0, 0]} />
                  )
                })}
                {/* Distributions stacked below axis */}
                {callsTimeline.distKeys.map((k) => {
                  const ft = k.replace(' Dist.', '')
                  return (
                    <Bar key={k} dataKey={k} stackId="dist" fill={DIST_COLORS[ft] ?? '#666'} radius={[0, 0, 2, 2]} />
                  )
                })}
              </BarChart>
            </ResponsiveContainer>
          </>
        ) : (
          <div className="flex h-[350px] items-center justify-center text-sm text-secondary-foreground">
            No capital call/distribution history found
          </div>
        )}
      </div>
    </div>
  )
}
