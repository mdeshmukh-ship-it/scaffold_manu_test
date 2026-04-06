import { useEffect } from 'react'
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
import { CalendarDays } from 'lucide-react'
import { useCIOMonthlyReturns } from '@/hooks/useCIOData'
import { Spinner } from '@/components/generic/Spinner'

type Props = {
  reportDate: string
  accounts: string[]
}

const COLORS = {
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

const formatCurrency = (v: number) => {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

export default function MonthlySummaryTab({ reportDate, accounts }: Props) {
  const { data: monthlyData, loading, fetch: fetchMonthly } = useCIOMonthlyReturns(reportDate, accounts)

  useEffect(() => {
    void fetchMonthly()
  }, [fetchMonthly])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="text-emerald-400 text-xl" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <CalendarDays className="size-5 text-emerald-400" />
        <h2 className="text-lg font-semibold text-primary-foreground">
          Monthly Performance Summary
        </h2>
      </div>

      {/* Monthly Returns Bar Chart */}
      <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
          Monthly Net Returns
        </h3>
        {monthlyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={monthlyData}
              margin={{ top: 10, right: 30, left: 20, bottom: 40 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: COLORS.axis }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fontSize: 11, fill: COLORS.axis }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number) => `${v.toFixed(2)}%`}
              />
              <Bar dataKey="return_pct" name="Monthly Return" radius={[3, 3, 0, 0]}>
                {monthlyData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.return_pct >= 0 ? COLORS.positive : COLORS.negative}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[300px] items-center justify-center text-sm text-secondary-foreground">
            No data available
          </div>
        )}
      </div>

      {/* Monthly Table */}
      <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
          Monthly Detail
        </h3>
        {monthlyData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-700 text-xs uppercase text-secondary-foreground">
                  <th className="px-3 py-2">Month</th>
                  <th className="px-3 py-2 text-right">Net Return</th>
                  <th className="px-3 py-2 text-right">Cumulative</th>
                  <th className="px-3 py-2 text-right">Ending Value</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((row) => {
                  const retColor =
                    row.return_pct >= 0 ? 'text-green-400' : 'text-red-400'
                  const cumColor =
                    row.cumulative_pct >= 0 ? 'text-green-400' : 'text-red-400'
                  return (
                    <tr
                      key={row.month}
                      className="border-b border-neutral-750/50 transition-colors hover:bg-neutral-750/30"
                    >
                      <td className="px-3 py-2.5 font-medium text-primary-foreground">
                        {row.month}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono font-semibold ${retColor}`}
                      >
                        {row.return_pct >= 0 ? '+' : ''}
                        {row.return_pct.toFixed(2)}%
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono ${cumColor}`}
                      >
                        {row.cumulative_pct >= 0 ? '+' : ''}
                        {row.cumulative_pct.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-primary-foreground">
                        {formatCurrency(row.ending_value)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex h-[200px] items-center justify-center text-sm text-secondary-foreground">
            No monthly data available
          </div>
        )}
      </div>
    </div>
  )
}
