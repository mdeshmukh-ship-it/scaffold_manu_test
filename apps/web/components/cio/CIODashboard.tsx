import { useEffect, useState, useCallback } from 'react'
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
} from 'lucide-react'

import useCurrentUser from '@/hooks/useCurrentUser'
import { useCIOClients, useCIOEntities, useCIOAccounts, useCIOMarketValues, useCIOAccountSummary, useCIOAssetClass } from '@/hooks/useCIOData'
import { Spinner } from '@/components/generic/Spinner'
import { Button } from '@/components/generic/Button'
import SummaryTab from './tabs/SummaryTab'
import PerformanceTab from './tabs/PerformanceTab'
import RiskTab from './tabs/RiskTab'
import AttributionTab from './tabs/AttributionTab'
import LiquidityTab from './tabs/LiquidityTab'
import MonthlySummaryTab from './tabs/MonthlySummaryTab'
import CumulativePerformanceTab from './tabs/CumulativePerformanceTab'
import ITDReturnRiskTab from './tabs/ITDReturnRiskTab'

const TABS = [
  { id: 'summary', label: 'Summary', icon: BarChart3 },
  { id: 'performance', label: 'Performance', icon: TrendingUp },
  { id: 'risk', label: 'Risk', icon: Shield },
  { id: 'attribution', label: 'Attribution', icon: GitBranch },
  { id: 'liquidity', label: 'Liquidity & Private Assets', icon: Droplets },
  { id: 'monthly', label: 'Monthly Summary', icon: CalendarDays },
  { id: 'cumulative', label: 'Cumulative Performance', icon: LineChart },
  { id: 'itd', label: 'ITD Return/Risk', icon: Activity },
] as const

type TabId = (typeof TABS)[number]['id']

const CIODashboard = () => {
  const router = useRouter()
  const { currentUser, isUnauthorized, loading: userLoading } = useCurrentUser()

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>('summary')

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
  const { totals: accountSummary, funds: accountSummaryFunds, loading: summaryLoading, fetch: fetchSummary } = useCIOAccountSummary(reportDate, selectedClient, selectedAccounts)
  const { data: assetClassData, loading: assetClassLoading, fetch: fetchAssetClass } = useCIOAssetClass(reportDate, selectedAccounts)

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

  const handleRun = useCallback(() => {
    void fetchMV()
    void fetchSummary()
    void fetchAssetClass()
  }, [fetchMV, fetchSummary, fetchAssetClass])

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
            <select
              multiple
              value={selectedEntities}
              onChange={(e) => {
                const vals = Array.from(e.target.selectedOptions, (o) => o.value)
                setSelectedEntities(vals)
              }}
              className="h-[34px] min-w-[180px] rounded-md border border-neutral-700 bg-neutral-800 px-2 text-xs text-primary-foreground outline-none focus:border-blue-500"
            >
              {entities.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>

          {/* Account */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase text-secondary-foreground">
              Account
            </label>
            <select
              multiple
              value={selectedAccounts}
              onChange={(e) => {
                const vals = Array.from(e.target.selectedOptions, (o) => o.value)
                setSelectedAccounts(vals)
              }}
              className="h-[34px] min-w-[200px] rounded-md border border-neutral-700 bg-neutral-800 px-2 text-xs text-primary-foreground outline-none focus:border-blue-500"
            >
              {accounts.map((a) => (
                <option key={a.AccountNumber} value={a.AccountNumber}>
                  {a.AccountName}
                </option>
              ))}
            </select>
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
      <div className="border-b border-neutral-750 bg-neutral-850/30 px-6">
        <div className="scrollbar-none mx-auto flex max-w-[1400px] gap-0 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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
          {activeTab === 'liquidity' && (
            <LiquidityTab
              reportDate={reportDate}
              accounts={selectedAccounts}
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
    </div>
  )
}

export default CIODashboard
