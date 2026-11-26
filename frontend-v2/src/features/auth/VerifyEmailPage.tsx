/**
 * features/auth/VerifyEmailPage.tsx
 * Token-based email verification page — standalone route /verify?token=xxx
 * Called when user clicks the verification link in their email.
 */
import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CircleCheck, CircleHelp, CircleX } from 'lucide-react'
import { apiClient } from '@/api/client'
import { AuthLayout, AuthStatus } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/button'

type VerifyState = 'loading' | 'success' | 'error' | 'no-token'

interface VerifyTokenResponse {
  message?: string
}

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [state, setState] = useState<VerifyState>(token ? 'loading' : 'no-token')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) return

    const controller = new AbortController()

    async function verify() {
      try {
        const { data } = await apiClient.get<VerifyTokenResponse>('/verify-token', {
          params: { token },
          signal: controller.signal,
        })

        setState('success')
        setMessage(data.message || 'Účet je ověřený.')
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        const data = (err as { response?: { data?: VerifyTokenResponse } }).response?.data
        setState('error')
        setMessage(data?.message || 'Chyba sítě při ověřování.')
      }
    }

    verify()
    return () => controller.abort()
  }, [token])

  const loginLink = (label: string) => (
    <Button asChild size="lg" className="w-full">
      <Link to="/login" data-testid="verify-email-login-link">{label}</Link>
    </Button>
  )

  return (
    <AuthLayout data-testid="verify-email-page" data-verify-state={state}>
      {state === 'loading' && (
        <p role="status" className="text-center text-body text-(--text-muted)">Ověřuji tvůj účet…</p>
      )}

      {state === 'success' && (
        <AuthStatus icon={CircleCheck} tone="success" title="Ověření úspěšné" actions={loginLink('Přihlásit se')}>
          {message}
        </AuthStatus>
      )}

      {state === 'error' && (
        <AuthStatus icon={CircleX} tone="error" title="Ověření selhalo" actions={loginLink('Zpět na přihlášení')}>
          {message}
        </AuthStatus>
      )}

      {state === 'no-token' && (
        <AuthStatus icon={CircleHelp} tone="neutral" title="Chybí ověřovací odkaz" actions={loginLink('Zpět na přihlášení')}>
          Ověřovací odkaz je neplatný nebo chybí token. Zkontroluj svůj e-mail a klikni na správný odkaz.
        </AuthStatus>
      )}
    </AuthLayout>
  )
}
