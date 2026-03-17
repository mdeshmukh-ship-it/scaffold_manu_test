import { gql } from '@apollo/client'
import { useMutation, useQuery } from '@apollo/client/react'
import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/router'
import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Plus,
  XCircle,
} from 'lucide-react'

import { Button } from '@/components/generic/Button'
import { Input } from '@/components/generic/Input'
import useCurrentUser from '@/hooks/useCurrentUser'
import SectionContainer from '@/components/generic/SectionContainer'
import { Spinner } from '@/components/generic/Spinner'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { isUnauthorizedApolloError } from '@/lib/isUnauthorizedApolloError'
import { requestApiJson } from '@/lib/requestApiJson'

const FAMILY_FIELDS = gql`
  fragment FamilyFields on FamilyType {
    id
    name
    pmEmail
    driftThresholdPct
    monitoringEnabled
    createdAt
    updatedAt
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

const GET_FAMILIES = gql`
  query GetFamilies {
    families {
      ...FamilyFields
    }
  }
  ${FAMILY_FIELDS}
`

const CREATE_FAMILY = gql`
  mutation CreateFamily($input: CreateFamilyInput!) {
    createFamily(input: $input) {
      ...FamilyFields
    }
  }
  ${FAMILY_FIELDS}
`

const TRIGGER_MONITORING = gql`
  mutation TriggerMonitoringRun {
    triggerMonitoringRun {
      id
      status
      message
    }
  }
`

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
  createdAt: string
  updatedAt: string
  latestStatus: string | null
  latestCheckedAt: string | null
  breachCount: number
  targets: FamilyTarget[]
}

type GetFamiliesQuery = {
  families: Family[]
}

type CreateFamilyMutation = {
  createFamily: Family
}

type CreateFamilyMutationVariables = {
  input: {
    name: string
    pmEmail: string
    driftThresholdPct: number
  }
}

const statusConfig: Record<
  string,
  { label: string; icon: typeof CheckCircle; colorClass: string; bgClass: string }
> = {
  in_balance: {
    label: 'In Balance',
    icon: CheckCircle,
    colorClass: 'text-green-400',
    bgClass: 'bg-green-700',
  },
  breach: {
    label: 'Breach',
    icon: AlertTriangle,
    colorClass: 'text-red-400',
    bgClass: 'bg-red-700',
  },
  error: {
    label: 'Error',
    icon: XCircle,
    colorClass: 'text-amber-400',
    bgClass: 'bg-amber-700',
  },
}

const FamilyStatusBoard = () => {
  const router = useRouter()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [name, setName] = useState('')
  const [pmEmail, setPmEmail] = useState('')
  const [threshold, setThreshold] = useState('10')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const {
    currentUser,
    error: currentUserError,
    isUnauthorized,
    loading: currentUserLoading,
  } = useCurrentUser()

  const {
    data,
    error: familiesError,
    loading: familiesLoading,
    refetch,
  } = useQuery<GetFamiliesQuery>(GET_FAMILIES, {
    skip: !currentUser,
  })

  const [createFamily, { loading: creating }] = useMutation<
    CreateFamilyMutation,
    CreateFamilyMutationVariables
  >(CREATE_FAMILY)

  const [triggerMonitoring, { loading: runningMonitoring }] =
    useMutation(TRIGGER_MONITORING)

  const families = data?.families ?? []
  const familiesRequireLogin = isUnauthorizedApolloError(familiesError)
  const shouldRedirectToLogin =
    isUnauthorized ||
    familiesRequireLogin ||
    (!currentUserLoading && !currentUser && !currentUserError)

  useEffect(() => {
    if (shouldRedirectToLogin) {
      void router.replace('/login')
    }
  }, [router, shouldRedirectToLogin])

  const handleCreateFamily = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    try {
      await createFamily({
        variables: {
          input: {
            name,
            pmEmail,
            driftThresholdPct: parseFloat(threshold) || 10,
          },
        },
      })
      setName('')
      setPmEmail('')
      setThreshold('10')
      setShowCreateForm(false)
      await refetch()
    } catch (err) {
      if (isUnauthorizedApolloError(err)) {
        await router.push('/login')
        return
      }
      setErrorMessage(getErrorMessage(err))
    }
  }

  const logout = async () => {
    setErrorMessage(null)
    try {
      await requestApiJson('/api/auth/logout', { method: 'POST' })
      await router.push('/login')
    } catch (err) {
      setErrorMessage(getErrorMessage(err))
    }
  }

  const visibleErrorMessage =
    errorMessage ||
    (!isUnauthorized && currentUserError
      ? getErrorMessage(currentUserError)
      : null) ||
    (!familiesRequireLogin && familiesError
      ? getErrorMessage(familiesError)
      : null)

  if (currentUserLoading || shouldRedirectToLogin) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner className="text-blue-400 text-2xl" />
      </div>
    )
  }

  if (!currentUser) {
    return null
  }

  const inBalanceCount = families.filter(
    (f) => f.latestStatus === 'in_balance'
  ).length
  const breachFamilies = families.filter((f) => f.latestStatus === 'breach')
  const errorFamilies = families.filter((f) => f.latestStatus === 'error')
  const uncheckedFamilies = families.filter((f) => f.latestStatus === null)

  return (
    <div className="flex min-h-screen flex-col items-center gap-4 p-6">
      {/* Header */}
      <div className="flex w-full max-w-[900px] items-center justify-between">
        <h1 className="text-lg font-semibold text-primary-foreground">
          Portfolio Drift Monitor
        </h1>
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              try {
                await triggerMonitoring()
                // Wait a few seconds then refetch to see results
                setTimeout(() => void refetch(), 5000)
              } catch (err) {
                setErrorMessage(getErrorMessage(err))
              }
            }}
            disabled={runningMonitoring}
            type="button"
          >
            {runningMonitoring ? 'Running...' : '▶ Run Monitoring'}
          </Button>
          <Button
            onClick={() => void router.push('/alerts')}
            variant="outline"
            type="button"
          >
            Alert History
          </Button>
          <Button onClick={() => void logout()} type="button" variant="outline">
            Logout
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid w-full max-w-[900px] grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-neutral-750 bg-neutral-800 p-4">
          <div className="text-xs text-secondary-foreground">
            Total Families
          </div>
          <div className="mt-1 text-2xl font-bold text-primary-foreground">
            {families.length}
          </div>
        </div>
        <div className="rounded-md border border-green-700 bg-neutral-800 p-4">
          <div className="text-xs text-green-400">In Balance</div>
          <div className="mt-1 text-2xl font-bold text-green-400">
            {inBalanceCount}
          </div>
        </div>
        <div className="rounded-md border border-red-700 bg-neutral-800 p-4">
          <div className="text-xs text-red-400">Breaching</div>
          <div className="mt-1 text-2xl font-bold text-red-400">
            {breachFamilies.length}
          </div>
        </div>
        <div className="rounded-md border border-amber-700 bg-neutral-800 p-4">
          <div className="text-xs text-amber-400">
            Errors / Unchecked
          </div>
          <div className="mt-1 text-2xl font-bold text-amber-400">
            {errorFamilies.length + uncheckedFamilies.length}
          </div>
        </div>
      </div>

      {/* Signed-in user info */}
      <div className="w-full max-w-[900px] text-xs text-secondary-foreground">
        Signed in as {currentUser.email}
      </div>

      {/* Create Family */}
      <SectionContainer
        title={
          <div className="flex items-center justify-between">
            <span>Families</span>
            <Button
              onClick={() => setShowCreateForm(!showCreateForm)}
              variant="outline"
              type="button"
              className="text-xs"
            >
              <Plus className="mr-1 size-3" />
              Add Family
            </Button>
          </div>
        }
        containerClassName="w-full max-w-[900px] rounded-md"
        titleClassName="text-base"
      >
        {showCreateForm && (
          <form
            className="mt-4 flex flex-col gap-3 rounded-md border border-neutral-750 bg-neutral-850 p-4"
            onSubmit={handleCreateFamily}
          >
            <div className="text-sm font-medium text-primary-foreground">
              New Family
            </div>
            <Input
              required
              placeholder="Family name (e.g., Smith Family Trust)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              required
              type="email"
              placeholder="PM email (e.g., pm@example.com)"
              value={pmEmail}
              onChange={(e) => setPmEmail(e.target.value)}
            />
            <Input
              type="number"
              step="0.1"
              min="0.1"
              max="100"
              placeholder="Drift threshold % (default 10%)"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setShowCreateForm(false)}
                variant="outline"
                type="button"
              >
                Cancel
              </Button>
              <Button disabled={creating} type="submit">
                {creating ? 'Creating...' : 'Create Family'}
              </Button>
            </div>
          </form>
        )}

        {/* Family list */}
        <div className="mt-4 flex flex-col gap-2">
          {familiesLoading ? (
            <div className="text-secondary-foreground text-sm">
              Loading families...
            </div>
          ) : null}
          {!familiesLoading && families.length === 0 ? (
            <div className="text-secondary-foreground text-sm">
              No families configured yet. Click &quot;Add Family&quot; to get
              started.
            </div>
          ) : null}
          {families.map((family) => {
            const status = family.latestStatus
            const cfg = status ? statusConfig[status] : null
            const StatusIcon = cfg?.icon
            return (
              <div
                key={family.id}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-neutral-750 p-3 transition-colors hover:border-neutral-700 hover:bg-neutral-800/50"
                onClick={() => void router.push(`/family/${family.id}`)}
              >
                {/* Status indicator */}
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${cfg?.bgClass ?? 'bg-neutral-700'}`}
                >
                  {StatusIcon ? (
                    <StatusIcon className={`size-4 ${cfg?.colorClass}`} />
                  ) : (
                    <div className="size-2 rounded-full bg-neutral-500" />
                  )}
                </div>

                {/* Family info */}
                <div className="flex flex-1 flex-col">
                  <div className="text-sm font-medium text-primary-foreground">
                    {family.name}
                  </div>
                  <div className="text-xs text-secondary-foreground">
                    PM: {family.pm_email ?? family.pmEmail} ·{' '}
                    Threshold: {family.driftThresholdPct}% ·{' '}
                    {family.targets.length} target
                    {family.targets.length !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Status badge */}
                <div className="flex items-center gap-2">
                  {cfg ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bgClass} ${cfg.colorClass}`}
                    >
                      {cfg.label}
                      {family.breachCount > 0
                        ? ` (${family.breachCount})`
                        : ''}
                    </span>
                  ) : (
                    <span className="rounded-full bg-neutral-700 px-2 py-0.5 text-xs text-secondary-foreground">
                      Not checked
                    </span>
                  )}
                  {family.latestCheckedAt && (
                    <span className="text-xs text-tertiary">
                      {new Date(family.latestCheckedAt).toLocaleDateString()}
                    </span>
                  )}
                  <ChevronRight className="size-4 text-secondary-foreground" />
                </div>
              </div>
            )
          })}
        </div>
      </SectionContainer>

      {visibleErrorMessage ? (
        <div className="w-full max-w-[900px] text-sm text-rose-700">
          {visibleErrorMessage}
        </div>
      ) : null}
    </div>
  )
}

export default FamilyStatusBoard
