import { gql } from '@apollo/client'
import { useMutation, useQuery } from '@apollo/client/react'
import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/router'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react'

import { Button } from '@/components/generic/Button'
import { Input } from '@/components/generic/Input'
import useCurrentUser from '@/hooks/useCurrentUser'
import SectionContainer from '@/components/generic/SectionContainer'
import { Spinner } from '@/components/generic/Spinner'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { isUnauthorizedApolloError } from '@/lib/isUnauthorizedApolloError'

const FAMILY_DETAIL_FIELDS = gql`
  fragment FamilyDetailFields on FamilyType {
    id
    name
    pmEmail
    driftThresholdPct
    monitoringEnabled
    latestStatus
    latestCheckedAt
    breachCount
    targets {
      id
      name
      targetType
      targetWeightPct
    }
  }
`

const GET_FAMILY = gql`
  query GetFamily($familyId: String!) {
    family(familyId: $familyId) {
      ...FamilyDetailFields
    }
  }
  ${FAMILY_DETAIL_FIELDS}
`

const GET_DRILL_DOWN = gql`
  query GetFamilyDrillDown($familyId: String!) {
    familyDrillDown(familyId: $familyId) {
      id
      runId
      familyId
      status
      errorMessage
      checkedAt
      snapshots {
        id
        targetId
        targetName
        targetType
        targetWeightPct
        actualMarketValue
        actualPct
        driftPct
        isBreach
      }
    }
  }
`

const CREATE_TARGET = gql`
  mutation CreateFamilyTarget($input: CreateFamilyTargetInput!) {
    createFamilyTarget(input: $input) {
      ...FamilyDetailFields
    }
  }
  ${FAMILY_DETAIL_FIELDS}
`

const DELETE_TARGET = gql`
  mutation DeleteFamilyTarget($targetId: String!) {
    deleteFamilyTarget(targetId: $targetId) {
      ...FamilyDetailFields
    }
  }
  ${FAMILY_DETAIL_FIELDS}
`

const UPDATE_FAMILY = gql`
  mutation UpdateFamily($input: UpdateFamilyInput!) {
    updateFamily(input: $input) {
      ...FamilyDetailFields
    }
  }
  ${FAMILY_DETAIL_FIELDS}
`

type DriftSnapshot = {
  id: string
  targetId: string
  targetName: string
  targetType: string
  targetWeightPct: number
  actualMarketValue: number
  actualPct: number
  driftPct: number
  isBreach: boolean
}

type FamilyRunResult = {
  id: string
  runId: string
  familyId: string
  status: string
  errorMessage: string | null
  checkedAt: string
  snapshots: DriftSnapshot[]
}

type FamilyTarget = {
  id: string
  name: string
  targetType: string
  targetWeightPct: number
}

type Family = {
  id: string
  name: string
  pmEmail: string
  driftThresholdPct: number
  monitoringEnabled: boolean
  latestStatus: string | null
  latestCheckedAt: string | null
  breachCount: number
  targets: FamilyTarget[]
}

const targetTypeLabels: Record<string, string> = {
  asset_class: 'Asset Class',
  account: 'Account',
  ticker: 'Ticker',
}

const FamilyDrillDown = ({ familyId }: { familyId: string }) => {
  const router = useRouter()
  const [showAddTarget, setShowAddTarget] = useState(false)
  const [targetName, setTargetName] = useState('')
  const [targetType, setTargetType] = useState('asset_class')
  const [targetWeight, setTargetWeight] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { currentUser, isUnauthorized, loading: currentUserLoading } = useCurrentUser()

  const {
    data: familyData,
    loading: familyLoading,
    refetch: refetchFamily,
  } = useQuery<{ family: Family | null }>(GET_FAMILY, {
    variables: { familyId },
    skip: !currentUser,
  })

  const {
    data: drillDownData,
    loading: drillDownLoading,
  } = useQuery<{ familyDrillDown: FamilyRunResult | null }>(GET_DRILL_DOWN, {
    variables: { familyId },
    skip: !currentUser,
  })

  const [createTarget, { loading: creatingTarget }] = useMutation(CREATE_TARGET)
  const [deleteTarget] = useMutation(DELETE_TARGET)
  const [updateFamily] = useMutation(UPDATE_FAMILY)

  const shouldRedirectToLogin = isUnauthorized || (!currentUserLoading && !currentUser)

  useEffect(() => {
    if (shouldRedirectToLogin) {
      void router.replace('/login')
    }
  }, [router, shouldRedirectToLogin])

  if (currentUserLoading || familyLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner className="text-blue-400 text-2xl" />
      </div>
    )
  }

  const family = familyData?.family
  if (!family) {
    return (
      <div className="flex min-h-screen flex-col items-center gap-4 p-6">
        <div className="text-secondary-foreground">Family not found.</div>
        <Button onClick={() => void router.push('/')} variant="outline" type="button">
          Back to Dashboard
        </Button>
      </div>
    )
  }

  const drillDown = drillDownData?.familyDrillDown
  const totalWeight = family.targets.reduce((sum, t) => sum + t.targetWeightPct, 0)
  const weightsValid = Math.abs(totalWeight - 100) <= 1

  const handleAddTarget = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    try {
      await createTarget({
        variables: {
          input: {
            familyId: family.id,
            name: targetName,
            targetType,
            targetWeightPct: parseFloat(targetWeight) || 0,
          },
        },
      })
      setTargetName('')
      setTargetWeight('')
      setShowAddTarget(false)
      await refetchFamily()
    } catch (err) {
      setErrorMessage(getErrorMessage(err))
    }
  }

  const handleDeleteTarget = async (targetId: string) => {
    setErrorMessage(null)
    try {
      await deleteTarget({ variables: { targetId } })
      await refetchFamily()
    } catch (err) {
      setErrorMessage(getErrorMessage(err))
    }
  }

  const handleToggleMonitoring = async () => {
    setErrorMessage(null)
    try {
      await updateFamily({
        variables: {
          input: {
            id: family.id,
            monitoringEnabled: !family.monitoringEnabled,
          },
        },
      })
      await refetchFamily()
    } catch (err) {
      setErrorMessage(getErrorMessage(err))
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-4 p-6">
      {/* Header */}
      <div className="flex w-full max-w-[900px] items-center gap-3">
        <Button onClick={() => void router.push('/')} variant="outline" type="button">
          <ArrowLeft className="mr-1 size-4" /> Back
        </Button>
        <h1 className="text-lg font-semibold text-primary-foreground">
          {family.name}
        </h1>
        {family.latestStatus === 'in_balance' && (
          <span className="rounded-full bg-green-700 px-2 py-0.5 text-xs text-green-400">
            In Balance
          </span>
        )}
        {family.latestStatus === 'breach' && (
          <span className="rounded-full bg-red-700 px-2 py-0.5 text-xs text-red-400">
            Breach ({family.breachCount})
          </span>
        )}
        {family.latestStatus === 'error' && (
          <span className="rounded-full bg-amber-700 px-2 py-0.5 text-xs text-amber-400">
            Error
          </span>
        )}
        {!family.latestStatus && (
          <span className="rounded-full bg-neutral-700 px-2 py-0.5 text-xs text-secondary-foreground">
            Not checked
          </span>
        )}
      </div>

      {/* Family metadata */}
      <SectionContainer
        title="Family Settings"
        containerClassName="w-full max-w-[900px] rounded-md"
        titleClassName="text-base"
      >
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs text-secondary-foreground">PM</div>
            <div className="text-primary-foreground">{family.pmEmail}</div>
          </div>
          <div>
            <div className="text-xs text-secondary-foreground">Drift Threshold</div>
            <div className="text-primary-foreground">{family.driftThresholdPct}%</div>
          </div>
          <div>
            <div className="text-xs text-secondary-foreground">Monitoring</div>
            <div className="flex items-center gap-2">
              <span className={family.monitoringEnabled ? 'text-green-400' : 'text-secondary-foreground'}>
                {family.monitoringEnabled ? 'Enabled' : 'Disabled'}
              </span>
              <Button
                onClick={() => void handleToggleMonitoring()}
                variant="outline"
                type="button"
                className="text-xs"
              >
                {family.monitoringEnabled ? 'Disable' : 'Enable'}
              </Button>
            </div>
          </div>
          <div>
            <div className="text-xs text-secondary-foreground">Last Checked</div>
            <div className="text-primary-foreground">
              {family.latestCheckedAt
                ? new Date(family.latestCheckedAt).toLocaleString()
                : 'Never'}
            </div>
          </div>
        </div>
      </SectionContainer>

      {/* Targets Configuration */}
      <SectionContainer
        title={
          <div className="flex items-center justify-between">
            <span>
              Target Allocations
              {!weightsValid && (
                <span className="ml-2 text-xs text-amber-400">
                  ⚠ Weights sum to {totalWeight.toFixed(1)}% (expected 100%)
                </span>
              )}
            </span>
            <Button
              onClick={() => setShowAddTarget(!showAddTarget)}
              variant="outline"
              type="button"
              className="text-xs"
            >
              <Plus className="mr-1 size-3" /> Add Target
            </Button>
          </div>
        }
        containerClassName="w-full max-w-[900px] rounded-md"
        titleClassName="text-base"
      >
        {showAddTarget && (
          <form
            className="mt-4 flex flex-col gap-3 rounded-md border border-neutral-750 bg-neutral-850 p-4"
            onSubmit={handleAddTarget}
          >
            <div className="text-sm font-medium">New Target</div>
            <Input
              required
              placeholder="Target name (e.g., Fixed Income, MSFT)"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
            />
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 py-1 text-sm text-primary-foreground"
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
            >
              <option value="asset_class">Asset Class</option>
              <option value="account">Account</option>
              <option value="ticker">Ticker / Security</option>
            </select>
            <Input
              required
              type="number"
              step="0.1"
              min="0"
              max="100"
              placeholder="Target weight %"
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button onClick={() => setShowAddTarget(false)} variant="outline" type="button">
                Cancel
              </Button>
              <Button disabled={creatingTarget} type="submit">
                {creatingTarget ? 'Adding...' : 'Add Target'}
              </Button>
            </div>
          </form>
        )}
        <div className="mt-4">
          {family.targets.length === 0 ? (
            <div className="text-sm text-secondary-foreground">
              No targets defined. Add targets to start monitoring drift.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-750 text-left text-xs text-secondary-foreground">
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2 text-right">Target %</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {family.targets.map((target) => (
                  <tr
                    key={target.id}
                    className="border-b border-neutral-750/50"
                  >
                    <td className="py-2 text-primary-foreground">
                      {target.name}
                    </td>
                    <td className="py-2 text-secondary-foreground">
                      {targetTypeLabels[target.targetType] ?? target.targetType}
                    </td>
                    <td className="py-2 text-right text-primary-foreground">
                      {target.targetWeightPct.toFixed(1)}%
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => void handleDeleteTarget(target.id)}
                        className="text-secondary-foreground transition-colors hover:text-red-400"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="pt-2 text-primary-foreground" colSpan={2}>
                    Total
                  </td>
                  <td
                    className={`pt-2 text-right ${weightsValid ? 'text-green-400' : 'text-amber-400'}`}
                  >
                    {totalWeight.toFixed(1)}%
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </SectionContainer>

      {/* Drift Snapshots (latest monitoring result) */}
      <SectionContainer
        title="Latest Drift Analysis"
        containerClassName="w-full max-w-[900px] rounded-md"
        titleClassName="text-base"
      >
        <div className="mt-3">
          {drillDownLoading ? (
            <div className="text-sm text-secondary-foreground">Loading...</div>
          ) : !drillDown ? (
            <div className="text-sm text-secondary-foreground">
              No monitoring results yet. The daily monitoring run will populate this.
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2 text-xs text-secondary-foreground">
                <span>
                  Checked: {new Date(drillDown.checkedAt).toLocaleString()}
                </span>
                <span>·</span>
                <span>Status: {drillDown.status}</span>
                {drillDown.errorMessage && (
                  <>
                    <span>·</span>
                    <span className="text-red-400">
                      {drillDown.errorMessage}
                    </span>
                  </>
                )}
              </div>
              {drillDown.snapshots.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-750 text-left text-xs text-secondary-foreground">
                      <th className="pb-2">Target</th>
                      <th className="pb-2">Type</th>
                      <th className="pb-2 text-right">Target %</th>
                      <th className="pb-2 text-right">Actual %</th>
                      <th className="pb-2 text-right">Drift</th>
                      <th className="pb-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillDown.snapshots.map((snap) => (
                      <tr
                        key={snap.id}
                        className={`border-b border-neutral-750/50 ${snap.isBreach ? 'bg-red-700/10' : ''}`}
                      >
                        <td className="py-2 text-primary-foreground">
                          {snap.targetName}
                        </td>
                        <td className="py-2 text-secondary-foreground">
                          {targetTypeLabels[snap.targetType] ?? snap.targetType}
                        </td>
                        <td className="py-2 text-right text-primary-foreground">
                          {snap.targetWeightPct.toFixed(1)}%
                        </td>
                        <td className="py-2 text-right text-primary-foreground">
                          {snap.actualPct.toFixed(1)}%
                        </td>
                        <td
                          className={`py-2 text-right font-medium ${
                            snap.isBreach ? 'text-red-400' : 'text-primary-foreground'
                          }`}
                        >
                          {snap.driftPct > 0 ? '+' : ''}
                          {snap.driftPct.toFixed(1)} pp
                        </td>
                        <td className="py-2 text-center">
                          {snap.isBreach ? (
                            <AlertTriangle className="mx-auto size-4 text-red-400" />
                          ) : (
                            <CheckCircle className="mx-auto size-4 text-green-400" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-sm text-secondary-foreground">
                  No drift data available for this run.
                </div>
              )}
            </>
          )}
        </div>
      </SectionContainer>

      {errorMessage && (
        <div className="w-full max-w-[900px] text-sm text-rose-700">
          {errorMessage}
        </div>
      )}
    </div>
  )
}

export default FamilyDrillDown
