import { useEffect } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { LineChart as LineChartIcon } from 'lucide-react'
import { useCIOCumulativeReturns } from '@/hooks/useCIOData'
import { Spinner } from '@/components/generic/Spinner'

type Props = {
  reportDate: string
  accounts: string[]
}

const TEAL = '#3A7D7B'
const GRID = 'rgba(255,255,255,0.06)'
const AXIS = '#6b7280'

const tooltipStyle = {
  backgroundColor: '#1a2234',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#e6e8ee',
}

export default function CumulativePerformanceTab({ reportDate, accounts }: Props) {
  const {
    data: cumData,
    loading,
    fetch: fetchCumulative,
  } = useCIOCumulativeReturns(reportDate, accounts)

  useEffect(() => {
    void fetchCumulative()
  }, [fetchCumulative])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="text-emerald-400 text-xl" />
      </div>
    )
  }

  // Summary stats
  const latestReturn = cumData.length > 0 ? cumData[cumData.length - 1].cumulative_pct : 0
  const minReturn = cumData.length > 0 ? Math.min(...cumData.map((d) => d.cumulative_pct)) : 0
  const maxReturn = cumData.length > 0 ? Math.max(...cumData.map((d) => d.cumulative_pct)) : 0

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <LineChartIcon className="size-5 text-emerald-400" />
        <h2 className="text-lg font-semibold text-primary-foreground">
          Cumulative Performance
        </h2>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-4">
          <p className="text-[11px] font-medium uppercase text-secondary-foreground">
            Current Cumulative Return
          </p>
          <p
            className={`mt-1 text-xl font-bold ${latestReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}
          >
            {latestReturn >= 0 ? '+' : ''}
            {latestReturn.toFixed(2)}%
          </p>
        </div>
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-4">
          <p className="text-[11px] font-medium uppercase text-secondary-foreground">
            Peak Return
          </p>
          <p className="mt-1 text-xl font-bold text-emerald-400">
            +{maxReturn.toFixed(2)}%
          </p>
        </div>
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-4">
          <p className="text-[11px] font-medium uppercase text-secondary-foreground">
            Trough Return
          </p>
          <p className="mt-1 text-xl font-bold text-red-400">
            {minReturn.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Cumulative Performance Chart */}
      <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
          Cumulative Return (Selected Accounts Only)
        </h3>
        {cumData.length > 0 ? (
          <ResponsiveContainer width="100%" height={450}>
            <AreaChart
              data={cumData}
              margin={{ top: 10, right: 30, left: 20, bottom: 20 }}
            >
              <defs>
                <linearGradient id="cumGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={TEAL} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={TEAL} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: AXIS }}
                tickFormatter={(d: string) => d.slice(0, 7)}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: AXIS }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number) => [
                  `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`,
                  'Cumulative Return',
                ]}
                labelFormatter={(label: string) => `Date: ${label}`}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
              <Area
                type="monotone"
                dataKey="cumulative_pct"
                name="Cumulative Return"
                stroke={TEAL}
                strokeWidth={2}
                fill="url(#cumGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[450px] items-center justify-center text-sm text-secondary-foreground">
            No data available — click Run to load data
          </div>
        )}
      </div>
    </div>
  )
}
