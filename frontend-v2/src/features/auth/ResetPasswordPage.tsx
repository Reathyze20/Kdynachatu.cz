import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, CircleCheck, CircleX } from 'lucide-react'
import { apiClient } from '@/api/client'
import { showToast } from '@/lib/toast'
import { AuthLayout, AuthStatus } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/button'

type ResetViewState = 'loading' | 'ready' | 'success' | 'expired' | 'error' | 'no-token'

interface ResetPasswordResponse {
  message?: string
}

type ResetError = { response?: { status?: number; data?: ResetPasswordResponse } }

/** Backend vrací 400, když token neexistuje, vypršel nebo už byl použitý. Délku hesla (8–100) hlídá formulář dřív, než se odešle. */
function isExpiredLink(err: unknown) {
  return (err as ResetError).response?.status === 400
}

/** Odkaz nejde použít: řekne proč a nabídne nový odkaz přes zapomenuté heslo, vedle návrat na přihlášení (#514). */
function DeadEnd({ title, text }: { title: string; text: string }) {
  return (
    <AuthStatus
      icon={CircleX}
      tone="error"
      title={title}
      actions={(
        <>
          <Button asChild size="lg" className="w-full">
            <Link to="/login?view=forgot" data-testid="reset-password-new-link">Poslat nový odkaz</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/login" data-testid="reset-password-login-link">Zpět na přihlášení</Link>
          </Button>
        </>
      )}
    >
      {text}
    </AuthStatus>
  )
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [viewState, setViewState] = useState<ResetViewState>(token ? 'loading' : 'no-token')
  const [message, setMessage] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword

  useEffect(() => {
    if (!token) return

    const controller = new AbortController()

    async function validateToken() {
      try {
        await apiClient.get<ResetPasswordResponse>('/reset-password-token', {
          params: { token },
          signal: controller.signal,
        })
        setViewState('ready')
        setMessage('')
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        if (isExpiredLink(err)) {
          setViewState('expired')
          return
        }
        const data = (err as ResetError).response?.data
        setViewState('error')
        setMessage(data?.message || 'Resetovací odkaz se nepodařilo ověřit.')
      }
    }

    validateToken()
    return () => controller.abort()
  }, [token])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!token) {
      setViewState('no-token')
      return
    }

    if (password.length < 8) {
      setMessage('Heslo musí mít alespoň 8 znaků.')
      return
    }

    if (password !== confirmPassword) {
      setMessage('Hesla se neshodují.')
      return
    }

    setSubmitting(true)
    setMessage('')

    try {
      const { data } = await apiClient.post<ResetPasswordResponse>('/reset-password', {
        token,
        password,
      })
      setViewState('success')
      setMessage(data.message || 'Heslo bylo změněno.')
      showToast('Heslo změněno.', 'success')
    } catch (err: unknown) {
      if (isExpiredLink(err)) {
        setViewState('expired')
        return
      }
      const data = (err as ResetError).response?.data
      const text = data?.message || 'Nepodařilo se nastavit nové heslo.'
      setViewState('error')
      setMessage(text)
      showToast(text, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout data-testid="reset-password-page" data-reset-state={viewState}>
      {viewState === 'loading' && (
        <p role="status" className="text-center text-body text-(--text-muted)">Ověřuji resetovací odkaz…</p>
      )}

      {viewState === 'ready' && (
        <>
          <h2 className="mb-2 text-center text-card-title text-(--text-main)">Nastavení nového hesla</h2>
          <p className="mb-6 text-center text-body text-(--text-muted)">
            Zvol nové heslo pro svůj účet. Odkaz můžeš použít jen jednou.
          </p>

          <form onSubmit={handleSubmit} data-testid="reset-password-form">
            <div className="form-group">
              <label htmlFor="reset-password">Nové heslo</label>
              <div className="input-eye-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="reset-password"
                  name="password"
                  maxLength={100}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  data-testid="reset-password-input"
                />
                <button
                  type="button"
                  className="toggle-password"
                  aria-label={showPassword ? 'Skrýt heslo' : 'Zobrazit heslo'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="reset-password-confirm">Potvrzení nového hesla</label>
              <div className="input-eye-wrapper">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="reset-password-confirm"
                  name="confirmPassword"
                  maxLength={100}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={submitting}
                  data-testid="reset-password-confirm-input"
                />
                <button
                  type="button"
                  className="toggle-password"
                  aria-label={showConfirmPassword ? 'Skrýt potvrzení hesla' : 'Zobrazit potvrzení hesla'}
                  aria-pressed={showConfirmPassword}
                  onClick={() => setShowConfirmPassword((value) => !value)}
                >
                  {showConfirmPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <p className="mb-4 text-label text-(--text-muted)">Heslo musí mít alespoň 8 znaků.</p>

            {(message || passwordMismatch) && (
              <p className="mb-4 text-label text-(--status-error)" data-testid="reset-password-message">
                {passwordMismatch ? 'Hesla se neshodují.' : message}
              </p>
            )}

            <button type="submit" className="button-primary" style={{ width: '100%' }} disabled={submitting || passwordMismatch} data-testid="reset-password-submit-button">
              {submitting ? 'Ukládám nové heslo…' : 'Uložit nové heslo'}
            </button>
          </form>
        </>
      )}

      {viewState === 'success' && (
        <AuthStatus
          icon={CircleCheck}
          tone="success"
          title="Heslo změněno"
          actions={(
            <Button asChild size="lg" className="w-full">
              <Link to="/login" data-testid="reset-password-login-link">Přihlásit se</Link>
            </Button>
          )}
        >
          {message}
        </AuthStatus>
      )}

      {viewState === 'expired' && (
        <DeadEnd title="Odkaz vypršel nebo už byl použitý." text="Pošli si nový odkaz pro obnovu hesla na svůj e-mail." />
      )}

      {viewState === 'error' && <DeadEnd title="Reset hesla selhal" text={message} />}

      {viewState === 'no-token' && (
        <DeadEnd
          title="Chybí resetovací odkaz"
          text="Odkaz neobsahuje platný token. Pošli si nový odkaz pro obnovu hesla na svůj e-mail."
        />
      )}
    </AuthLayout>
  )
}