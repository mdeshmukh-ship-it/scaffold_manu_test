import { useEffect, useMemo } from 'react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  Cell,
} from 'recharts'
import { Banknote, TrendingDown, ArrowUpDown, Clock, AlertTriangle } from 'lucide-react'
import {
  useCIOCashFlowForecast,
  type CashFlowForecast,
} from '@/hooks/useCIOData'
import { Spinner } from '@/components/generic/Spinner'

type Props = {
  reportDate: string
  clientName: string
  accounts: string[]
}

const TEAL = '#3A7D7B'
const ORANGE = '#E07830'
const RED = '#c44a4a'
const BLUE = '#4682B4'
const GRID = 'rgba(255,255,255,0.06)'
const AXIS = '#6b7280'

const tooltipStyle = {
  backgroundColor: '#1a2234',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#e6e8ee',
}

const formatCurrency = (v: number) => {
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

const formatDollar = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(v)

export default function CashFlowTab({ reportDate, clientName, accounts }: Props) {
  const { data, loading, error, fetch } = useCIOCashFlowForecast(
    reportDate,
    clientName,
    accounts
  )

  useEffect(() => {
    void fetch()
  }, [fetch])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="text-emerald-400 text-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1400px] py-8">
        <div className="rounded-lg border border-rose-700/50 bg-rose-900/30 px-4 py-3 text-sm text-rose-300">
          <strong>Error:</strong> {error}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Banknote className="size-12 text-neutral-600" />
        <p className="text-secondary-foreground">
          Select filters and click <strong>Run</strong> to load cash flow data.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          icon={Banknote}
          label="Current Cash"
          value={formatCurrency(data.current_cash)}
          color="emerald"
        />
        <KPICard
          icon={Clock}
          label="Months of Runway"
          value={data.months_of_runway > 0 ? `${data.months_of_runway}` : '∞'}
          color="blue"
        />
        <KPICard
          icon={TrendingDown}
          label="Unfunded Commitments"
          value={formatCurrency(data.total_unfunded_commitments)}
          color="amber"
        />
        <KPICard
          icon={ArrowUpDown}
          label="Liquid %"
          value={`${data.liquid_pct.toFixed(1)}%`}
          color="teal"
        />
      </div>

      {/* Liquidity Runway Warning */}
      {data.months_of_runway > 0 && data.months_of_runway < 12 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-700/50 bg-amber-900/20 px-4 py-3">
          <AlertTriangle className="size-5 text-amber-400" />
          <p className="text-sm text-amber-300">
            <strong>Liquidity Alert:</strong> At the current capital call pace, cash reserves cover
            approximately <strong>{data.months_of_runway} months</strong>. Consider reviewing
            upcoming commitments or raising liquidity.
          </p>
        </div>
      )}

      {/* Row 1: Projection Chart + Key Assumptions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 12-Month Cash Projection */}
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
            12-Month Cash Projection
          </h3>
          {data.projection.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart
                data={data.projection}
                margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis
                  dataKey="month_offset"
                  tick={{ fontSize: 11, fill: AXIS }}
                  tickFormatter={(v) => `M+${v}`}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: AXIS }}
                  tickFormatter={(v) => formatCurrency(v)}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number, name: string) => [
                    formatDollar(v),
                    name === 'projected_cash' ? 'Projected Cash' : name,
                  ]}
                  labelFormatter={(v) => `Month +${v}`}
                />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />
                <Area
                  type="monotone"
                  dataKey="projected_cash"
                  stroke={TEAL}
                  fill="rgba(58,125,123,0.2)"
                  strokeWidth={2}
                  name="Projected Cash"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[320px] items-center justify-center text-sm text-secondary-foreground">
              No projection data
            </div>
          )}
        </div>

        {/* Key Assumptions */}
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
            Projection Assumptions
          </h3>
          <div className="flex flex-col gap-3">
            <AssumptionRow
              label="Avg Monthly Net Flow"
              value={formatDollar(data.avg_monthly_net_flow)}
              isNegative={data.avg_monthly_net_flow < 0}
            />
            <AssumptionRow
              label="Avg Monthly Capital Calls"
              value={formatDollar(-data.avg_monthly_capital_call)}
              isNegative={true}
            />
            <AssumptionRow
              label="Avg Monthly Distributions"
              value={formatDollar(data.avg_monthly_distributions)}
              isNegative={false}
            />
            <div className="my-1 border-t border-neutral-700" />
            <AssumptionRow
              label="Current Cash"
              value={formatDollar(data.current_cash)}
              isNegative={false}
            />
            <AssumptionRow
              label="Portfolio Value"
              value={formatDollar(data.total_portfolio_mv)}
              isNegative={false}
            />
            <AssumptionRow
              label="Unfunded Commitments"
              value={formatDollar(data.total_unfunded_commitments)}
              isNegative={true}
            />
          </div>
        </div>
      </div>

      {/* Row 2: Historical Net Flows + Monthly Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Historical Net Flows Chart */}
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
            Historical Net Flows (24M)
          </h3>
          {data.historical_flows.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={data.historical_flows}
                margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 9, fill: AXIS }}
                  tickFormatter={(m: string) => m.slice(2)}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: AXIS }}
                  tickFormatter={(v) => formatCurrency(v)}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number, name: string) => [formatDollar(v), name]}
                  labelFormatter={(m) => `Month: ${m}`}
                />
                <Legend wrapperStyle={{ fontSize: '11px', color: '#9ea3ad' }} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                <Bar dataKey="deposits" name="Deposits" fill={TEAL} radius={[2, 2, 0, 0]} />
                <Bar
                  dataKey="withdrawals"
                  name="Withdrawals"
                  fill={RED}
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[320px] items-center justify-center text-sm text-secondary-foreground">
              No flow data
            </div>
          )}
        </div>

        {/* Monthly Projection Table */}
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
            Monthly Projection Detail
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-700 text-xs uppercase text-secondary-foreground">
                  <th className="px-3 py-2 text-left">Month</th>
                  <th className="px-3 py-2 text-right">Net Flows</th>
                  <th className="px-3 py-2 text-right">Cap Calls</th>
                  <th className="px-3 py-2 text-right">Distrib.</th>
                  <th className="px-3 py-2 text-right">Cash Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.projection.map((p) => (
                  <tr
                    key={p.month_offset}
                    className="border-b border-neutral-750/50 transition-colors hover:bg-neutral-750/30"
                  >
                    <td className="px-3 py-2 text-primary-foreground">M+{p.month_offset}</td>
                    <td
                      className={`px-3 py-2 text-right font-mono ${p.net_flows >= 0 ? 'text-green-400' : 'text-red-400'}`}
                    >
                      {formatCurrency(p.net_flows)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-red-400">
                      {formatCurrency(p.capital_calls)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-green-400">
                      {formatCurrency(p.distributions)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono font-semibold ${p.projected_cash >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                    >
                      {formatCurrency(p.projected_cash)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Unfunded Commitments Table */}
      {data.unfunded_detail.length > 0 && (
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
            Unfunded Commitments Detail
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-700 text-xs uppercase text-secondary-foreground">
                  <th className="px-3 py-2 text-left">Fund</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-right">Commitment</th>
                  <th className="px-3 py-2 text-right">Called</th>
                  <th className="px-3 py-2 text-right">Unfunded</th>
                  <th className="px-3 py-2 text-right">% Called</th>
                </tr>
              </thead>
              <tbody>
                {data.unfunded_detail.map((u, i) => {
                  const pctCalled =
                    u.total_commitment > 0
                      ? ((u.total_called / u.total_commitment) * 100).toFixed(0)
                      : '0'
                  return (
                    <tr
                      key={i}
                      className="border-b border-neutral-750/50 transition-colors hover:bg-neutral-750/30"
                    >
                      <td className="px-3 py-2.5 font-medium text-primary-foreground">
                        {u.fund_name}
                      </td>
                      <td className="px-3 py-2.5 text-secondary-foreground">{u.fund_type}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-primary-foreground">
                        {formatCurrency(u.total_commitment)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-secondary-foreground">
                        {formatCurrency(u.total_called)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-amber-400">
                        {formatCurrency(u.unfunded)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-neutral-700">
                            <div
                              className="h-1.5 rounded-full bg-teal-500"
                              style={{ width: `${pctCalled}%` }}
                            />
                          </div>
                          <span className="text-xs text-secondary-foreground">{pctCalled}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function KPICard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Banknote
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
        <span className="text-[11px] font-medium uppercase text-secondary-foreground">{label}</span>
      </div>
      <div className="mt-2 text-xl font-bold text-primary-foreground">{value}</div>
    </div>
  )
}

function AssumptionRow({
  label,
  value,
  isNegative,
}: {
  label: string
  value: string
  isNegative: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-secondary-foreground">{label}</span>
      <span className={`text-sm font-mono font-medium ${isNegative ? 'text-red-400' : 'text-emerald-400'}`}>
        {value}
      </span>
    </div>
  )
}
