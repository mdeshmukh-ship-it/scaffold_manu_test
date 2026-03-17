import { gql } from '@apollo/client'
import { useMutation, useQuery } from '@apollo/client/react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import {
  ArrowLeft,
  Bell,
  CheckCircle,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'

import { Button } from '@/components/generic/Button'
import useCurrentUser from '@/hooks/useCurrentUser'
import SectionContainer from '@/components/generic/SectionContainer'
import { Spinner } from '@/components/generic/Spinner'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { isUnauthorizedApolloError } from '@/lib/isUnauthorizedApolloError'

const GET_ALERTS = gql`
  query GetAlerts {
    alerts {
      id
      familyId
      familyName
      resultId
      pmEmail
      summaryText
      deliveryStatus
      acknowledged
      acknowledgedAt
      acknowledgedBy
      sentAt
    }
  }
`

const ACKNOWLEDGE_ALERT = gql`
  mutation AcknowledgeAlert($alertId: String!) {
    acknowledgeAlert(alertId: $alertId) {
      id
      acknowledged
      acknowledgedAt
      acknowledgedBy
    }
  }
`

type Alert = {
  id: string
  familyId: string
  familyName: string
  resultId: string | null
  pmEmail: string
  summaryText: string
  deliveryStatus: string
  acknowledged: boolean
  acknowledgedAt: string | null
  acknowledgedBy: string | null
  sentAt: string
}

const AlertHistory = () => {
  const router = useRouter()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { currentUser, isUnauthorized, loading: currentUserLoading } = useCurrentUser()

  const {
    data,
    loading: alertsLoading,
    error: alertsError,
    refetch,
  } = useQuery<{ alerts: Alert[] }>(GET_ALERTS, {
    skip: !currentUser,
  })

  const [acknowledgeAlert] = useMutation(ACKNOWLEDGE_ALERT)

  const shouldRedirectToLogin = isUnauthorized || (!currentUserLoading && !currentUser)

  useEffect(() => {
    if (shouldRedirectToLogin) {
      void router.replace('/login')
    }
  }, [router, shouldRedirectToLogin])

  if (currentUserLoading || alertsLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner className="text-blue-400 text-2xl" />
      </div>
    )
  }

  if (!currentUser) {
    return null
  }

  const alerts = data?.alerts ?? []

  const handleAcknowledge = async (alertId: string) => {
    setErrorMessage(null)
    try {
      await acknowledgeAlert({ variables: { alertId } })
      await refetch()
    } catch (err) {
      setErrorMessage(getErrorMessage(err))
    }
  }

  const alertsRequireLogin = isUnauthorizedApolloError(alertsError)
  const visibleErrorMessage =
    errorMessage ||
    (!alertsRequireLogin && alertsError ? getErrorMessage(alertsError) : null)

  return (
    <div className="flex min-h-screen flex-col items-center gap-4 p-6">
      {/* Header */}
      <div className="flex w-full max-w-[900px] items-center gap-3">
        <Button onClick={() => void router.push('/')} variant="outline" type="button">
          <ArrowLeft className="mr-1 size-4" /> Dashboard
        </Button>
        <h1 className="text-lg font-semibold text-primary-foreground">
          Alert History
        </h1>
        <Bell className="size-5 text-secondary-foreground" />
      </div>

      <SectionContainer
        title={`${alerts.length} Alert${alerts.length !== 1 ? 's' : ''}`}
        containerClassName="w-full max-w-[900px] rounded-md"
        titleClassName="text-base"
      >
        <div className="mt-4 flex flex-col gap-2">
          {alerts.length === 0 ? (
            <div className="text-sm text-secondary-foreground">
              No alerts have been sent yet. Alerts are generated when the daily
              monitoring run detects drift breaches.
            </div>
          ) : null}
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`flex flex-col gap-2 rounded-md border p-4 ${
                alert.acknowledged
                  ? 'border-neutral-750 bg-neutral-800/50'
                  : 'border-red-700/50 bg-red-700/5'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-primary-foreground">
                      {alert.familyName}
                    </span>
                    {alert.acknowledged ? (
                      <span className="flex items-center gap-1 rounded-full bg-green-700 px-2 py-0.5 text-xs text-green-400">
                        <CheckCircle className="size-3" /> Reviewed
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-700 px-2 py-0.5 text-xs text-red-400">
                        Unreviewed
                      </span>
                    )}
                    <span
                      className={`text-xs ${
                        alert.deliveryStatus === 'sent'
                          ? 'text-green-400'
                          : alert.deliveryStatus === 'failed'
                            ? 'text-red-400'
                            : 'text-amber-400'
                      }`}
                    >
                      {alert.deliveryStatus === 'sent'
                        ? '✓ Delivered'
                        : alert.deliveryStatus === 'failed'
                          ? '✗ Failed'
                          : '⏳ Pending'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-secondary-foreground">
                    {new Date(alert.sentAt).toLocaleString()} · PM:{' '}
                    {alert.pmEmail}
                    {alert.acknowledged && alert.acknowledgedBy && (
                      <>
                        {' '}
                        · Reviewed by {alert.acknowledgedBy} at{' '}
                        {alert.acknowledgedAt
                          ? new Date(alert.acknowledgedAt).toLocaleString()
                          : ''}
                      </>
                    )}
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-primary-foreground">
                    {alert.summaryText}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {!alert.acknowledged && (
                    <Button
                      onClick={() => void handleAcknowledge(alert.id)}
                      variant="outline"
                      type="button"
                      className="text-xs"
                    >
                      <CheckCircle className="mr-1 size-3" /> Acknowledge
                    </Button>
                  )}
                  <Button
                    onClick={() =>
                      void router.push(`/family/${alert.familyId}`)
                    }
                    variant="outline"
                    type="button"
                    className="text-xs"
                  >
                    <ExternalLink className="mr-1 size-3" /> View Family
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionContainer>

      {visibleErrorMessage && (
        <div className="w-full max-w-[900px] text-sm text-rose-700">
          {visibleErrorMessage}
        </div>
      )}
    </div>
  )
}

export default AlertHistory
