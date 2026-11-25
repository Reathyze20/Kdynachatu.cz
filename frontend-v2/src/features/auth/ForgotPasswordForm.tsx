import { useRef, useState } from 'react'
import { apiClient } from '@/api/client'
import { showToast } from '@/lib/toast'

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
      const text = data?.message || 'Nepodařilo se odeslat žádost. Zkus to znovu.'
      setMessage({ text, type: 'error' })
      showToast(text, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div id="forgot-password-section" className="login-container card" data-testid="forgot-password-form-view">
      <div className="auth-brand">
        <img src="/logo-icon.svg" alt="Logo" className="auth-logo-icon" />
        <h1 className="auth-brand-text">Kdy na chatu</h1>
      </div>
      <p className="auth-subtitle">Obnova hesla</p>

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

        <p style={{ color: 'var(--color-text-light)', fontSize: '0.95rem', lineHeight: 1.5, marginTop: 0 }}>
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
            style={{ marginTop: '.75rem', color: 'var(--color-success)' }}
            data-testid="forgot-password-message"
          >
            {message.text}
          </p>
        )}
      </form>

      <p className="toggle-form-text">
        <a href="#" onClick={(e) => { e.preventDefault(); onShowLogin() }} data-testid="forgot-password-back-link">
          ← Zpět na přihlášení
        </a>
      </p>
    </div>
  )
}