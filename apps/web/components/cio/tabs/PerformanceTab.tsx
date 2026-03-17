import { useEffect, useState } from 'react'
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
import { useCIOMonthlyReturns, useCIOTwror, type TwrorRow } from '@/hooks/useCIOData'
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
  const [waterfallFund, setWaterfallFund] = useState('Total Portfolio')

  useEffect(() => {
    void fetchMonthly()
    void fetchTwror()
  }, [fetchMonthly, fetchTwror])

  const loading = mLoading || tLoading

  // Waterfall data from TWROR
  const waterfallData = twrorData.map((row) => ({
    name: row.FBSIShortName || row.account_number,
    mtd: parseFloat(((row.mtd_twror ?? 0) * 100).toFixed(2)),
    qtd: parseFloat(((row.qtd_twror ?? 0) * 100).toFixed(2)),
    ytd: parseFloat(((row.ytd_twror ?? 0) * 100).toFixed(2)),
    itd: parseFloat(((row.itd_twror ?? 0) * 100).toFixed(2)),
  }))

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
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-700 text-xs uppercase text-secondary-foreground">
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2 text-right">MTD</th>
                  <th className="px-3 py-2 text-right">QTD</th>
                  <th className="px-3 py-2 text-right">YTD</th>
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
                    <ReturnCell value={row.mtd_twror} />
                    <ReturnCell value={row.qtd_twror} />
                    <ReturnCell value={row.ytd_twror} />
                    <ReturnCell value={row.itd_twror} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Waterfall Chart */}
      <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-primary-foreground">
            QTD Return Waterfall
          </h3>
          <select
            value={waterfallFund}
            onChange={(e) => setWaterfallFund(e.target.value)}
            className="rounded-md border border-neutral-700 bg-neutral-850 px-3 py-1.5 text-xs text-primary-foreground outline-none"
          >
            <option value="Total Portfolio">Total Portfolio</option>
            {twrorData.map((r) => (
              <option key={r.account_number} value={r.FBSIShortName || r.account_number}>
                {r.FBSIShortName || r.account_number}
              </option>
            ))}
          </select>
        </div>
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

      {/* Monthly Returns Bar Chart */}
      <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
          Monthly Returns
        </h3>
        {mLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner className="text-emerald-400" />
          </div>
        ) : monthlyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: COLORS.axis }}
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tick={{ fontSize: 11, fill: COLORS.axis }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                formatter={(v: number) => `${v.toFixed(2)}%`}
                contentStyle={tooltipStyle}
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
