import { type FormEvent, useState } from 'react'
import { useRouter } from 'next/router'

import { Button } from '@/components/generic/Button'
import { Input } from '@/components/generic/Input'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { requestApiJson } from '@/lib/requestApiJson'

type LoginPhase = 'email' | 'code'

type StartAuthResponse = {
  message: string
  ok: boolean
}

const LoginFlow = () => {
  const router = useRouter()
  const nextUrl = (router.query.next as string) || '/'
  const [phase, setPhase] = useState<LoginPhase>('email')
  const [email, setEmail] = useState('builder@example.com')
  const [code, setCode] = useState('')
  const [devUsername, setDevUsername] = useState('admin')
  const [devPassword, setDevPassword] = useState('local-dev-password')
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const startAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    setMessage(null)
    setIsSubmitting(true)

    try {
      const response = await requestApiJson<StartAuthResponse>('/api/auth/start', {
        method: 'POST',
        body: { email },
      })
      setPhase('code')
      setMessage(response.message)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const verifyAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    setMessage(null)
    setIsSubmitting(true)

    try {
      await requestApiJson('/api/auth/verify', {
        method: 'POST',
        body: { email, code },
      })
      await router.push(nextUrl)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const passwordLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    setMessage(null)
    setIsSubmitting(true)

    try {
      await requestApiJson('/api/auth/password-login', {
        method: 'POST',
        body: { username: devUsername, password: devPassword },
      })
      await router.push(nextUrl)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-6">
      <div className="w-full rounded-md border border-neutral-750 bg-neutral-800 p-6">
        <h1 className="text-2xl font-semibold text-primary-foreground">Sign In</h1>
        <p className="mt-2 text-sm text-secondary-foreground">
          Start with the scaffold&apos;s email challenge authentication flow.
        </p>

        {phase === 'email' ? (
          <form className="mt-6 space-y-4" onSubmit={startAuth}>
            <label className="block text-sm font-medium text-primary-foreground">
              Email
              <Input
                autoComplete="email"
                className="mt-1"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Sending...' : 'Send code'}
            </Button>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={verifyAuth}>
            <label className="block text-sm font-medium text-primary-foreground">
              Challenge code
              <Input
                className="mt-1"
                onChange={(event) => setCode(event.target.value)}
                required
                value={code}
              />
            </label>
            <div className="flex gap-2">
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Verifying...' : 'Verify'}
              </Button>
              <Button
                disabled={isSubmitting}
                onClick={() => {
                  setPhase('email')
                  setCode('')
                }}
                type="button"
                variant="secondary"
              >
                Back
              </Button>
            </div>
          </form>
        )}

        <section className="mt-8 border-t border-neutral-700 pt-6">
          <h2 className="text-lg font-medium text-primary-foreground">
            Development Quick Login
          </h2>
          <p className="mt-1 text-sm text-secondary-foreground">
            Local and Replit only. This shortcut is blocked automatically outside local
            and test environments.
          </p>
          <form className="mt-4 space-y-4" onSubmit={passwordLogin}>
            <label className="block text-sm font-medium text-primary-foreground">
              Username
              <Input
                autoComplete="username"
                className="mt-1"
                onChange={(event) => setDevUsername(event.target.value)}
                required
                value={devUsername}
              />
            </label>
            <label className="block text-sm font-medium text-primary-foreground">
              Password
              <Input
                autoComplete="current-password"
                className="mt-1"
                onChange={(event) => setDevPassword(event.target.value)}
                required
                type="password"
                value={devPassword}
              />
            </label>
            <Button disabled={isSubmitting} type="submit" variant="outline">
              {isSubmitting ? 'Signing in...' : 'Sign in with development credentials'}
            </Button>
          </form>
        </section>

        {message ? <p className="mt-4 text-sm text-green-300">{message}</p> : null}
        {errorMessage ? (
          <p className="mt-4 text-sm text-rose-700">{errorMessage}</p>
        ) : null}
      </div>
    </main>
  )
}

export default LoginFlow
