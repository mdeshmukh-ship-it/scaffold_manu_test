import { useMemo } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  Treemap,
} from 'recharts'
import { DollarSign, TrendingUp, Users, Briefcase } from 'lucide-react'
import type { AccountRow } from '@/hooks/useCIOData'

type Props = {
  reportDate: string
  accounts: string[]
  mvData: { rows: AccountRow[]; total_mv: number; count: number } | null
  loading: boolean
  onRun: () => void
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

export default function SummaryTab({ reportDate, accounts, mvData, loading, onRun }: Props) {
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
