import { useEffect } from 'react'
import { Activity, TrendingUp, TrendingDown, Shield, BarChart3, Calendar } from 'lucide-react'
import { useCIORiskMetrics } from '@/hooks/useCIOData'
import { Spinner } from '@/components/generic/Spinner'

type Props = {
  reportDate: string
  accounts: string[]
}

export default function ITDReturnRiskTab({ reportDate, accounts }: Props) {
  const {
    data: metrics,
    loading,
    fetch: fetchMetrics,
  } = useCIORiskMetrics(reportDate, accounts)

  useEffect(() => {
    void fetchMetrics()
  }, [fetchMetrics])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="text-emerald-400 text-xl" />
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Activity className="size-12 text-neutral-600" />
        <p className="text-secondary-foreground">
          No risk metrics available. Click <strong>Run</strong> to load data.
        </p>
      </div>
    )
  }

  const metricRows: {
    icon: typeof TrendingUp
    label: string
    value: string
    color: string
    description: string
  }[] = [
    {
      icon: TrendingUp,
      label: 'ITD Return',
      value: `${metrics.itd_return_pct >= 0 ? '+' : ''}${metrics.itd_return_pct.toFixed(2)}%`,
      color: metrics.itd_return_pct >= 0 ? 'text-green-400' : 'text-red-400',
      description: 'Total return from inception through report date',
    },
    {
      icon: TrendingUp,
      label: 'Annualized Return',
      value: `${metrics.annualized_return_pct >= 0 ? '+' : ''}${metrics.annualized_return_pct.toFixed(2)}%`,
      color: metrics.annualized_return_pct >= 0 ? 'text-green-400' : 'text-red-400',
      description: 'Geometric annualized return (252 trading days/year)',
    },
    {
      icon: Activity,
      label: 'Annualized Volatility',
      value: `${metrics.volatility_pct.toFixed(2)}%`,
      color: 'text-orange-400',
      description: 'Standard deviation of daily returns, annualized',
    },
    {
      icon: Shield,
      label: 'Sharpe Ratio',
      value: metrics.sharpe_ratio.toFixed(2),
      color: metrics.sharpe_ratio >= 1 ? 'text-green-400' : metrics.sharpe_ratio >= 0.5 ? 'text-yellow-400' : 'text-red-400',
      description: 'Risk-adjusted return (excess return / volatility)',
    },
    {
      icon: Shield,
      label: 'Sortino Ratio',
      value: metrics.sortino_ratio.toFixed(2),
      color: metrics.sortino_ratio >= 1 ? 'text-green-400' : metrics.sortino_ratio >= 0.5 ? 'text-yellow-400' : 'text-red-400',
      description: 'Downside risk-adjusted return',
    },
    {
      icon: TrendingDown,
      label: 'Max Drawdown',
      value: `-${metrics.max_drawdown_pct.toFixed(2)}%`,
      color: 'text-red-400',
      description: `Peak-to-trough from ${metrics.max_dd_peak_date} to ${metrics.max_dd_trough_date}`,
    },
    {
      icon: BarChart3,
      label: 'Best Month',
      value: `${metrics.best_month}: +${metrics.best_month_return_pct.toFixed(2)}%`,
      color: 'text-green-400',
      description: 'Highest monthly return in the period',
    },
    {
      icon: BarChart3,
      label: 'Worst Month',
      value: `${metrics.worst_month}: ${metrics.worst_month_return_pct.toFixed(2)}%`,
      color: 'text-red-400',
      description: 'Lowest monthly return in the period',
    },
    {
      icon: Calendar,
      label: 'Trading Days',
      value: metrics.total_days.toLocaleString(),
      color: 'text-blue-400',
      description: 'Number of trading days in the analysis',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Activity className="size-5 text-emerald-400" />
        <h2 className="text-lg font-semibold text-primary-foreground">
          Inception-to-Date Return & Risk
        </h2>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <HighlightCard
          label="ITD Return"
          value={`${metrics.itd_return_pct >= 0 ? '+' : ''}${metrics.itd_return_pct.toFixed(1)}%`}
          color={metrics.itd_return_pct >= 0 ? 'emerald' : 'red'}
        />
        <HighlightCard
          label="Annualized Return"
          value={`${metrics.annualized_return_pct >= 0 ? '+' : ''}${metrics.annualized_return_pct.toFixed(1)}%`}
          color={metrics.annualized_return_pct >= 0 ? 'emerald' : 'red'}
        />
        <HighlightCard
          label="Sharpe Ratio"
          value={metrics.sharpe_ratio.toFixed(2)}
          color="blue"
        />
        <HighlightCard
          label="Max Drawdown"
          value={`-${metrics.max_drawdown_pct.toFixed(1)}%`}
          color="red"
        />
      </div>

      {/* Detailed Metrics Table */}
      <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
          Risk/Return Metrics Detail
        </h3>
        <div className="divide-y divide-neutral-750/50">
          {metricRows.map((row) => {
            const Icon = row.icon
            return (
              <div
                key={row.label}
                className="flex items-center justify-between py-3 transition-colors hover:bg-neutral-750/20"
              >
                <div className="flex items-center gap-3">
                  <Icon className={`size-4 ${row.color}`} />
                  <div>
                    <p className="text-sm font-medium text-primary-foreground">
                      {row.label}
                    </p>
                    <p className="text-xs text-secondary-foreground">
                      {row.description}
                    </p>
                  </div>
                </div>
                <span className={`font-mono text-lg font-bold ${row.color}`}>
                  {row.value}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function HighlightCard({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  const colorMap: Record<string, string> = {
    emerald: 'from-emerald-800/40 to-emerald-900/20 border-emerald-700/50',
    blue: 'from-blue-800/40 to-blue-900/20 border-blue-700/50',
    red: 'from-red-800/40 to-red-900/20 border-red-700/50',
  }
  const textColorMap: Record<string, string> = {
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    red: 'text-red-400',
  }
  return (
    <div
      className={`rounded-lg border bg-gradient-to-br p-4 ${colorMap[color] ?? colorMap.emerald}`}
    >
      <p className="text-[11px] font-medium uppercase text-secondary-foreground">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-bold ${textColorMap[color] ?? textColorMap.emerald}`}>
        {value}
      </p>
    </div>
  )
}
