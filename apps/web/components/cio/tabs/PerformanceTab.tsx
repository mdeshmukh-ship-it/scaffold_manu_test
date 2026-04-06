import { useEffect, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts'
import { useCIOMonthlyReturns, useCIOTwror } from '@/hooks/useCIOData'
import { Spinner } from '@/components/generic/Spinner'

type Props = {
  reportDate: string
  accounts: string[]
}

const COLORS = {
  positive: '#3fa97c',
  negative: '#c44a4a',
  bar: '#0D7377',
  axis: '#6b7280',
  grid: 'rgba(255,255,255,0.06)',
}

const tooltipStyle = {
  backgroundColor: '#1a2234',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#e6e8ee',
}

export default function PerformanceTab({ reportDate, accounts }: Props) {
  const { data: monthlyData, loading: mLoading, fetch: fetchMonthly } = useCIOMonthlyReturns(reportDate, accounts)
  const { data: twrorData, loading: tLoading, fetch: fetchTwror } = useCIOTwror(accounts)

  useEffect(() => {
    void fetchMonthly()
    void fetchTwror()
  }, [fetchMonthly, fetchTwror])

  const loading = mLoading || tLoading

  // Waterfall data from TWROR — now using correct column names
  const waterfallData = twrorData.map((row) => ({
    name: row.FBSIShortName || row.account_number,
    qtd: parseFloat(((row.qtd_twror ?? 0) * 100).toFixed(2)),
    ytd: parseFloat(((row.ytd_twror ?? 0) * 100).toFixed(2)),
    '1y': parseFloat(((row.one_year_twror ?? 0) * 100).toFixed(2)),
    '3y': parseFloat(((row.three_year_twror ?? 0) * 100).toFixed(2)),
    '5y': parseFloat(((row.five_year_twror ?? 0) * 100).toFixed(2)),
    itd: parseFloat(((row.inception_twror ?? 0) * 100).toFixed(2)),
  }))

  // Monthly returns trend (for the line chart)
  const monthlyTrend = useMemo(() => {
    return monthlyData.map((m) => ({
      month: m.month,
      portfolio: m.return_pct,
      cumulative: m.cumulative_pct,
    }))
  }, [monthlyData])

  return (
    <div className="flex flex-col gap-6">
      {/* Return Summary Table */}
      <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
          Return Summary (TWROR)
        </h3>
        {tLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner className="text-emerald-400" />
          </div>
        ) : twrorData.length === 0 ? (
          <p className="py-6 text-center text-sm text-secondary-foreground">
            No TWROR data available. Click <strong>Run</strong> to load.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-700 text-xs uppercase text-secondary-foreground">
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2 text-right">QTD</th>
                  <th className="px-3 py-2 text-right">YTD</th>
                  <th className="px-3 py-2 text-right">1 Year</th>
                  <th className="px-3 py-2 text-right">3 Year</th>
                  <th className="px-3 py-2 text-right">5 Year</th>
                  <th className="px-3 py-2 text-right">ITD</th>
                </tr>
              </thead>
              <tbody>
                {twrorData.map((row) => (
                  <tr
                    key={row.account_number}
                    className="border-b border-neutral-750/50 transition-colors hover:bg-neutral-750/30"
                  >
                    <td className="px-3 py-2.5 font-medium text-primary-foreground">
                      {row.FBSIShortName || row.account_number}
                    </td>
                    <ReturnCell value={row.qtd_twror} />
                    <ReturnCell value={row.ytd_twror} />
                    <ReturnCell value={row.one_year_twror} />
                    <ReturnCell value={row.three_year_twror} />
                    <ReturnCell value={row.five_year_twror} />
                    <ReturnCell value={row.inception_twror} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* QTD Returns Chart */}
      <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
          QTD Returns
        </h3>
        {waterfallData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={waterfallData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: COLORS.axis }}
                angle={-30}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fontSize: 11, fill: COLORS.axis }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                formatter={(v: number) => `${v.toFixed(2)}%`}
                contentStyle={tooltipStyle}
              />
              <Bar dataKey="qtd" name="QTD Return" radius={[4, 4, 0, 0]}>
                {waterfallData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.qtd >= 0 ? COLORS.positive : COLORS.negative}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[350px] items-center justify-center text-sm text-secondary-foreground">
            No data available
          </div>
        )}
      </div>

      {/* Monthly Portfolio Returns (Transfer-Adjusted) */}
      <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
          Monthly Portfolio Returns (Transfer-Adjusted)
        </h3>
        {mLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner className="text-emerald-400" />
          </div>
        ) : monthlyTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyTrend} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: COLORS.axis }} angle={-45} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11, fill: COLORS.axis }} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v.toFixed(2)}%`} />
              <Legend wrapperStyle={{ fontSize: '11px', color: '#9ea3ad' }} />
              <Line type="monotone" dataKey="portfolio" name="Monthly Return" stroke="#1B4D3E" strokeWidth={2} dot={{ r: 3, fill: '#1B4D3E' }} />
              <Line type="monotone" dataKey="cumulative" name="Cumulative Return" stroke="#3A7D7B" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2, fill: '#3A7D7B' }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[300px] items-center justify-center text-sm text-secondary-foreground">
            No monthly data available
          </div>
        )}
      </div>
    </div>
  )
}

function ReturnCell({ value }: { value: number | null }) {
  const pct = value != null ? (value * 100).toFixed(2) : '—'
  const color =
    value == null ? 'text-secondary-foreground' : value >= 0 ? 'text-green-400' : 'text-red-400'
  return (
    <td className={`px-3 py-2.5 text-right font-mono text-sm ${color}`}>
      {value != null ? `${parseFloat(pct) >= 0 ? '+' : ''}${pct}%` : '—'}
    </td>
  )
}
