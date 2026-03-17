/**
 * RebalancerWizard — 6-step portfolio rebalancer mirroring the Hex app.
 *
 * Step 1: Select Client & Date
 * Step 2: Review Existing Targets
 * Step 3: Configure Filters (toggle new selection vs saved)
 * Step 4: Set Target Weights
 * Step 5: Calculate & Review Drift
 * Step 6: Adjust Positions + Updated Portfolio Analysis
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { Button } from '@/components/generic/Button'
import { Input } from '@/components/generic/Input'
import { Spinner } from '@/components/generic/Spinner'
import useCurrentUser from '@/hooks/useCurrentUser'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { requestApiJson } from '@/lib/requestApiJson'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type ExistingTarget = {
  family_name: string
  category: string
  label: string
  target_weight: number
  run_by: string
  load_timestamp: string
}

type AccountOption = { AccountNumber: string; AccountName: string }

type TargetRow = { name: string; type: string; weight_pct: number }

type DriftRow = {
  name: string
  type: string
  target_pct: number
  actual_mv: number
  actual_pct: number
  target_mv: number
  drift_mv: number
  drift_pct: number
  price: number
  qty: number
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const ASSET_CLASSES = ['Equity', 'Fixed Income', 'Cash', 'Crypto']

const fmtDollar = (n: number) =>
  `$${Math.abs(n)
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`

const fmtSignedDollar = (n: number) => `${n >= 0 ? '+' : '-'}${fmtDollar(n)}`

const fmtPct = (n: number) => `${n.toFixed(1)}%`

const fmtSignedPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

const fmtQty = (n: number) =>
  n === 0
    ? ''
    : n
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const parseQty = (s: string) => {
  const cleaned = s.replace(/,/g, '')
  if (cleaned === '' || cleaned === '-') return 0
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

const icon = (type: string, name: string) => {
  if (type === 'Ticker') return '🎯'
  if (type === 'Account') return '🏦'
  if (name === 'Equity') return '📈'
  if (name === 'Fixed Income') return '🏛️'
  if (name === 'Cash') return '💵'
  if (name === 'Crypto') return '🪙'
  return '📊'
}

const yesterday = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const RebalancerWizard = () => {
  const router = useRouter()
  const { currentUser, isUnauthorized, loading: userLoading } = useCurrentUser()

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (!userLoading && (isUnauthorized || !currentUser)) {
      void router.replace('/login')
    }
  }, [router, userLoading, isUnauthorized, currentUser])

  /* ---------- Step 1 ---------- */
  const [clients, setClients] = useState<string[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [familyName, setFamilyName] = useState('')
  const [portfolioDate, setPortfolioDate] = useState(yesterday)

  /* ---------- Step 2 ---------- */
  const [existingTargets, setExistingTargets] = useState<ExistingTarget[]>([])
  const [existingMeta, setExistingMeta] = useState<{
    runBy: string
    lastUpdated: string
  } | null>(null)

  /* ---------- Step 3 ---------- */
  const [useNewSelection, setUseNewSelection] = useState(true)
  const [entityOptions, setEntityOptions] = useState<string[]>([])
  const [selectedEntities, setSelectedEntities] = useState<string[]>([])
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([])
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([])
  const [tickerInput, setTickerInput] = useState('')
  const [entitiesOpen, setEntitiesOpen] = useState(false)
  const [accountsOpen, setAccountsOpen] = useState(false)

  /* ---------- Step 4 ---------- */
  const [targets, setTargets] = useState<TargetRow[]>([])

  /* ---------- Step 5 + 6 ---------- */
  const [driftRows, setDriftRows] = useState<DriftRow[]>([])
  const [totalMV, setTotalMV] = useState(0)
  const [driftCalculating, setDriftCalculating] = useState(false)
  const [driftCalculated, setDriftCalculated] = useState(false)

  /* ---------- General ---------- */
  const [error, setError] = useState<string | null>(null)

  /* ================================================================ */
  /* Data fetching                                                     */
  /* ================================================================ */

  // Load clients on mount
  useEffect(() => {
    if (!currentUser) return
    setClientsLoading(true)
    requestApiJson<{ clients: string[] }>('/api/rebalancer/clients')
      .then((data) => setClients(data.clients))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setClientsLoading(false))
  }, [currentUser])

  // When family changes → load existing targets + entity options
  useEffect(() => {
    if (!familyName) {
      setExistingTargets([])
      setExistingMeta(null)
      setEntityOptions([])
      return
    }
    setError(null)

    // Existing targets
    requestApiJson<{ targets: ExistingTarget[] }>(
      `/api/rebalancer/targets?family_name=${encodeURIComponent(familyName)}`
    )
      .then((data) => {
        setExistingTargets(data.targets)
        if (data.targets.length > 0) {
          setExistingMeta({
            runBy: data.targets[0].run_by,
            lastUpdated: data.targets[0].load_timestamp,
          })
        } else {
          setExistingMeta(null)
        }
      })
      .catch((err) => setError(getErrorMessage(err)))

    // Entity options
    requestApiJson<{ entities: string[] }>(
      `/api/rebalancer/entities?family_name=${encodeURIComponent(familyName)}`
    )
      .then((data) => setEntityOptions(data.entities))
      .catch((err) => setError(getErrorMessage(err)))
  }, [familyName])

  // When entities change → load account options
  useEffect(() => {
    if (!familyName || selectedEntities.length === 0) {
      setAccountOptions([])
      return
    }
    requestApiJson<{ accounts: AccountOption[] }>(
      `/api/rebalancer/accounts?family_name=${encodeURIComponent(familyName)}&entities=${encodeURIComponent(selectedEntities.join(','))}`
    )
      .then((data) => setAccountOptions(data.accounts))
      .catch((err) => setError(getErrorMessage(err)))
  }, [familyName, selectedEntities])

  /* ================================================================ */
  /* Build target rows (Step 4)                                        */
  /* ================================================================ */

  const rebuildTargets = useCallback(() => {
    const rows: TargetRow[] = []

    if (useNewSelection) {
      // New selection mode
      for (const a of selectedAccounts) {
        rows.push({ name: a, type: 'Account', weight_pct: 0 })
      }
      const tickers = tickerInput
        .split(',')
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean)
      for (const t of tickers) {
        rows.push({ name: t, type: 'Ticker', weight_pct: 0 })
      }
    } else {
      // Saved selection mode — use existing targets
      const existingAccounts = existingTargets
        .filter((t) => t.category === 'Account')
        .map((t) => t.label)
      const existingTickers = existingTargets
        .filter((t) => t.category === 'Ticker')
        .map((t) => t.label)
      const existingWeights: Record<string, number> = {}
      for (const t of existingTargets) {
        existingWeights[t.label] = t.target_weight
      }

      for (const a of existingAccounts) {
        rows.push({
          name: a,
          type: 'Account',
          weight_pct: existingWeights[a] ?? 0,
        })
      }
      for (const t of existingTickers) {
        rows.push({
          name: t,
          type: 'Ticker',
          weight_pct: existingWeights[t] ?? 0,
        })
      }
    }

    // Always add asset classes
    const existingWeights: Record<string, number> = {}
    if (!useNewSelection) {
      for (const t of existingTargets) {
        existingWeights[t.label] = t.target_weight
      }
    }
    for (const ac of ASSET_CLASSES) {
      rows.push({
        name: ac,
        type: 'Asset Class',
        weight_pct: useNewSelection ? 0 : existingWeights[ac] ?? 0,
      })
    }

    setTargets(rows)
    setDriftCalculated(false)
    setDriftRows([])
  }, [useNewSelection, selectedAccounts, tickerInput, existingTargets])

  useEffect(() => {
    rebuildTargets()
  }, [rebuildTargets])

  /* ================================================================ */
  /* Validation                                                        */
  /* ================================================================ */

  const totalWeight = useMemo(
    () => targets.reduce((sum, t) => sum + t.weight_pct, 0),
    [targets]
  )
  const validationPassed = Math.abs(totalWeight - 100) <= 0.01

  const weightBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {}
    for (const t of targets) {
      breakdown[t.type] = (breakdown[t.type] ?? 0) + t.weight_pct
    }
    return breakdown
  }, [targets])

  /* ================================================================ */
  /* Calculate drift (Step 5)                                          */
  /* ================================================================ */

  const handleCalculateDrift = async () => {
    if (!validationPassed) return
    setDriftCalculating(true)
    setError(null)

    const accountNames = targets.filter((t) => t.type === 'Account').map((t) => t.name)
    const tickerNames = targets.filter((t) => t.type === 'Ticker').map((t) => t.name)

    try {
      const data = await requestApiJson<{
        total_mv: number
        date: string
        rows: Omit<DriftRow, 'qty'>[]
        ticker_prices: Record<string, number>
      }>('/api/rebalancer/drift', {
        method: 'POST',
        body: {
          family_name: familyName,
          date: portfolioDate,
          accounts: accountNames,
          tickers: tickerNames,
          targets: targets.map((t) => ({
            name: t.name,
            type: t.type,
            weight_pct: t.weight_pct,
          })),
        },
      })

      setTotalMV(data.total_mv)
      setDriftRows(data.rows.map((r) => ({ ...r, qty: 0 })))
      setDriftCalculated(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setDriftCalculating(false)
    }
  }

  /* ================================================================ */
  /* Updated portfolio analysis (Step 6)                               */
  /* ================================================================ */

  const totalInflow = useMemo(
    () => driftRows.reduce((sum, r) => sum + r.qty * (r.price || 1), 0),
    [driftRows]
  )
  const newTotal = totalMV + totalInflow

  const updatedRows = useMemo(
    () =>
      driftRows.map((r) => {
        const inflow = r.qty * (r.price || 1)
        const updatedMV = r.actual_mv + inflow
        const updatedPct = newTotal > 0 ? (updatedMV / newTotal) * 100 : 0
        return { ...r, inflow, updatedMV, updatedPct }
      }),
    [driftRows, newTotal]
  )

  /* ================================================================ */
  /* Render helpers                                                     */
  /* ================================================================ */

  if (userLoading || !currentUser) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner className="text-blue-400 text-2xl" />
      </div>
    )
  }

  /* ================================================================ */
  /* RENDER                                                            */
  /* ================================================================ */

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary-foreground">
          ⚖️ Portfolio Rebalancer
        </h1>
        <p className="mt-1 text-sm text-secondary-foreground">
          Signed in as {currentUser.email}
        </p>
      </div>

      {/* Global error */}
      {error && (
        <div className="rounded-md border border-red-700 bg-red-700/20 px-4 py-3 text-sm text-red-300">
          {error}
          <button
            className="ml-3 text-xs underline"
            onClick={() => setError(null)}
          >
            dismiss
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* STEP 1 — Select Client & Date                                */}
      {/* ============================================================ */}
      <Section title="📅 Step 1: Select Client & Date" subtitle="Choose the client family and the portfolio date you want to analyze.">
        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-blue-400">
              Client Family
            </label>
            {clientsLoading ? (
              <div className="text-sm text-secondary-foreground">Loading clients…</div>
            ) : (
              <select
                className="h-9 w-full rounded-md border border-input bg-neutral-800 px-2.5 text-sm text-primary-foreground focus:border-blue-400"
                value={familyName}
                onChange={(e) => {
                  setFamilyName(e.target.value)
                  setSelectedEntities([])
                  setSelectedAccounts([])
                  setTickerInput('')
                  setDriftCalculated(false)
                }}
              >
                <option value="">Choose a client…</option>
                {clients.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-blue-400">
              Portfolio Date
            </label>
            <Input
              type="date"
              value={portfolioDate}
              onChange={(e) => setPortfolioDate(e.target.value)}
            />
          </div>
        </div>
      </Section>

      {/* Only show remaining steps once a family is selected */}
      {familyName && (
        <>
          {/* ============================================================ */}
          {/* STEP 2 — Review Existing Targets                             */}
          {/* ============================================================ */}
          <Section title="📋 Step 2: Review Existing Targets" subtitle="Below are the most recent target allocations saved for this family.">
            {existingTargets.length === 0 ? (
              <div className="mt-3 rounded-md border border-amber-700 bg-amber-700/10 px-4 py-2 text-sm text-amber-400">
                No existing targets found for this family. Set up new targets below.
              </div>
            ) : (
              <>
                {existingMeta && (
                  <div className="mt-2 text-xs text-secondary-foreground">
                    Last updated: {existingMeta.lastUpdated} &middot; Run by:{' '}
                    {existingMeta.runBy}
                  </div>
                )}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-700 text-left text-xs text-secondary-foreground">
                        <th className="px-3 py-2">Category</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2 text-right">Target Weight %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {existingTargets.map((t, i) => (
                        <tr
                          key={i}
                          className="border-b border-neutral-750 hover:bg-neutral-800/50"
                        >
                          <td className="px-3 py-2">{t.category}</td>
                          <td className="px-3 py-2">{t.label}</td>
                          <td className="px-3 py-2 text-right">
                            {t.target_weight.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Section>

          {/* ============================================================ */}
          {/* STEP 3 — Configure Filters                                   */}
          {/* ============================================================ */}
          <Section title="🔧 Step 3: Configure Filters" subtitle="Use the toggle below to choose how to set your entity, account, and ticker selections.">
            {/* Info table */}
            <div className="mt-3 overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr className="border-b border-neutral-700 text-left text-xs text-secondary-foreground">
                    <th className="px-3 py-2">Toggle Position</th>
                    <th className="px-3 py-2">What Happens</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-neutral-750">
                    <td className="px-3 py-2 font-medium">ON (New Selection)</td>
                    <td className="px-3 py-2">
                      Pick fresh entities, accounts, and tickers from the dropdowns below
                    </td>
                  </tr>
                  <tr className="border-b border-neutral-750">
                    <td className="px-3 py-2 font-medium">OFF</td>
                    <td className="px-3 py-2">
                      Reuse the last saved selections from the database
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Toggle */}
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={useNewSelection}
                onClick={() => setUseNewSelection((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                  useNewSelection ? 'bg-blue-400' : 'bg-neutral-650'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    useNewSelection ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm font-medium">New Selection</span>
            </div>

            {/* Mode indicator */}
            <div
              className={`mt-3 rounded-md px-4 py-2 text-sm ${
                useNewSelection
                  ? 'border border-blue-700 bg-blue-700/10 text-blue-300'
                  : 'border border-green-700 bg-green-700/10 text-green-300'
              }`}
            >
              {useNewSelection
                ? '🔄 NEW SELECTION MODE — Pick entities, accounts, and tickers below.'
                : '✅ USING SAVED SELECTIONS from database.'}
            </div>

            {/* Entity / Account / Ticker pickers (only if new selection) */}
            {useNewSelection && (
              <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-3">
                {/* Entities */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-blue-400">
                    Entities
                  </label>
                  <MultiSelect
                    options={entityOptions}
                    selected={selectedEntities}
                    onChange={setSelectedEntities}
                    placeholder="Select entities…"
                    isOpen={entitiesOpen}
                    toggle={() => setEntitiesOpen((v) => !v)}
                    onClose={() => setEntitiesOpen(false)}
                  />
                </div>

                {/* Accounts */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-blue-400">
                    Accounts
                  </label>
                  <MultiSelect
                    options={accountOptions.map((a) => a.AccountName)}
                    selected={selectedAccounts}
                    onChange={setSelectedAccounts}
                    placeholder="Select accounts…"
                    isOpen={accountsOpen}
                    toggle={() => setAccountsOpen((v) => !v)}
                    onClose={() => setAccountsOpen(false)}
                  />
                </div>

                {/* Tickers */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-blue-400">
                    Tickers (comma-separated)
                  </label>
                  <Input
                    placeholder="AAPL, MSFT"
                    value={tickerInput}
                    onChange={(e) => setTickerInput(e.target.value)}
                  />
                </div>
              </div>
            )}
          </Section>

          {/* ============================================================ */}
          {/* STEP 4 — Set Target Weights                                  */}
          {/* ============================================================ */}
          <Section
            title="⚖️ Step 4: Set Target Weights"
            subtitle="Enter the target allocation percentage for each row. All weights must add up to exactly 100%."
          >
            {targets.length === 0 ? (
              <p className="mt-3 text-sm text-secondary-foreground">
                Select entities, accounts, or tickers above to build the targets table.
              </p>
            ) : (
              <>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-700 text-left text-xs text-secondary-foreground">
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2 text-right">Target Weight %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {targets.map((t, i) => (
                        <tr
                          key={`${t.name}-${t.type}`}
                          className="border-b border-neutral-750 hover:bg-neutral-800/50"
                        >
                          <td className="px-3 py-2 text-blue-300">{t.name}</td>
                          <td className="px-3 py-2">{t.type}</td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              className="w-24 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-right text-sm text-primary-foreground focus:border-blue-400 focus:outline-none"
                              value={t.weight_pct === 0 ? '' : t.weight_pct}
                              placeholder="0"
                              onChange={(e) => {
                                const updated = [...targets]
                                updated[i] = {
                                  ...updated[i],
                                  weight_pct: parseFloat(e.target.value) || 0,
                                }
                                setTargets(updated)
                                setDriftCalculated(false)
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Validation */}
                <div
                  className={`mt-3 rounded-md px-4 py-2 text-sm ${
                    validationPassed
                      ? 'border border-green-700 bg-green-700/10 text-green-300'
                      : 'border border-red-700 bg-red-700/10 text-red-300'
                  }`}
                >
                  {validationPassed
                    ? `✅ Validation passed — Total weight: ${totalWeight.toFixed(2)}%`
                    : `❌ Validation failed — Total weight: ${totalWeight.toFixed(2)}% — Need to ${
                        totalWeight < 100
                          ? `add ${(100 - totalWeight).toFixed(2)}%`
                          : `reduce by ${(totalWeight - 100).toFixed(2)}%`
                      }`}
                </div>

                {/* Weight breakdown */}
                <details className="mt-3 rounded-md border border-neutral-750 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-secondary-foreground">
                    Weight breakdown by type
                  </summary>
                  <div className="mt-2 space-y-1 text-sm">
                    {Object.entries(weightBreakdown).map(([type, weight]) => (
                      <div key={type} className="flex justify-between">
                        <span>{type}</span>
                        <span>{weight.toFixed(2)}%</span>
                      </div>
                    ))}
                  </div>
                </details>

              </>
            )}
          </Section>

          {/* ============================================================ */}
          {/* STEP 5 — Calculate & Review Drift                            */}
          {/* ============================================================ */}
          <Section
            title="📊 Step 5: Calculate & Review Drift"
            subtitle="Click Calculate Drift to fetch live prices and compare actual vs. target allocations."
          >
            <div className="mt-3">
              <Button
                onClick={() => void handleCalculateDrift()}
                disabled={!validationPassed || driftCalculating}
              >
                {driftCalculating ? (
                  <>
                    <Spinner className="mr-2 text-sm" /> Calculating…
                  </>
                ) : (
                  '📊 Calculate Drift'
                )}
              </Button>
            </div>
          </Section>

          {/* ============================================================ */}
          {/* STEP 6 — Adjust Positions                                    */}
          {/* ============================================================ */}
          {driftCalculated && (
            <>
              <Section
                title="✏️ Step 6: Adjust Positions"
                subtitle="Review drift and enter adjustments in the Qty column."
              >
                {/* Legend */}
                <div className="mt-3 overflow-x-auto">
                  <table className="text-sm">
                    <thead>
                      <tr className="border-b border-neutral-700 text-left text-xs text-secondary-foreground">
                        <th className="px-3 py-2">Drift Sign</th>
                        <th className="px-3 py-2">Meaning</th>
                        <th className="px-3 py-2">Action Needed</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-neutral-750">
                        <td className="px-3 py-2 font-medium">(−) Negative</td>
                        <td className="px-3 py-2">Underweight — below target</td>
                        <td className="px-3 py-2">Buy / Add</td>
                      </tr>
                      <tr className="border-b border-neutral-750">
                        <td className="px-3 py-2 font-medium">(+) Positive</td>
                        <td className="px-3 py-2">Overweight — above target</td>
                        <td className="px-3 py-2">Sell / Reduce</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-secondary-foreground">
                  <li>
                    <strong>Stocks:</strong> Enter share count in{' '}
                    <strong>Qty</strong> (negative to sell). Price auto-fills.
                  </li>
                  <li>
                    <strong>Accounts / Asset Classes:</strong> Enter{' '}
                    <strong>dollar amount</strong> in Qty. Price defaults to $1.
                  </li>
                </ul>

                {/* Drift table */}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-700 text-left text-xs text-secondary-foreground">
                        <th className="px-2 py-2">Row Item</th>
                        <th className="px-2 py-2">Type</th>
                        <th className="px-2 py-2 text-right">Actual MV</th>
                        <th className="px-2 py-2 text-right">Actual %</th>
                        <th className="px-2 py-2 text-right">Target MV</th>
                        <th className="px-2 py-2 text-right">Target %</th>
                        <th className="px-2 py-2 text-right">Drift MV</th>
                        <th className="px-2 py-2 text-right">Drift %</th>
                        <th className="px-2 py-2 text-right">Qty</th>
                        <th className="px-2 py-2 text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {driftRows.map((r, i) => (
                        <tr
                          key={r.name}
                          className="border-b border-neutral-750 hover:bg-neutral-800/50"
                        >
                          <td className="px-2 py-2 whitespace-nowrap">
                            {icon(r.type, r.name)} {r.name}
                          </td>
                          <td className="px-2 py-2">{r.type}</td>
                          <td className="px-2 py-2 text-right">{fmtDollar(r.actual_mv)}</td>
                          <td className="px-2 py-2 text-right">{fmtPct(r.actual_pct)}</td>
                          <td className="px-2 py-2 text-right">{fmtDollar(r.target_mv)}</td>
                          <td className="px-2 py-2 text-right">{fmtPct(r.target_pct)}</td>
                          <td
                            className={`px-2 py-2 text-right ${
                              r.drift_mv > 0
                                ? 'text-green-400'
                                : r.drift_mv < 0
                                  ? 'text-red-400'
                                  : ''
                            }`}
                          >
                            {fmtSignedDollar(r.drift_mv)}
                          </td>
                          <td
                            className={`px-2 py-2 text-right ${
                              r.drift_pct > 0
                                ? 'text-green-400'
                                : r.drift_pct < 0
                                  ? 'text-red-400'
                                  : ''
                            }`}
                          >
                            {fmtSignedPct(r.drift_pct)}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <input
                              type="text"
                              inputMode="numeric"
                              className="w-24 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-right text-sm text-primary-foreground focus:border-blue-400 focus:outline-none"
                              value={fmtQty(r.qty)}
                              placeholder="0"
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^0-9,\-]/g, '')
                                const updated = [...driftRows]
                                updated[i] = {
                                  ...updated[i],
                                  qty: parseQty(raw),
                                }
                                setDriftRows(updated)
                              }}
                            />
                          </td>
                          <td className="px-2 py-2 text-right">
                            ${r.price.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                      {/* TOTAL row */}
                      <tr className="border-t-2 border-neutral-600 bg-neutral-800 font-medium">
                        <td className="px-2 py-2">📊 TOTAL</td>
                        <td className="px-2 py-2" />
                        <td className="px-2 py-2 text-right">{fmtDollar(totalMV)}</td>
                        <td className="px-2 py-2 text-right">100.0%</td>
                        <td className="px-2 py-2 text-right">{fmtDollar(totalMV)}</td>
                        <td className="px-2 py-2 text-right">100.0%</td>
                        <td className="px-2 py-2 text-right">+0</td>
                        <td className="px-2 py-2 text-right">+0.0%</td>
                        <td className="px-2 py-2" />
                        <td className="px-2 py-2" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* ============================================================ */}
              {/* Updated Portfolio Analysis                                    */}
              {/* ============================================================ */}
              <Section
                title="📈 Updated Portfolio Analysis"
                subtitle=""
              >
                <div className="mt-3 grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-xs text-blue-400">
                      Portfolio Total (Updated)
                    </div>
                    <div className="text-2xl font-bold">{fmtDollar(newTotal)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-blue-400">
                      Net Inflow / Outflow
                    </div>
                    <div className="text-2xl font-bold">
                      {totalInflow >= 0 ? '' : '-'}
                      {fmtDollar(totalInflow)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-700 text-left text-xs text-secondary-foreground">
                        <th className="px-2 py-2">Asset</th>
                        <th className="px-2 py-2 text-right">Actual MV</th>
                        <th className="px-2 py-2 text-right">Actual %</th>
                        <th className="px-2 py-2 text-right">Target %</th>
                        <th className="px-2 py-2 text-right">Drift %</th>
                        <th className="px-2 py-2 text-right">Inflow / Outflow</th>
                        <th className="px-2 py-2 text-right">Updated MV</th>
                        <th className="px-2 py-2 text-right">Updated %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {updatedRows.map((r) => (
                        <tr
                          key={r.name}
                          className="border-b border-neutral-750 hover:bg-neutral-800/50"
                        >
                          <td className="px-2 py-2 whitespace-nowrap">
                            {icon(r.type, r.name)} {r.name}
                          </td>
                          <td className="px-2 py-2 text-right">{fmtDollar(r.actual_mv)}</td>
                          <td className="px-2 py-2 text-right">{fmtPct(r.actual_pct)}</td>
                          <td className="px-2 py-2 text-right">{fmtPct(r.target_pct)}</td>
                          <td
                            className={`px-2 py-2 text-right ${
                              r.drift_pct > 0
                                ? 'text-green-400'
                                : r.drift_pct < 0
                                  ? 'text-red-400'
                                  : ''
                            }`}
                          >
                            {fmtSignedPct(r.drift_pct)}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {r.inflow !== 0 ? fmtSignedDollar(r.inflow) : '$0.00'}
                          </td>
                          <td className="px-2 py-2 text-right">{fmtDollar(r.updatedMV)}</td>
                          <td className="px-2 py-2 text-right">{fmtPct(r.updatedPct)}</td>
                        </tr>
                      ))}
                      {/* TOTAL row */}
                      <tr className="border-t-2 border-neutral-600 bg-neutral-800 font-medium">
                        <td className="px-2 py-2">📊 TOTAL</td>
                        <td className="px-2 py-2 text-right">{fmtDollar(totalMV)}</td>
                        <td className="px-2 py-2 text-right">100.0%</td>
                        <td className="px-2 py-2 text-right">100.0%</td>
                        <td className="px-2 py-2 text-right">+0.0%</td>
                        <td className="px-2 py-2 text-right">
                          {totalInflow !== 0
                            ? fmtSignedDollar(totalInflow)
                            : '$0.00'}
                        </td>
                        <td className="px-2 py-2 text-right">{fmtDollar(newTotal)}</td>
                        <td className="px-2 py-2 text-right">100.0%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

              </Section>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default RebalancerWizard

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

const Section = ({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) => (
  <div className="rounded-md border border-neutral-750 bg-neutral-800 p-6">
    <h2 className="text-lg font-semibold text-primary-foreground">{title}</h2>
    {subtitle && (
      <p className="mt-1 text-sm text-secondary-foreground">{subtitle}</p>
    )}
    {children}
  </div>
)

const MultiSelect = ({
  options,
  selected,
  onChange,
  placeholder,
  isOpen,
  toggle,
  onClose,
}: {
  options: string[]
  selected: string[]
  onChange: (v: string[]) => void
  placeholder: string
  isOpen: boolean
  toggle: () => void
  onClose: () => void
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose])

  const handleToggle = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((s) => s !== opt))
    } else {
      onChange([...selected, opt])
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* Selected tags + trigger */}
      <div
        className="flex min-h-[36px] cursor-pointer flex-wrap items-center gap-1 rounded-md border border-input bg-neutral-800 px-2 py-1"
        onClick={toggle}
      >
        {selected.length === 0 && (
          <span className="text-sm text-muted-foreground">{placeholder}</span>
        )}
        {selected.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 rounded bg-blue-400/20 px-2 py-0.5 text-xs text-blue-300"
          >
            {s.length > 18 ? s.slice(0, 18) + '…' : s}
            <button
              type="button"
              className="ml-0.5 text-blue-400 hover:text-blue-200"
              onClick={(e) => {
                e.stopPropagation()
                handleToggle(s)
              }}
            >
              ×
            </button>
          </span>
        ))}
        <span className="ml-auto text-xs text-secondary-foreground">
          {isOpen ? '▲' : '▼'}
        </span>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-neutral-700 bg-neutral-850 shadow-lg">
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-secondary-foreground">
              No options
            </div>
          )}
          {/* Select all / clear */}
          {options.length > 0 && (
            <div className="flex gap-2 border-b border-neutral-750 px-3 py-1.5">
              <button
                type="button"
                className="text-xs text-blue-400 hover:underline"
                onClick={() => onChange([...options])}
              >
                Select all
              </button>
              <button
                type="button"
                className="text-xs text-red-400 hover:underline"
                onClick={() => onChange([])}
              >
                Clear
              </button>
            </div>
          )}
          {options.map((opt) => (
            <label
              key={opt}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-neutral-800"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => handleToggle(opt)}
                className="accent-blue-400"
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
