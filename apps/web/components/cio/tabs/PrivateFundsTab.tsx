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
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Landmark, ChevronDown, ChevronRight } from 'lucide-react'
import {
  useCIOPrivateFundDetail,
  type PrivateFundDetail,
  type VCSummaryRow,
  type VCCommitmentRow,
  type DISummaryRow,
  type RASummaryRow,
  type RACommitmentRow,
} from '@/hooks/useCIOData'
import { Spinner } from '@/components/generic/Spinner'

type Props = {
  reportDate: string
  clientName: string
  fundTypes: string[] // Only the fund types this family has (e.g. ['VC','DI','RA'] or ['RA'])
}

const FUND_LABELS: Record<string, string> = {
  VC: 'Venture Capital',
  DI: 'Diversifying Investments',
  RA: 'Real Assets',
}

const FUND_COLORS: Record<string, string> = {
  VC: '#E07830',
  DI: '#2E8B57',
  RA: '#3498db',
}

const PIE_COLORS = [
  '#1B4D3E', '#C4B998', '#E07830', '#2D5A4A', '#0D7377',
  '#D4A853', '#5C4D7D', '#8B4513', '#2E8B57', '#CD853F',
]

const tooltipStyle = {
  backgroundColor: '#1a2234',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#e6e8ee',
}

const AXIS = '#6b7280'
const GRID = 'rgba(255,255,255,0.06)'

const fmt = (v: number | null | undefined) => {
  if (v == null) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

const fmtPct = (v: number | null | undefined) => {
  if (v == null) return 'N/A'
  return `${(v * 100).toFixed(2)}%`
}

// ---------------------------------------------------------------------------
// Sub-components for each fund type
// ---------------------------------------------------------------------------

function VCSection({ data }: { data: PrivateFundDetail }) {
  const summary = data.summary as VCSummaryRow[]
  const commitments = (data.commitments || []) as VCCommitmentRow[]
  const [showCommitments, setShowCommitments] = useState(false)

  const commitmentChart = useMemo(() => {
    if (!commitments.length) return []
    return commitments
      .filter((c) => (c.market_value || 0) > 0 || (c.cost_basis || 0) > 0)
      .slice(0, 15)
      .map((c) => ({
        name: c.investment?.slice(0, 30) || 'Unknown',
        market_value: c.market_value || 0,
        cost_basis: c.cost_basis || 0,
      }))
  }, [commitments])

  return (
    <div className="space-y-4">
      {/* Summary table */}
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-700 text-[11px] font-medium uppercase text-secondary-foreground">
              <th className="px-3 py-2">Investor</th>
              <th className="px-3 py-2">Fund Entity</th>
              <th className="px-3 py-2 text-right">Ownership %</th>
              <th className="px-3 py-2 text-right">Commitment</th>
              <th className="px-3 py-2 text-right">Unfunded</th>
              <th className="px-3 py-2 text-right">NAV</th>
              <th className="px-3 py-2 text-right">QTD Return</th>
              <th className="px-3 py-2 text-right">YTD Return</th>
              <th className="px-3 py-2 text-right">ITD Return</th>
              <th className="px-3 py-2 text-right">As Of</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((r, i) => (
              <tr key={i} className="border-b border-neutral-800 hover:bg-neutral-800/50">
                <td className="px-3 py-2 text-xs text-primary-foreground">{r.investor_name}</td>
                <td className="px-3 py-2 text-xs text-secondary-foreground">{r.fund_entity}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-blue-400">{r.ownership_pct != null ? `${(r.ownership_pct * 100).toFixed(2)}%` : '—'}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-primary-foreground">{fmt(r.commitment)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-orange-400">{fmt(r.unfunded_commitment)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-primary-foreground">{fmt(r.ending_net_balance)}</td>
                <td className={`px-3 py-2 text-right font-mono text-xs ${(r.net_ror_qtd || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtPct(r.net_ror_qtd)}</td>
                <td className={`px-3 py-2 text-right font-mono text-xs ${(r.net_ror_ytd || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtPct(r.net_ror_ytd)}</td>
                <td className={`px-3 py-2 text-right font-mono text-xs ${(r.net_ror_itd || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtPct(r.net_ror_itd)}</td>
                <td className="px-3 py-2 text-right font-mono text-[10px] text-neutral-500">{String(r.quarter_end_date).slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Funds & Directs Holdings */}
      {commitments.length > 0 && (() => {
        const funds = commitments.filter((c) => c.holding_type !== 'Direct')
        const directs = commitments.filter((c) => c.holding_type === 'Direct')
        const ownershipPct = commitments[0]?.family_ownership_pct

        const renderTable = (rows: typeof commitments, title: string, showCommitted: boolean) => {
          if (rows.length === 0) return null
          const totalMV = rows.reduce((s, c) => s + (c.market_value || 0), 0)
          const totalCost = rows.reduce((s, c) => s + (c.cost_basis || 0), 0)
          const totalMoic = totalCost > 0 ? totalMV / totalCost : null
          const totalClientMV = rows.reduce((s, c) => s + (c.client_share_mv || 0), 0)
          return (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase text-secondary-foreground">{title}</h4>
              <div className="overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-700 text-[10px] font-medium uppercase text-secondary-foreground">
                      <th className="px-3 py-2">Holding</th>
                      {showCommitted && <th className="px-3 py-2 text-right">Committed</th>}
                      <th className="px-3 py-2 text-right">{showCommitted ? 'Contributed' : 'Cost'}</th>
                      <th className="px-3 py-2 text-right">NAV</th>
                      <th className="px-3 py-2 text-right">Client Share</th>
                      <th className="px-3 py-2 text-right">Gross MOIC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c, i) => (
                      <tr key={i} className="border-b border-neutral-800 hover:bg-neutral-800/50">
                        <td className="max-w-[300px] truncate px-3 py-2 text-xs text-primary-foreground">{c.investment || '—'}</td>
                        {showCommitted && <td className="px-3 py-2 text-right font-mono text-xs text-secondary-foreground">{fmt(c.original_commitment)}</td>}
                        <td className="px-3 py-2 text-right font-mono text-xs text-secondary-foreground">{fmt(c.cost_basis)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-primary-foreground">{fmt(c.market_value)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-blue-400">{fmt(c.client_share_mv)}</td>
                        <td className={`px-3 py-2 text-right font-mono text-xs ${(c.moic ?? 0) >= 1 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {c.moic != null ? `${c.moic.toFixed(2)}x` : '—'}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-neutral-700 font-semibold">
                      <td className="px-3 py-2 text-xs text-primary-foreground">Total</td>
                      {showCommitted && <td className="px-3 py-2" />}
                      <td className="px-3 py-2 text-right font-mono text-xs text-secondary-foreground">{fmt(totalCost)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-primary-foreground">{fmt(totalMV)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-blue-400">{fmt(totalClientMV)}</td>
                      <td className={`px-3 py-2 text-right font-mono text-xs ${totalMoic != null && totalMoic >= 1 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {totalMoic != null ? `${totalMoic.toFixed(2)}x` : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )
        }

        return (
          <div className="space-y-6">
            {ownershipPct != null && ownershipPct > 0 && (
              <p className="text-xs text-blue-400">
                Client ownership: {(ownershipPct * 100).toFixed(2)}% — Client Share = Fund NAV × ownership %
              </p>
            )}
            {renderTable(funds, 'Portfolio Deployment & Marks: Funds', true)}
            {renderTable(directs, 'Portfolio Deployment & Marks: Directs', false)}
          </div>
        )
      })()}
    </div>
  )
}

function DISection({ data }: { data: PrivateFundDetail }) {
  const summary = data.summary as DISummaryRow[]

  return (
    <div className="overflow-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-700 text-[11px] font-medium uppercase text-secondary-foreground">
            <th className="px-3 py-2">Investor</th>
            <th className="px-3 py-2">Fund Entity</th>
            <th className="px-3 py-2 text-right">Ownership %</th>
            <th className="px-3 py-2 text-right">Beginning Balance</th>
            <th className="px-3 py-2 text-right">Contributions</th>
            <th className="px-3 py-2 text-right">Distributions</th>
            <th className="px-3 py-2 text-right">Ending Balance</th>
            <th className="px-3 py-2 text-right">QTD Return</th>
            <th className="px-3 py-2 text-right">YTD Return</th>
            <th className="px-3 py-2 text-right">As Of</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((r, i) => (
            <tr key={i} className="border-b border-neutral-800 hover:bg-neutral-800/50">
              <td className="px-3 py-2 text-xs text-primary-foreground">{r.investor_name}</td>
              <td className="px-3 py-2 text-xs text-secondary-foreground">{r.fund_entity}</td>
              <td className="px-3 py-2 text-right font-mono text-xs text-blue-400">{r.ownership_pct != null ? `${(r.ownership_pct * 100).toFixed(2)}%` : '—'}</td>
              <td className="px-3 py-2 text-right font-mono text-xs text-secondary-foreground">{fmt(r.beginning_balance)}</td>
              <td className="px-3 py-2 text-right font-mono text-xs text-emerald-400">{fmt(r.contributions)}</td>
              <td className="px-3 py-2 text-right font-mono text-xs text-rose-400">{fmt(r.distributions)}</td>
              <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-primary-foreground">{fmt(r.ending_net_balance)}</td>
              <td className={`px-3 py-2 text-right font-mono text-xs ${(r.net_ror_qtd || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtPct(r.net_ror_qtd)}</td>
              <td className={`px-3 py-2 text-right font-mono text-xs ${(r.net_ror_ytd || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtPct(r.net_ror_ytd)}</td>
              <td className="px-3 py-2 text-right font-mono text-[10px] text-neutral-500">{String(r.month_end_date).slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RASection({ data }: { data: PrivateFundDetail }) {
  const summary = data.summary as RASummaryRow[]
  const commitments = (data.commitments || []) as RACommitmentRow[]
  const [showCommitments, setShowCommitments] = useState(false)

  const allocationChart = useMemo(() => {
    if (!commitments.length) return []
    return commitments
      .filter((c) => (c.fair_market_value || 0) > 0)
      .slice(0, 15)
      .map((c) => ({
        name: c.investment?.slice(0, 25) || 'Unknown',
        value: c.fair_market_value || 0,
      }))
  }, [commitments])

  return (
    <div className="space-y-4">
      {/* Summary table */}
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-700 text-[11px] font-medium uppercase text-secondary-foreground">
              <th className="px-3 py-2">Partner</th>
              <th className="px-3 py-2">Fund Entity</th>
              <th className="px-3 py-2 text-right">Ownership %</th>
              <th className="px-3 py-2 text-right">Commitment</th>
              <th className="px-3 py-2 text-right">Unfunded</th>
              <th className="px-3 py-2 text-right">NAV</th>
              <th className="px-3 py-2 text-right">ROR</th>
              <th className="px-3 py-2 text-right">Net IRR</th>
              <th className="px-3 py-2 text-right">As Of</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((r, i) => (
              <tr key={i} className="border-b border-neutral-800 hover:bg-neutral-800/50">
                <td className="px-3 py-2 text-xs text-primary-foreground">{r.partner_name}</td>
                <td className="px-3 py-2 text-xs text-secondary-foreground">{r.fund_entity}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-blue-400">{r.ownership_pct != null ? `${(r.ownership_pct * 100).toFixed(2)}%` : '—'}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-primary-foreground">{fmt(r.commitment)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-orange-400">{fmt(r.unfunded_commitment)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-primary-foreground">{fmt(r.ending_balance)}</td>
                <td className={`px-3 py-2 text-right font-mono text-xs ${(r.ror || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtPct(r.ror)}</td>
                <td className={`px-3 py-2 text-right font-mono text-xs ${(r.net_irr || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtPct(r.net_irr)}</td>
                <td className="px-3 py-2 text-right font-mono text-[10px] text-neutral-500">{String(r.end_date).slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top Exposures Table */}
      {commitments.length > 0 && (() => {
        const all = commitments
          .filter((c) => (c.fair_market_value || 0) > 0 || (c.cost_basis || 0) > 0)
        if (all.length === 0) return null
        const totalFMV = all.reduce((s, c) => s + (c.fair_market_value || 0), 0)
        const totalCost = all.reduce((s, c) => s + (c.cost_basis || 0), 0)
        const totalMoic = totalCost > 0 ? totalFMV / totalCost : null
        const totalClientFMV = all.reduce((s, c) => s + (c.client_share_fmv || 0), 0)
        const ownershipPct = all[0]?.family_ownership_pct
        return (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase text-secondary-foreground">
              Top Exposures
              {ownershipPct != null && (
                <span className="ml-2 text-[10px] font-normal normal-case text-blue-400">
                  (Client ownership: {(ownershipPct * 100).toFixed(2)}%)
                </span>
              )}
            </h4>
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-700 text-[10px] font-medium uppercase text-secondary-foreground">
                    <th className="px-3 py-2">Holding</th>
                    <th className="px-3 py-2 text-right">Cost Basis</th>
                    <th className="px-3 py-2 text-right">Fund FMV</th>
                    <th className="px-3 py-2 text-right">Client Share</th>
                    <th className="px-3 py-2 text-right">Gross MOIC</th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((c, i) => {
                    const moic = (c.cost_basis || 0) > 0 ? (c.fair_market_value || 0) / c.cost_basis! : null
                    return (
                      <tr key={i} className="border-b border-neutral-800 hover:bg-neutral-800/50">
                        <td className="max-w-[300px] truncate px-3 py-2 text-xs text-primary-foreground">{c.investment || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-secondary-foreground">{fmt(c.cost_basis)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-primary-foreground">{fmt(c.fair_market_value)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-blue-400">{fmt(c.client_share_fmv)}</td>
                        <td className={`px-3 py-2 text-right font-mono text-xs ${moic != null && moic >= 1 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {moic != null ? `${moic.toFixed(2)}x` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="border-t border-neutral-700 font-semibold">
                    <td className="px-3 py-2 text-xs text-primary-foreground">Total</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-secondary-foreground">{fmt(totalCost)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-primary-foreground">{fmt(totalFMV)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-blue-400">{fmt(totalClientFMV)}</td>
                    <td className={`px-3 py-2 text-right font-mono text-xs ${totalMoic != null && totalMoic >= 1 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {totalMoic != null ? `${totalMoic.toFixed(2)}x` : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* Commitment detail */}
      {commitments.length > 0 && (
        <div>
          <button
            onClick={() => setShowCommitments((s) => !s)}
            className="flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300"
          >
            {showCommitments ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            {showCommitments ? 'Hide' : 'Show'} Investment Commitments ({commitments.length})
          </button>

          {showCommitments && (
            <div className="mt-3 space-y-4">
              {/* Pie chart */}
              {allocationChart.length > 0 && (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={allocationChart}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {allocationChart.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(v)} />
                      <Legend wrapperStyle={{ fontSize: '10px', color: '#9ca3af' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Table */}
              <div className="max-h-[400px] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-neutral-850">
                    <tr className="border-b border-neutral-700 text-[10px] font-medium uppercase text-secondary-foreground">
                      <th className="px-3 py-2">Investment</th>
                      <th className="px-3 py-2 text-right">Commitment</th>
                      <th className="px-3 py-2 text-right">Unfunded</th>
                      <th className="px-3 py-2 text-right">FMV</th>
                      <th className="px-3 py-2 text-right">Cost Basis</th>
                      <th className="px-3 py-2 text-right">Unrealized G/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commitments.map((c, i) => (
                      <tr key={i} className="border-b border-neutral-800 hover:bg-neutral-800/50">
                        <td className="max-w-[220px] truncate px-3 py-2 text-xs text-primary-foreground">{c.investment}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-secondary-foreground">{fmt(c.commitment)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-orange-400">{fmt(c.unfunded)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-primary-foreground">{fmt(c.fair_market_value)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-secondary-foreground">{fmt(c.cost_basis)}</td>
                        <td className={`px-3 py-2 text-right font-mono text-xs ${(c.unrealized_gl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {fmt(c.unrealized_gl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fund section wrapper: fetches data for a single fund type
// ---------------------------------------------------------------------------

function FundSection({ reportDate, clientName, fundType }: {
  reportDate: string
  clientName: string
  fundType: string
}) {
  const { data, loading, error, fetch } = useCIOPrivateFundDetail(reportDate, clientName, fundType)

  useEffect(() => {
    void fetch()
  }, [fetch])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6">
        <Spinner className="text-blue-400" />
        <span className="text-sm text-secondary-foreground">Loading {FUND_LABELS[fundType] || fundType}...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-700/50 bg-rose-900/30 px-4 py-3 text-sm text-rose-300">
        <strong>Error:</strong> {error}
      </div>
    )
  }

  if (!data || (data.summary as any[]).length === 0) {
    return (
      <p className="py-4 text-sm text-secondary-foreground">No data available for {FUND_LABELS[fundType] || fundType}.</p>
    )
  }

  return (
    <>
      {/* Totals cards */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {data.totals.commitment != null && (
          <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-4">
            <p className="text-[10px] font-medium uppercase text-secondary-foreground">Total Commitment</p>
            <p className="mt-1 text-lg font-bold text-primary-foreground">{fmt(data.totals.commitment)}</p>
          </div>
        )}
        <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-4">
          <p className="text-[10px] font-medium uppercase text-secondary-foreground">Total NAV</p>
          <p className="mt-1 text-lg font-bold text-primary-foreground">{fmt(data.totals.nav)}</p>
        </div>
        {data.totals.unfunded != null && (
          <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-4">
            <p className="text-[10px] font-medium uppercase text-secondary-foreground">Total Unfunded</p>
            <p className="mt-1 text-lg font-bold text-orange-400">{fmt(data.totals.unfunded)}</p>
          </div>
        )}
      </div>

      {fundType === 'VC' && <VCSection data={data} />}
      {fundType === 'DI' && <DISection data={data} />}
      {fundType === 'RA' && <RASection data={data} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// Main PrivateFundsTab
// ---------------------------------------------------------------------------

export default function PrivateFundsTab({ reportDate, clientName, fundTypes }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<string>(fundTypes[0] || '')

  // Keep active sub-tab in sync when fundTypes changes
  useEffect(() => {
    if (fundTypes.length > 0 && !fundTypes.includes(activeSubTab)) {
      setActiveSubTab(fundTypes[0])
    }
  }, [fundTypes, activeSubTab])

  if (fundTypes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-secondary-foreground">
        <Landmark className="mb-3 size-10 opacity-40" />
        <p>This family has no private fund investments.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation — only show if multiple fund types */}
      {fundTypes.length > 1 && (
        <div className="flex gap-0 border-b border-neutral-750">
          {fundTypes.map((ft) => (
            <button
              key={ft}
              onClick={() => setActiveSubTab(ft)}
              className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                activeSubTab === ft
                  ? 'border-b-2 text-primary-foreground'
                  : 'border-b-2 border-transparent text-secondary-foreground hover:text-primary-foreground'
              }`}
              style={activeSubTab === ft ? { borderColor: FUND_COLORS[ft] || '#3A7D7B', color: FUND_COLORS[ft] || undefined } : undefined}
            >
              {FUND_LABELS[ft] || ft}
            </button>
          ))}
        </div>
      )}

      {/* Title if only one fund type */}
      {fundTypes.length === 1 && (
        <h2 className="text-lg font-semibold text-primary-foreground">
          {FUND_LABELS[fundTypes[0]] || fundTypes[0]}
        </h2>
      )}

      {/* Active fund section */}
      <div className="rounded-xl border border-neutral-750 bg-neutral-850 p-5">
        <FundSection
          reportDate={reportDate}
          clientName={clientName}
          fundType={activeSubTab}
        />
      </div>
    </div>
  )
}
