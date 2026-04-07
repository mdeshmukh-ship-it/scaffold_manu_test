import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/router'
import {
  BarChart3,
  TrendingUp,
  Shield,
  PieChart,
  GitBranch,
  Droplets,
  CalendarDays,
  LineChart,
  Activity,
  Layers,
  Receipt,
  Landmark,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import useCurrentUser from '@/hooks/useCurrentUser'
import {
  useCIOClients,
  useCIOEntities,
  useCIOAccounts,
  useCIOMarketValues,
  useCIOAccountSummary,
  useCIOAssetClass,
  useCIOTopPositions,
  useCIORecentTransactions,
  useCIOPrivateFundTypes,
} from '@/hooks/useCIOData'
import { Spinner } from '@/components/generic/Spinner'
import { Button } from '@/components/generic/Button'
import { MultiSelectDropdown } from '@/components/generic/MultiSelectDropdown'
import SummaryTab from './tabs/SummaryTab'
import PerformanceTab from './tabs/PerformanceTab'
import RiskTab from './tabs/RiskTab'
import AttributionTab from './tabs/AttributionTab'
import LiquidityTab from './tabs/LiquidityTab'
import MonthlySummaryTab from './tabs/MonthlySummaryTab'
import CumulativePerformanceTab from './tabs/CumulativePerformanceTab'
import ITDReturnRiskTab from './tabs/ITDReturnRiskTab'
import TopPositionsTab from './tabs/TopPositionsTab'
import RecentTransactionsTab from './tabs/RecentTransactionsTab'
import PrivateFundsTab from './tabs/PrivateFundsTab'
import AgentChat from './AgentChat'

type TabDef = {
  id: string
  label: string
  icon: LucideIcon
}

const STATIC_TABS: TabDef[] = [
  { id: 'summary', label: 'Summary', icon: BarChart3 },
  { id: 'performance', label: 'Performance', icon: TrendingUp },
  { id: 'risk', label: 'Risk', icon: Shield },
  { id: 'attribution', label: 'Attribution', icon: GitBranch },
  { id: 'positions', label: 'Holdings', icon: Layers },
  { id: 'transactions', label: 'Transactions', icon: Receipt },
  { id: 'liquidity', label: 'Liquidity & Private Assets', icon: Droplets },
  { id: 'monthly', label: 'Monthly Summary', icon: CalendarDays },
  { id: 'cumulative', label: 'Cumulative Performance', icon: LineChart },
  { id: 'itd', label: 'ITD Return/Risk', icon: Activity },
]

const PRIVATE_FUNDS_TAB: TabDef = {
  id: 'private-funds',
  label: 'Private Funds',
  icon: Landmark,
}

// ---------------------------------------------------------------------------
// Tab scroll bar with arrow buttons
// ---------------------------------------------------------------------------

function TabScrollBar({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: TabDef[]
  activeTab: string
  onTabChange: (id: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
  }, [])

  useEffect(() => {
    checkScroll()
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', checkScroll, { passive: true })
    const ro = new ResizeObserver(checkScroll)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', checkScroll)
      ro.disconnect()
    }
  }, [checkScroll, tabs])

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' })
  }

  return (
    <div className="relative border-b border-neutral-750 bg-neutral-850/30">
      {/* Left fade + arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          aria-label="Scroll tabs left"
          className="absolute left-0 top-0 z-20 flex h-full w-8 items-center justify-center bg-gradient-to-r from-neutral-850 via-neutral-850/90 to-transparent text-secondary-foreground hover:text-primary-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
      )}

      {/* Right fade + arrow */}
      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          aria-label="Scroll tabs right"
          className="absolute right-0 top-0 z-20 flex h-full w-8 items-center justify-center bg-gradient-to-l from-neutral-850 via-neutral-850/90 to-transparent text-secondary-foreground hover:text-primary-foreground"
        >
          <ChevronRight className="size-4" />
        </button>
      )}

      {/* Scrollable tab strip */}
      <div
        ref={scrollRef}
        className="scrollbar-none mx-auto flex max-w-[1400px] gap-0 overflow-x-auto px-6"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-3 text-xs font-medium transition-colors ${
                isActive
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-secondary-foreground hover:border-neutral-600 hover:text-primary-foreground'
              }`}
            >
              <Icon className="size-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

const CIODashboard = () => {
  const router = useRouter()
  const { currentUser, isUnauthorized, loading: userLoading } = useCurrentUser()

  // Tab state
  const [activeTab, setActiveTab] = useState<string>('summary')

  // Filter state
  const [reportDate, setReportDate] = useState('2025-09-30')
  const [selectedClient, setSelectedClient] = useState('')
  const [selectedEntities, setSelectedEntities] = useState<string[]>([])
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([])

  // Data
  const { clients, loading: clientsLoading } = useCIOClients()
  const { entities } = useCIOEntities(selectedClient)
  const { accounts } = useCIOAccounts(selectedClient, selectedEntities)
  const { data: mvData, loading: mvLoading, error: mvError, fetch: fetchMV } = useCIOMarketValues(reportDate, selectedAccounts)
  const { totals: accountSummary, funds: accountSummaryFunds, ytdTotals: accountSummaryYtd, ytdFunds: accountSummaryYtdFunds, loading: summaryLoading, fetch: fetchSummary } = useCIOAccountSummary(reportDate, selectedClient, selectedAccounts)
  const { data: assetClassData, loading: assetClassLoading, fetch: fetchAssetClass } = useCIOAssetClass(reportDate, selectedAccounts)
  const { data: topPositions, fetch: fetchPositions } = useCIOTopPositions(reportDate, selectedAccounts)
  const { data: recentTransactions, fetch: fetchTransactions } = useCIORecentTransactions(reportDate, selectedAccounts)

  // Private fund types — only fetched when a client is selected
  const { fundTypes: privateFundTypes } = useCIOPrivateFundTypes(selectedClient)

  // Build the dynamic tab list: insert Private Funds tab after Liquidity if the family has fund investments
  const tabs = useMemo(() => {
    if (privateFundTypes.length === 0) return STATIC_TABS
    // Insert Private Funds tab after liquidity
    const idx = STATIC_TABS.findIndex((t) => t.id === 'liquidity')
    const result = [...STATIC_TABS]
    result.splice(idx + 1, 0, PRIVATE_FUNDS_TAB)
    return result
  }, [privateFundTypes])

  // Auto-select first client
  useEffect(() => {
    if (clients.length > 0 && !selectedClient) {
      setSelectedClient(clients[0])
    }
  }, [clients, selectedClient])

  // Auto-select all entities when they change
  useEffect(() => {
    if (entities.length > 0) {
      setSelectedEntities(entities)
    }
  }, [entities])

  // Auto-select all accounts (use AccountNumber for reliable API filtering)
  useEffect(() => {
    if (accounts.length > 0) {
      setSelectedAccounts(accounts.map((a) => a.AccountNumber))
    }
  }, [accounts])

  // Login redirect
  useEffect(() => {
    if (isUnauthorized || (!userLoading && !currentUser)) {
      void router.replace('/login?next=/cio')
    }
  }, [router, isUnauthorized, userLoading, currentUser])

  // If active tab was private-funds but fund types changed (e.g. client switched), reset
  useEffect(() => {
    if (activeTab === 'private-funds' && privateFundTypes.length === 0) {
      setActiveTab('summary')
    }
  }, [activeTab, privateFundTypes])

  const handleRun = useCallback(() => {
    void fetchMV()
    void fetchSummary()
    void fetchAssetClass()
    void fetchPositions()
    void fetchTransactions()
  }, [fetchMV, fetchSummary, fetchAssetClass, fetchPositions, fetchTransactions])

  // Auto-refresh when filters change (debounced to handle cascading updates)
  const accountsKey = selectedAccounts.join(',')
  const isInitialMount = useRef(true)

  useEffect(() => {
    // Skip auto-run during initial mount cascade (client/entity/account auto-select)
    if (isInitialMount.current) {
      if (selectedClient && selectedAccounts.length > 0) {
        isInitialMount.current = false
        // Fire initial load
        handleRun()
      }
      return
    }
    if (!selectedClient) return
    const timer = setTimeout(() => {
      handleRun()
    }, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportDate, selectedClient, accountsKey])

  if (userLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner className="text-blue-400 text-2xl" />
      </div>
    )
  }

  if (!currentUser) return null

  return (
    <div className="flex min-h-screen flex-col bg-neutral-900">
      {/* Header */}
      <header className="border-b border-neutral-750 bg-neutral-850 px-6 py-4">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-800 to-teal-700">
              <PieChart className="size-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-primary-foreground">
                CIO Dashboard
              </h1>
              <p className="text-xs text-secondary-foreground">
                Portfolio Reporting & Analytics
              </p>
            </div>
          </div>
          <div className="text-xs text-secondary-foreground">
            {currentUser.email}
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="border-b border-neutral-750 bg-neutral-850/50 px-6 py-3">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-end gap-4">
          {/* Report Date */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase text-secondary-foreground">
              Report Date
            </label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-primary-foreground outline-none focus:border-blue-500"
            />
          </div>

          {/* Client */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase text-secondary-foreground">
              Client
            </label>
            <select
              value={selectedClient}
              disabled={clientsLoading}
              onChange={(e) => {
                setSelectedClient(e.target.value)
                setSelectedEntities([])
                setSelectedAccounts([])
              }}
              className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-primary-foreground outline-none focus:border-blue-500 disabled:opacity-50"
            >
              <option value="">
                {clientsLoading ? 'Loading clients...' : 'Select client...'}
              </option>
              {clients.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Entity */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase text-secondary-foreground">
              Entity
            </label>
            <MultiSelectDropdown
              options={entities.map((e) => ({ label: e, value: e }))}
              value={selectedEntities}
              onChange={setSelectedEntities}
              placeholder="Select entities..."
            />
          </div>

          {/* Account */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase text-secondary-foreground">
              Account
            </label>
            <MultiSelectDropdown
              options={accounts.map((a) => ({ label: a.AccountName, value: a.AccountNumber }))}
              value={selectedAccounts}
              onChange={setSelectedAccounts}
              placeholder="Select accounts..."
              className="min-w-[200px]"
            />
          </div>

          {/* Run Button */}
          <Button
            onClick={handleRun}
            disabled={mvLoading}
            type="button"
            className="bg-gradient-to-r from-emerald-700 to-teal-600 px-6 text-white hover:from-emerald-600 hover:to-teal-500"
          >
            {mvLoading ? 'Loading...' : '▶ Run'}
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <TabScrollBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Error Banner */}
      {mvError && (
        <div className="mx-auto mt-2 max-w-[1400px] px-6">
          <div className="rounded-lg border border-rose-700/50 bg-rose-900/30 px-4 py-3 text-sm text-rose-300">
            <strong>Error:</strong> {mvError}
          </div>
        </div>
      )}

      {/* Tab Content */}
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-[1400px]">
          {activeTab === 'summary' && (
            <SummaryTab
              reportDate={reportDate}
              accounts={selectedAccounts}
              mvData={mvData}
              loading={mvLoading}
              onRun={handleRun}
              accountSummary={accountSummary}
              accountSummaryFunds={accountSummaryFunds}
              accountSummaryYtd={accountSummaryYtd}
              accountSummaryYtdFunds={accountSummaryYtdFunds}
              accountSummaryLoading={summaryLoading}
              assetClassData={assetClassData}
              assetClassLoading={assetClassLoading}
            />
          )}
          {activeTab === 'performance' && (
            <PerformanceTab
              reportDate={reportDate}
              accounts={selectedAccounts}
            />
          )}
          {activeTab === 'risk' && (
            <RiskTab
              reportDate={reportDate}
              accounts={selectedAccounts}
            />
          )}
          {activeTab === 'attribution' && (
            <AttributionTab
              reportDate={reportDate}
              accounts={selectedAccounts}
            />
          )}
          {activeTab === 'positions' && (
            <TopPositionsTab
              reportDate={reportDate}
              accounts={selectedAccounts}
            />
          )}
          {activeTab === 'transactions' && (
            <RecentTransactionsTab
              reportDate={reportDate}
              accounts={selectedAccounts}
            />
          )}
          {activeTab === 'liquidity' && (
            <LiquidityTab
              reportDate={reportDate}
              accounts={selectedAccounts}
              clientName={selectedClient}
            />
          )}
          {activeTab === 'private-funds' && privateFundTypes.length > 0 && (
            <PrivateFundsTab
              reportDate={reportDate}
              clientName={selectedClient}
              fundTypes={privateFundTypes}
            />
          )}
          {activeTab === 'monthly' && (
            <MonthlySummaryTab
              reportDate={reportDate}
              accounts={selectedAccounts}
            />
          )}
          {activeTab === 'cumulative' && (
            <CumulativePerformanceTab
              reportDate={reportDate}
              accounts={selectedAccounts}
            />
          )}
          {activeTab === 'itd' && (
            <ITDReturnRiskTab
              reportDate={reportDate}
              accounts={selectedAccounts}
            />
          )}
        </div>
      </main>

      {/* AI Agent Chat */}
      <AgentChat
        reportDate={reportDate}
        clientName={selectedClient}
        accounts={selectedAccounts}
        dashboardContext={{
          active_tab: activeTab,
          selected_entities: selectedEntities,
          total_mv: mvData?.total_mv ?? undefined,
          account_count: selectedAccounts.length,
          account_summary: accountSummary || undefined,
          asset_class_breakdown: assetClassData || undefined,
          top_positions: topPositions.length > 0 ? topPositions.slice(0, 30) : undefined,
          recent_transactions: recentTransactions.length > 0 ? recentTransactions.slice(0, 30) : undefined,
        }}
      />
    </div>
  )
}

export default CIODashboard
