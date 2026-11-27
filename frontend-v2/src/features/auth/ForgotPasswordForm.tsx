import { useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { apiClient } from '@/api/client'
import { showToast } from '@/lib/toast'
import { tooManyAttemptsMessage } from './tooManyAttempts'

interface ForgotPasswordFormProps {
  onShowLogin: () => void
}

interface ForgotPasswordResponse {
  message?: string
}

export function ForgotPasswordForm({ onShowLogin }: ForgotPasswordFormProps) {
  const identifierRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [requestSent, setRequestSent] = useState(false)
  const [identifierInvalid, setIdentifierInvalid] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const identifier = identifierRef.current?.value.trim() ?? ''

    if (identifier.length < 2) {
      setMessage({ text: 'Zadej e-mail nebo uživatelské jméno.', type: 'error' })
      setIdentifierInvalid(true)
      identifierRef.current?.focus()
      return
    }

    setLoading(true)
    setMessage(null)
    setIdentifierInvalid(false)

    try {
      const { data } = await apiClient.post<ForgotPasswordResponse>('/forgot-password', { identifier })
      const text = data.message || 'Pokud účet existuje, poslali jsme ti e-mail s odkazem pro obnovu hesla.'
      setRequestSent(true)
      setMessage({ text, type: 'success' })
      showToast('Pokud účet existuje, poslali jsme e-mail pro obnovu hesla.', 'success')
    } catch (err: unknown) {
      const data = (err as { response?: { data?: ForgotPasswordResponse } }).response?.data
      const text = tooManyAttemptsMessage(err, 'Moc pokusů za sebou.')
        || data?.message || 'Nepodařilo se odeslat žádost. Zkus to znovu.'
      setMessage({ text, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout id="forgot-password-section" subtitle="Obnova hesla" data-testid="forgot-password-form-view">

      <form noValidate onSubmit={handleSubmit} data-testid="forgot-password-form">
        <div className="form-group">
          <label htmlFor="forgot-password-identifier">E-mail nebo uživatelské jméno</label>
          <input
            type="text"
            id="forgot-password-identifier"
            name="identifier"
            maxLength={255}
            autoComplete="username email"
            placeholder="např. jan@domena.cz nebo Honza"
            ref={identifierRef}
            disabled={loading || requestSent}
            aria-invalid={identifierInvalid || undefined}
            aria-describedby={message?.type === 'error' ? 'forgot-password-error' : undefined}
            data-testid="forgot-password-identifier-input"
          />
        </div>

        <p className="mb-4 text-label text-(--text-muted)">
          Obnova funguje jen pro účty, které mají nastavený e-mail. Pokud e-mail u účtu není, požádej správce chaty o změnu hesla.
        </p>

        <button type="submit" className="button-primary" style={{ width: '100%' }} disabled={loading || requestSent} data-testid="forgot-password-submit-button">
          {loading ? 'Odesílám odkaz…' : requestSent ? 'Odkaz jsme poslali' : 'Poslat odkaz pro obnovu'}
        </button>

        {message?.type === 'error' && (
          <p id="forgot-password-error" className="error-message show" role="alert" data-testid="forgot-password-message">
            {message.text}
          </p>
        )}
        {message?.type === 'success' && (
          <p
            className="message"
            role="status"
            style={{ marginTop: '.75rem', color: 'rgb(var(--ok))' }}
            data-testid="forgot-password-message"
          >
            {message.text}
          </p>
        )}
      </form>

      <p className="toggle-form-text">
        <a href="#" className="inline-flex items-center gap-2" onClick={(e) => { e.preventDefault(); onShowLogin() }} data-testid="forgot-password-back-link">
          <ArrowLeft size={16} aria-hidden="true" />
          Zpět na přihlášení
        </a>
      </p>
    </AuthLayout>
  )
}