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
} from 'recharts'
import { Droplets } from 'lucide-react'
import {
  useCIORaFundHoldings,
  useCIOCapitalCallsTimeline,
  type RaFundHolding,
  type CapitalCallRow,
} from '@/hooks/useCIOData'
import { Spinner } from '@/components/generic/Spinner'

type Props = {
  reportDate: string
  accounts: string[]
}

const FUND_COLORS: Record<string, string> = {
  RA: '#3498db',
  VC: '#e67e22',
  DI: '#2ecc71',
  Other: '#9b59b6',
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

export default function LiquidityTab({ reportDate }: Props) {
  const { data: raHoldings, loading: raLoading, fetch: fetchRa } = useCIORaFundHoldings(reportDate)
  const { data: capitalCalls, loading: ccLoading, fetch: fetchCC } = useCIOCapitalCallsTimeline(reportDate)

  useEffect(() => {
    void fetchRa()
    void fetchCC()
  }, [fetchRa, fetchCC])

  const loading = raLoading || ccLoading

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

  // Capital calls & distributions by fund and month
  const callsByFundAndMonth = useMemo(() => {
    if (capitalCalls.length === 0) return []
    // Group by month, split by fund type
    const byMonth: Record<string, Record<string, { calls: number; dist: number }>> = {}
    for (const row of capitalCalls) {
      const month = row.month
      const fundType = classifyFundType(row.fund_name)
      if (!byMonth[month]) byMonth[month] = {}
      if (!byMonth[month][fundType]) byMonth[month][fundType] = { calls: 0, dist: 0 }
      byMonth[month][fundType].calls += row.capital_called
      byMonth[month][fundType].dist += row.distributions
    }
    const fundTypes = [...new Set(capitalCalls.map((r) => classifyFundType(r.fund_name)))]
    return Object.entries(byMonth)
      .map(([month, funds]) => {
        const row: Record<string, any> = { month }
        for (const ft of fundTypes) {
          row[`${ft}_calls`] = Math.round(funds[ft]?.calls ?? 0)
          row[`${ft}_dist`] = Math.round(funds[ft]?.dist ?? 0)
        }
        return row
      })
      .sort((a, b) => (a.month as string).localeCompare(b.month as string))
  }, [capitalCalls])

  const fundTypes = useMemo(() => {
    return [...new Set(capitalCalls.map((r) => classifyFundType(r.fund_name)))]
  }, [capitalCalls])

  // Totals for explanation
  const totalValuation = holdingsByFund.reduce((s, h) => s + h.valuation, 0)
  const totalCalled = holdingsByFund.reduce((s, h) => s + h.called_capital, 0)
  const totalUnfunded = holdingsByFund.reduce((s, h) => s + h.unfunded, 0)

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
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={commitmentByType} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="fund_type" tick={{ fontSize: 12, fill: AXIS }} />
              <YAxis tick={{ fontSize: 11, fill: AXIS }} tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
              <Legend wrapperStyle={{ fontSize: '11px', color: '#9ea3ad' }} />
              <Bar dataKey="valuation" name="Current Valuation" fill="#2ecc71" radius={[3, 3, 0, 0]} />
              <Bar dataKey="called_capital" name="Called Capital" fill="#3498db" radius={[3, 3, 0, 0]} />
              <Bar dataKey="unfunded" name="Unfunded" fill="#e67e22" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[320px] items-center justify-center text-sm text-secondary-foreground">
            No commitment data
          </div>
        )}
      </div>

      {/* Capital Calls & Distributions Timeline (by fund type) */}
      <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
          Capital Calls & Distributions Timeline
        </h3>
        <p className="mb-3 text-xs text-secondary-foreground">
          Actual capital calls and distributions pulled from BigQuery{' '}
          <code className="rounded bg-neutral-700 px-1 py-0.5 text-[10px]">
            private_asset_capital_calls
          </code>{' '}
          table, grouped by fund type and month. No forecasts — this is historical data only.
        </p>
        {callsByFundAndMonth.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={callsByFundAndMonth} margin={{ top: 10, right: 30, left: 20, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="month" tick={{ fontSize: 9, fill: AXIS }} angle={-45} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11, fill: AXIS }} tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
              <Legend wrapperStyle={{ fontSize: '11px', color: '#9ea3ad' }} />
              {fundTypes.map((ft) => (
                <Bar
                  key={`${ft}_calls`}
                  dataKey={`${ft}_calls`}
                  name={`${ft} Calls`}
                  fill={FUND_COLORS[ft] ?? '#666'}
                  radius={[2, 2, 0, 0]}
                  stackId="calls"
                />
              ))}
              {fundTypes.map((ft) => (
                <Bar
                  key={`${ft}_dist`}
                  dataKey={`${ft}_dist`}
                  name={`${ft} Dist.`}
                  fill={FUND_COLORS[ft] ?? '#666'}
                  radius={[2, 2, 0, 0]}
                  stackId="dist"
                  opacity={0.5}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[350px] items-center justify-center text-sm text-secondary-foreground">
            No capital call/distribution history found
          </div>
        )}
      </div>
    </div>
  )
}
