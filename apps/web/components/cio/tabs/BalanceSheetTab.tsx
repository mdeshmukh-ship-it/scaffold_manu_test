import { useEffect, useMemo, useState } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import {
  Scale,
  Plus,
  Trash2,
  Building2,
  Landmark,
  Wallet,
  TrendingUp,
} from 'lucide-react'
import {
  useCIOBalanceSheet,
  type BalanceSheetData,
} from '@/hooks/useCIOData'
import { Spinner } from '@/components/generic/Spinner'
import { Button } from '@/components/generic/Button'

type Props = {
  reportDate: string
  clientName: string
  accounts: string[]
}

const COLORS = [
  '#1B4D3E', '#C4B998', '#E07830', '#2D5A4A', '#0D7377',
  '#D4A853', '#5C4D7D', '#8B4513', '#2E8B57', '#CD853F',
  '#4682B4', '#9370DB',
]

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

const ASSET_CATEGORIES = [
  'Real Estate',
  'Art & Collectibles',
  'Operating Business',
  'Cryptocurrency',
  'Insurance (CSV)',
  'Vehicles & Aircraft',
  'Jewelry & Precious Metals',
  'Other Asset',
]

const LIABILITY_CATEGORIES = [
  'Mortgage',
  'Line of Credit',
  'Margin Loan',
  'Personal Loan',
  'Credit Card',
  'Tax Liability',
  'Other Liability',
]

export default function BalanceSheetTab({ reportDate, clientName, accounts }: Props) {
  const { data, loading, error, fetch, addManualEntry, deleteManualEntry } =
    useCIOBalanceSheet(reportDate, clientName, accounts)
  const [showAddForm, setShowAddForm] = useState(false)
  const [formType, setFormType] = useState<'asset' | 'liability'>('asset')

  useEffect(() => {
    void fetch()
  }, [fetch])

  // Net worth pie chart data
  const netWorthBreakdown = useMemo(() => {
    if (!data) return []
    const items: { name: string; value: number }[] = []
    if (data.liquid_total > 0) items.push({ name: 'Liquid Assets', value: data.liquid_total })
    if (data.private_total > 0) items.push({ name: 'Private Assets', value: data.private_total })
    if (data.manual_assets_total > 0)
      items.push({ name: 'Other Assets', value: data.manual_assets_total })
    return items
  }, [data])

  // Waterfall data for balance sheet
  const waterfallData = useMemo(() => {
    if (!data) return []
    return [
      { name: 'Liquid', value: data.liquid_total },
      { name: 'Private', value: data.private_total },
      { name: 'Other Assets', value: data.manual_assets_total },
      { name: 'Liabilities', value: -data.manual_liabilities_total },
      { name: 'Net Worth', value: data.net_worth },
    ]
  }, [data])

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
        <Scale className="size-12 text-neutral-600" />
        <p className="text-secondary-foreground">
          Select filters and click <strong>Run</strong> to load balance sheet data.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          icon={Wallet}
          label="Total Assets"
          value={formatCurrency(data.total_assets)}
          color="emerald"
        />
        <KPICard
          icon={Building2}
          label="Financial Portfolio"
          value={formatCurrency(data.financial_total)}
          color="blue"
        />
        <KPICard
          icon={Landmark}
          label="Total Liabilities"
          value={formatCurrency(data.total_liabilities)}
          color="amber"
        />
        <KPICard
          icon={TrendingUp}
          label="Net Worth"
          value={formatCurrency(data.net_worth)}
          color="teal"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Asset Composition Pie */}
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
            Asset Composition
          </h3>
          {netWorthBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={netWorthBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={120}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {netWorthBreakdown.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => formatDollar(v)}
                  contentStyle={tooltipStyle}
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

        {/* Balance Sheet Waterfall */}
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary-foreground">
            Balance Sheet Summary
          </h3>
          {waterfallData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={waterfallData}
                margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: AXIS }} />
                <YAxis tick={{ fontSize: 11, fill: AXIS }} tickFormatter={formatCurrency} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => [formatDollar(v), 'Value']}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {waterfallData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        entry.name === 'Liabilities'
                          ? '#c44a4a'
                          : entry.name === 'Net Worth'
                            ? '#3A7D7B'
                            : COLORS[i % COLORS.length]
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[320px] items-center justify-center text-sm text-secondary-foreground">
              No data
            </div>
          )}
        </div>
      </div>

      {/* Liquid Assets Table */}
      <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-primary-foreground">
            Liquid Assets — {formatDollar(data.liquid_total)}
          </h3>
          <span className="text-xs text-secondary-foreground">Source: Fidelity</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-700 text-xs uppercase text-secondary-foreground">
                <th className="px-3 py-2 text-left">Asset Class</th>
                <th className="px-3 py-2 text-right">Market Value</th>
                <th className="px-3 py-2 text-right">% of Liquid</th>
                <th className="px-3 py-2">Allocation</th>
              </tr>
            </thead>
            <tbody>
              {data.liquid_assets.map((a, i) => {
                const pct =
                  data.liquid_total > 0
                    ? ((a.value / data.liquid_total) * 100).toFixed(1)
                    : '0'
                return (
                  <tr
                    key={a.subcategory}
                    className="border-b border-neutral-750/50 transition-colors hover:bg-neutral-750/30"
                  >
                    <td className="px-3 py-2.5 font-medium text-primary-foreground">
                      {a.subcategory}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-primary-foreground">
                      {formatDollar(a.value)}
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

      {/* Private Assets Table */}
      {data.private_assets.length > 0 && (
        <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-primary-foreground">
              Private Assets — {formatDollar(data.private_total)}
            </h3>
            <span className="text-xs text-secondary-foreground">Source: SSC</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-700 text-xs uppercase text-secondary-foreground">
                  <th className="px-3 py-2 text-left">Fund</th>
                  <th className="px-3 py-2 text-left">Asset Class</th>
                  <th className="px-3 py-2 text-right">Valuation</th>
                  <th className="px-3 py-2 text-right">Cost Basis</th>
                  <th className="px-3 py-2 text-right">Gain/Loss</th>
                </tr>
              </thead>
              <tbody>
                {data.private_assets.map((a, i) => {
                  const gainLoss = a.value - a.cost_basis
                  return (
                    <tr
                      key={i}
                      className="border-b border-neutral-750/50 transition-colors hover:bg-neutral-750/30"
                    >
                      <td className="px-3 py-2.5 font-medium text-primary-foreground">
                        {a.subcategory}
                      </td>
                      <td className="px-3 py-2.5 text-secondary-foreground">
                        {a.asset_class || a.investment_type || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-primary-foreground">
                        {formatDollar(a.value)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-secondary-foreground">
                        {formatDollar(a.cost_basis)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono ${gainLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}
                      >
                        {gainLoss >= 0 ? '+' : ''}
                        {formatDollar(gainLoss)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Non-Financial Assets & Liabilities */}
      <div className="rounded-lg border border-neutral-750 bg-neutral-800 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-primary-foreground">
            Non-Financial Assets & Liabilities
          </h3>
          <Button
            onClick={() => setShowAddForm(true)}
            type="button"
            className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-700 to-teal-600 px-3 py-1.5 text-xs text-white hover:from-emerald-600 hover:to-teal-500"
          >
            <Plus className="size-3.5" />
            Add Entry
          </Button>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <AddEntryForm
            clientName={clientName}
            reportDate={reportDate}
            formType={formType}
            onFormTypeChange={setFormType}
            onSubmit={async (entry) => {
              await addManualEntry(entry)
              setShowAddForm(false)
            }}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {/* Manual Assets */}
        {data.manual_assets.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-[11px] font-medium uppercase text-emerald-400">
              Other Assets — {formatDollar(data.manual_assets_total)}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-700 text-[10px] uppercase text-secondary-foreground">
                    <th className="px-3 py-1 text-left">Category</th>
                    <th className="px-3 py-1 text-left">Description</th>
                    <th className="px-3 py-1 text-right">Value</th>
                    <th className="px-3 py-1 text-right">As Of</th>
                    <th className="px-3 py-1 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.manual_assets.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b border-neutral-750/30 transition-colors hover:bg-neutral-750/30"
                    >
                      <td className="px-3 py-1.5 text-secondary-foreground">{a.category}</td>
                      <td className="px-3 py-1.5 font-medium text-primary-foreground">
                        {a.description}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-emerald-400">
                        {formatDollar(a.value)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs text-secondary-foreground">
                        {a.as_of_date}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <button
                          onClick={() => void deleteManualEntry(a.id)}
                          className="text-neutral-500 transition-colors hover:text-red-400"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Manual Liabilities */}
        {data.manual_liabilities.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase text-red-400">
              Liabilities — {formatDollar(data.manual_liabilities_total)}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-700 text-[10px] uppercase text-secondary-foreground">
                    <th className="px-3 py-1 text-left">Category</th>
                    <th className="px-3 py-1 text-left">Description</th>
                    <th className="px-3 py-1 text-right">Value</th>
                    <th className="px-3 py-1 text-right">As Of</th>
                    <th className="px-3 py-1 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.manual_liabilities.map((l) => (
                    <tr
                      key={l.id}
                      className="border-b border-neutral-750/30 transition-colors hover:bg-neutral-750/30"
                    >
                      <td className="px-3 py-1.5 text-secondary-foreground">{l.category}</td>
                      <td className="px-3 py-1.5 font-medium text-primary-foreground">
                        {l.description}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-red-400">
                        {formatDollar(l.value)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs text-secondary-foreground">
                        {l.as_of_date}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <button
                          onClick={() => void deleteManualEntry(l.id)}
                          className="text-neutral-500 transition-colors hover:text-red-400"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {data.manual_assets.length === 0 && data.manual_liabilities.length === 0 && !showAddForm && (
          <p className="py-4 text-center text-sm text-secondary-foreground">
            No manual entries yet. Click <strong>Add Entry</strong> to add real estate, art,
            businesses, mortgages, or other items.
          </p>
        )}
      </div>

      {/* Net Worth Summary */}
      <div className="rounded-lg border border-emerald-700/30 bg-gradient-to-br from-emerald-900/30 to-teal-900/20 p-5">
        <h3 className="mb-3 text-sm font-semibold text-primary-foreground">
          Consolidated Net Worth
        </h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <SummaryItem label="Liquid Assets" value={data.liquid_total} positive />
          <SummaryItem label="Private Assets" value={data.private_total} positive />
          <SummaryItem label="Other Assets" value={data.manual_assets_total} positive />
          <SummaryItem label="Liabilities" value={-data.manual_liabilities_total} positive={false} />
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-emerald-700/30 pt-3">
          <span className="text-sm font-semibold text-primary-foreground">Total Net Worth</span>
          <span className="text-2xl font-bold text-emerald-400">{formatDollar(data.net_worth)}</span>
        </div>
      </div>
    </div>
  )
}

function AddEntryForm({
  clientName,
  reportDate,
  formType,
  onFormTypeChange,
  onSubmit,
  onCancel,
}: {
  clientName: string
  reportDate: string
  formType: 'asset' | 'liability'
  onFormTypeChange: (t: 'asset' | 'liability') => void
  onSubmit: (entry: {
    client_name: string
    entry_type: 'asset' | 'liability'
    category: string
    description: string
    value: number
    as_of_date: string
    notes?: string
  }) => Promise<void>
  onCancel: () => void
}) {
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [value, setValue] = useState('')
  const [asOfDate, setAsOfDate] = useState(reportDate)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const categories = formType === 'asset' ? ASSET_CATEGORIES : LIABILITY_CATEGORIES

  const handleSubmit = async () => {
    if (!category || !description || !value) return
    setSubmitting(true)
    try {
      await onSubmit({
        client_name: clientName,
        entry_type: formType,
        category,
        description,
        value: parseFloat(value),
        as_of_date: asOfDate,
        notes: notes || undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-neutral-700 bg-neutral-750/50 p-4">
      <div className="mb-3 flex gap-2">
        <button
          onClick={() => onFormTypeChange('asset')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
            formType === 'asset'
              ? 'bg-emerald-700 text-white'
              : 'bg-neutral-700 text-secondary-foreground hover:bg-neutral-600'
          }`}
        >
          Asset
        </button>
        <button
          onClick={() => onFormTypeChange('liability')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
            formType === 'liability'
              ? 'bg-red-700 text-white'
              : 'bg-neutral-700 text-secondary-foreground hover:bg-neutral-600'
          }`}
        >
          Liability
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="text-[10px] font-medium uppercase text-secondary-foreground">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-primary-foreground outline-none focus:border-blue-500"
          >
            <option value="">Select...</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase text-secondary-foreground">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Primary Residence"
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-primary-foreground outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase text-secondary-foreground">
            Value ($)
          </label>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="1000000"
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-primary-foreground outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase text-secondary-foreground">
            As Of Date
          </label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-primary-foreground outline-none focus:border-blue-500"
          />
        </div>
      </div>
      <div className="mt-3">
        <label className="text-[10px] font-medium uppercase text-secondary-foreground">
          Notes (optional)
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Additional details..."
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-primary-foreground outline-none focus:border-blue-500"
        />
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          onClick={() => void handleSubmit()}
          disabled={submitting || !category || !description || !value}
          type="button"
          className="bg-gradient-to-r from-emerald-700 to-teal-600 px-4 py-1.5 text-xs text-white hover:from-emerald-600 hover:to-teal-500 disabled:opacity-50"
        >
          {submitting ? 'Saving...' : 'Save'}
        </Button>
        <Button
          onClick={onCancel}
          type="button"
          className="bg-neutral-700 px-4 py-1.5 text-xs text-secondary-foreground hover:bg-neutral-600"
        >
          Cancel
        </Button>
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
  icon: typeof Scale
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

function SummaryItem({
  label,
  value,
  positive,
}: {
  label: string
  value: number
  positive: boolean
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase text-secondary-foreground">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold font-mono ${positive ? 'text-emerald-400' : 'text-red-400'}`}
      >
        {value >= 0 ? '+' : ''}
        {formatDollar(value)}
      </p>
    </div>
  )
}
