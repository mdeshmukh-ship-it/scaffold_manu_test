import { useMemo } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'
import { DollarSign, TrendingUp, Users, Briefcase } from 'lucide-react'
import type { AccountRow, AccountSummary, AccountSummaryFund, AssetClassRow } from '@/hooks/useCIOData'

type Props = {
  reportDate: string
  accounts: string[]
  mvData: { rows: AccountRow[]; total_mv: number; count: number } | null
  loading: boolean
  onRun: () => void
  accountSummary: AccountSummary | null
  accountSummaryFunds: AccountSummaryFund[]
  accountSummaryYtd: AccountSummary | null
  accountSummaryYtdFunds: AccountSummaryFund[]
  accountSummaryLoading: boolean
  assetClassData: AssetClassRow[]
  assetClassLoading: boolean
}

const COLORS = [
  '#1B4D3E', '#C4B998', '#E07830', '#2D5A4A', '#0D7377',
  '#D4A853', '#5C4D7D', '#8B4513', '#2E8B57', '#CD853F',
  '#4682B4', '#9370DB',
]

const formatCurrency = (v: number) => {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

const ASSET_CLASS_COLORS: Record<string, string> = {
  Cash: '#0B2545',
  'Fixed Income': '#1B4D3E',
  Equity: '#4682B4',
  'Venture Capital': '#C4B998',
  Other: '#9370DB',
}

const formatDollar = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

export default function SummaryTab({
  reportDate,
  accounts,
  mvData,
  loading,
  onRun,
  accountSummary,
  accountSummaryFunds,
  accountSummaryYtd,
  accountSummaryYtdFunds,
  accountSummaryLoading,
  assetClassData,
  assetClassLoading,
}: Props) {
  const accountBreakdown = useMemo(() => {
    if (!mvData?.rows) return []
    const grouped: Record<string, number> = {}
    for (const row of mvData.rows) {
      const key = row.FBSIShortName || row.AccountNumber
      grouped[key] = (grouped[key] || 0) + (row.MarketValue || 0)
    }
    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
  }, [mvData])

  const entityBreakdown = useMemo(() => {
    if (!mvData?.rows) return []
    const grouped: Record<string, number> = {}
    for (const row of mvData.rows) {
      const key = row.PrimaryAccountHolder || 'Other'
      grouped[key] = (grouped[key] || 0) + (row.MarketValue || 0)
    }
    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
  }, [mvData])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="size-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
        <p className="text-secondary-foreground">Loading portfolio data...</p>
      </div>
    )
  }

  if (!mvData && !loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Briefcase className="size-12 text-neutral-600" />
        <p className="text-secondary-foreground">
          Select filters and click <strong>Run</strong> to load portfolio data.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          icon={DollarSign}
          label="Total Portfolio Value"
          value={formatCurrency(mvData?.total_mv ?? 0)}
          color="emerald"
        />
        <KPICard
          icon={Users}
          label="Accounts"
          value={String(mvData?.count ?? 0)}
          color="blue"
        />
        <KPICard
          icon={Briefcase}
          label="Entities"
          value={String(entityBreakdown.length)}
          color="amber"
        />
        <KPICard
          icon={TrendingUp}
          label="Report Date"
          value={reportDate}
          color="teal"
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Asset Class Breakdown */}
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
            Asset Class Breakdown
          </h3>
          {assetClassLoading ? (
            <div className="flex h-[320px] items-center justify-center">
              <div className="size-6 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
            </div>
          ) : assetClassData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={assetClassData.map((r) => ({
                    name: r.asset_class,
                    value: Math.round(r.market_value),
                  }))}
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {assetClassData.map((r, i) => (
                    <Cell
                      key={r.asset_class}
                      fill={ASSET_CLASS_COLORS[r.asset_class] || COLORS[i % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => formatCurrency(v)}
                  contentStyle={{
                    backgroundColor: '#1a2234',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#e6e8ee',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', color: '#9ea3ad' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[320px] items-center justify-center text-sm text-secondary-foreground">
              No data
            </div>
          )}
        </div>

        {/* Pie Chart - Account Allocation */}
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
            Account Allocation
          </h3>
          {accountBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={accountBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={120}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                >
                  {accountBreakdown.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => formatCurrency(v)}
                  contentStyle={{
                    backgroundColor: '#1a2234',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#e6e8ee',
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '11px', color: '#9ea3ad' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[320px] items-center justify-center text-sm text-secondary-foreground">
              No data
            </div>
          )}
        </div>

        {/* Entity Breakdown */}
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
            Entity Breakdown
          </h3>
          {entityBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={entityBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={120}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                >
                  {entityBreakdown.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => formatCurrency(v)}
                  contentStyle={{
                    backgroundColor: '#1a2234',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#e6e8ee',
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '11px', color: '#9ea3ad' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[320px] items-center justify-center text-sm text-secondary-foreground">
              No data
            </div>
          )}
        </div>
      </div>

      {/* Account Dashboard Table */}
      <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
          Account Dashboard
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-700 text-xs uppercase text-secondary-foreground">
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2 text-right">Market Value</th>
                <th className="px-3 py-2 text-right">% of Portfolio</th>
                <th className="px-3 py-2">Allocation</th>
              </tr>
            </thead>
            <tbody>
              {accountBreakdown.map((row, i) => {
                const pct = mvData?.total_mv
                  ? ((row.value / mvData.total_mv) * 100).toFixed(1)
                  : '0'
                return (
                  <tr
                    key={row.name}
                    className="border-b border-neutral-750/50 transition-colors hover:bg-neutral-750/30"
                  >
                    <td className="px-3 py-2.5 font-medium text-primary-foreground">
                      {row.name}
                    </td>
                    <td className="px-3 py-2.5 text-secondary-foreground">
                      {mvData?.rows.find((r) => r.FBSIShortName === row.name)?.PrimaryAccountHolder ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-primary-foreground">
                      {formatCurrency(row.value)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-secondary-foreground">
                      {pct}%
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="h-2 w-full rounded-full bg-neutral-700">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: COLORS[i % COLORS.length],
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Account Summary (QTD) */}
      <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
          Account Summary
        </h3>
        {accountSummaryLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="size-6 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
          </div>
        ) : accountSummary ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-700 text-xs uppercase text-secondary-foreground">
                  <th className="px-4 py-2 text-left">Metrics</th>
                  <th className="px-4 py-2 text-right">Quarter-to-Date</th>
                  {accountSummaryYtd && (
                    <th className="px-4 py-2 text-right">Year-to-Date</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const qtdResidual = accountSummary.ending_value
                    - accountSummary.beginning_value
                    - accountSummary.net_contributions_withdrawals
                    - accountSummary.investment_earnings
                  const ytdResidual = accountSummaryYtd
                    ? accountSummaryYtd.ending_value
                      - accountSummaryYtd.beginning_value
                      - accountSummaryYtd.net_contributions_withdrawals
                      - accountSummaryYtd.investment_earnings
                    : 0
                  const showResidual = Math.abs(qtdResidual) >= 1 || Math.abs(ytdResidual) >= 1

                  return (
                    <>
                      <tr className="border-b border-neutral-750/50">
                        <td className="px-4 py-2.5 text-secondary-foreground">Beginning Total Value</td>
                        <td className="px-4 py-2.5 text-right font-mono text-primary-foreground">
                          {formatDollar(accountSummary.beginning_value)}
                        </td>
                        {accountSummaryYtd && (
                          <td className="px-4 py-2.5 text-right font-mono text-primary-foreground">
                            {formatDollar(accountSummaryYtd.beginning_value)}
                          </td>
                        )}
                      </tr>
                      <tr className="border-b border-neutral-750/50">
                        <td className="px-4 py-2.5 text-secondary-foreground">Net Contributions/Withdrawals</td>
                        <td className="px-4 py-2.5 text-right font-mono text-primary-foreground">
                          {formatDollar(accountSummary.net_contributions_withdrawals)}
                        </td>
                        {accountSummaryYtd && (
                          <td className="px-4 py-2.5 text-right font-mono text-primary-foreground">
                            {formatDollar(accountSummaryYtd.net_contributions_withdrawals)}
                          </td>
                        )}
                      </tr>
                      <tr className="border-b border-neutral-750/50">
                        <td className="px-4 py-2.5 text-secondary-foreground">Investment Earnings</td>
                        <td className="px-4 py-2.5 text-right font-mono text-primary-foreground">
                          {formatDollar(accountSummary.investment_earnings)}
                        </td>
                        {accountSummaryYtd && (
                          <td className="px-4 py-2.5 text-right font-mono text-primary-foreground">
                            {formatDollar(accountSummaryYtd.investment_earnings)}
                          </td>
                        )}
                      </tr>
                      {showResidual && (
                        <tr className="border-b border-neutral-750/50">
                          <td className="px-4 py-2.5 text-secondary-foreground italic">
                            Reconciliation Adjustment<sup className="text-amber-500">*</sup>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono italic text-amber-400/80">
                            {formatDollar(qtdResidual)}
                          </td>
                          {accountSummaryYtd && (
                            <td className="px-4 py-2.5 text-right font-mono italic text-amber-400/80">
                              {formatDollar(ytdResidual)}
                            </td>
                          )}
                        </tr>
                      )}
                      <tr className="border-b border-neutral-700">
                        <td className="px-4 py-2.5 font-semibold text-primary-foreground">Ending Total Value</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-400">
                          {formatDollar(accountSummary.ending_value)}
                        </td>
                        {accountSummaryYtd && (
                          <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-400">
                            {formatDollar(accountSummaryYtd.ending_value)}
                          </td>
                        )}
                      </tr>
                    </>
                  )
                })()}
              </tbody>
            </table>
            {/* Footnote */}
            <p className="mt-3 text-[10px] leading-relaxed text-secondary-foreground/70">
              <span className="text-amber-500">*</span> Reconciliation Adjustment reflects timing and scope
              differences across data sources: liquid account values are daily (Fidelity), while private-fund
              balances (VC/DI/RA) are quarterly snapshots from SSC with as-of dates that may lag the report date.
              Private-fund investment earnings are not separately reported and are set to zero; any market
              appreciation is captured in this adjustment.
            </p>

            {/* Per-fund breakdown */}
            {accountSummaryFunds.length > 1 && (
              <div className="mt-4 border-t border-neutral-700 pt-3">
                <p className="mb-2 text-[11px] font-medium uppercase text-secondary-foreground">
                  By Fund Type
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-neutral-750 text-[10px] uppercase text-secondary-foreground">
                      <th className="px-3 py-1 text-left">Fund</th>
                      <th className="px-3 py-1 text-right">QTD Beginning</th>
                      <th className="px-3 py-1 text-right">QTD Net Flows</th>
                      <th className="px-3 py-1 text-right">QTD Earnings</th>
                      <th className="px-3 py-1 text-right">QTD Ending</th>
                      {accountSummaryYtdFunds.length > 1 && (
                        <>
                          <th className="px-3 py-1 text-right border-l border-neutral-700 text-blue-400/70">YTD Beginning</th>
                          <th className="px-3 py-1 text-right text-blue-400/70">YTD Net Flows</th>
                          <th className="px-3 py-1 text-right text-blue-400/70">YTD Earnings</th>
                          <th className="px-3 py-1 text-right text-blue-400/70">YTD Ending</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {accountSummaryFunds.map((f) => {
                      const ytdF = accountSummaryYtdFunds.find((y) => y.fund === f.fund)
                      return (
                        <tr key={f.fund} className="border-b border-neutral-750/30">
                          <td className="px-3 py-1.5 font-medium text-primary-foreground">{f.fund}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-secondary-foreground">{formatDollar(f.beginning_value)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-secondary-foreground">{formatDollar(f.net_contributions_withdrawals)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-secondary-foreground">{formatDollar(f.investment_earnings)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-primary-foreground">{formatDollar(f.ending_value)}</td>
                          {accountSummaryYtdFunds.length > 1 && ytdF && (
                            <>
                              <td className="px-3 py-1.5 text-right font-mono text-secondary-foreground border-l border-neutral-700">{formatDollar(ytdF.beginning_value)}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-secondary-foreground">{formatDollar(ytdF.net_contributions_withdrawals)}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-secondary-foreground">{formatDollar(ytdF.investment_earnings)}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-primary-foreground">{formatDollar(ytdF.ending_value)}</td>
                            </>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-secondary-foreground">
            No account summary data available.
          </p>
        )}
      </div>
    </div>
  )
}

function KPICard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof DollarSign
  label: string
  value: string
  color: string
}) {
  const colorMap: Record<string, string> = {
    emerald: 'from-emerald-800/40 to-emerald-900/20 border-emerald-700/50',
    blue: 'from-blue-800/40 to-blue-900/20 border-blue-700/50',
    amber: 'from-amber-800/40 to-amber-900/20 border-amber-700/50',
    teal: 'from-teal-800/40 to-teal-900/20 border-teal-700/50',
  }
  const iconColorMap: Record<string, string> = {
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    amber: 'text-amber-400',
    teal: 'text-teal-400',
  }
  return (
    <div
      className={`rounded-lg border bg-gradient-to-br p-4 ${colorMap[color] ?? colorMap.emerald}`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`size-4 ${iconColorMap[color] ?? iconColorMap.emerald}`} />
        <span className="text-[11px] font-medium uppercase text-secondary-foreground">
          {label}
        </span>
      </div>
      <div className="mt-2 text-xl font-bold text-primary-foreground">
        {value}
      </div>
    </div>
  )
}
