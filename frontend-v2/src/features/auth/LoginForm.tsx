/**
 * features/auth/LoginForm.tsx
 * Překlad: #login-section z index.html + bindLoginForm() z main.ts
 */
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { apiClient } from '@/api/client'
import { showToast } from '@/lib/toast'
import { Eye, EyeOff } from 'lucide-react'
import type { DemoAccount } from '@/api/auth'

interface LoginFormProps {
  onShowForgotPassword: () => void
  /** Bez handleru (registrace chat uzavřená) se odkaz na registraci nezobrazí. */
  onShowRegister?: () => void
  /** Fiktivní účty ze seedu – backend je posílá jen na stagingu; prázdné = sekce se nezobrazí. */
  demoAccounts?: DemoAccount[]
}

interface LoginResponse {
  token: string
  username: string
  userId: string
  role: string
  animalIcon: string | null
  cabinId: string | null
  isSuperAdmin?: boolean
}

interface AuthErrorResponse {
  message?: string
  error?: string
  code?: string
  needsVerification?: boolean
}

export function LoginForm({ onShowForgotPassword, onShowRegister, demoAccounts = [] }: LoginFormProps) {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<{ text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  function fillDemoAccount(account: DemoAccount) {
    usernameRef.current!.value = account.username
    passwordRef.current!.value = account.password
    setError(null)
    passwordRef.current!.focus()
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const username = usernameRef.current!.value.trim()
    const password = passwordRef.current!.value
    if (!username || !password) return

    setError(null)
    setLoading(true)

    try {
      const { data } = await apiClient.post<LoginResponse>('/login', { username, password })

      login({
        token: data.token,
        username: data.username,
        userId: String(data.userId),
        role: data.role,
        animalIcon: data.animalIcon,
        cabinId: data.cabinId || null,
        isSuperAdmin: data.isSuperAdmin,
        remember: rememberMe,
      })
      showToast('Přihlášení úspěšné', 'success')
      navigate(data.cabinId ? '/dashboard' : data.isSuperAdmin ? '/superadmin' : '/onboarding', { replace: true })
    } catch (err: unknown) {
      const data = (err as { response?: { data?: AuthErrorResponse } }).response?.data

      if (data?.needsVerification) {
        const msg = data.message || 'Nejprve ověř svůj e-mail.'
        setError({ text: msg })
        showToast(msg, 'info')
        return
      }

      const msg = data?.message || data?.error || 'Chyba sítě – zkus to znovu'
      setError({ text: msg })
      if (data) showToast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div id="login-section" className="login-container card" data-testid="login-form-view">
      <div className="auth-brand">
        <img src="/logo-icon.svg" alt="Logo" className="auth-logo-icon" />
        <h1 className="auth-brand-text">Kdy na chatu</h1>
      </div>
      <p className="auth-subtitle">Přihlas se ke svému účtu</p>

      {/* Nad formulářem: po kliknutí na jméno je tlačítko „Přihlásit se“ hned pod ním (staging tester na mobilu). */}
      {demoAccounts.length > 0 && (
        <div className="demo-accounts" data-testid="login-demo-accounts">
          <p className="demo-accounts-title">Ahoj! Tohle je zkušební verze aplikace.</p>
          <ol className="demo-accounts-steps">
            <li>Klikni na své jméno.</li>
            <li>Klikni na Přihlásit se.</li>
          </ol>
          <div className="demo-accounts-list">
            {demoAccounts.map((account) => (
              <button
                key={account.username}
                type="button"
                className="demo-account-chip"
                onClick={() => fillDemoAccount(account)}
                data-testid={`login-demo-account-${account.username}`}
              >
                {account.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <form id="login-form" noValidate onSubmit={handleSubmit} data-testid="login-form">
        <div className="form-group">
          <label htmlFor="username">Uživatelské jméno:</label>
          <input
            type="text"
            id="username"
            name="username"
            maxLength={50}
            autoComplete="username"
            required
            ref={usernameRef}
            data-testid="login-username-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="login-password">Heslo:</label>
          <div className="input-eye-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              id="login-password"
              name="password"
              maxLength={100}
              autoComplete="current-password"
              required
              ref={passwordRef}
              data-testid="login-password-input"
            />
            <button
              type="button"
              className="toggle-password"
              id="toggle-password-login"
              aria-label={showPassword ? 'Skrýt heslo' : 'Zobrazit heslo'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="form-group remember-me-group">
          <label className="remember-me-label">
            <input
              type="checkbox"
              id="remember-me"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              data-testid="login-remember-checkbox"
            />
            <span>Zapamatovat si mě</span>
          </label>
        </div>

        <button
          type="submit"
          className="button-primary"
          style={{ width: '100%' }}
          disabled={loading}
          data-testid="login-submit-button"
        >
          {loading ? 'Přihlašuji…' : 'Přihlásit se'}
        </button>

        <p className="toggle-form-text" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); onShowForgotPassword() }}
            data-testid="login-forgot-password-link"
          >
            Zapomenuté heslo?
          </a>
        </p>

        {error && (
          <p
            id="login-error"
            className="error-message"
            style={{ display: 'block' }}
            data-testid="login-error-message"
          >
            {error.text}
          </p>
        )}
      </form>

      {onShowRegister && (
        <p className="toggle-form-text">
          Ještě nemáš účet?{' '}
          <a
            href="#"
            id="show-register-link"
            onClick={(e) => { e.preventDefault(); onShowRegister() }}
            data-testid="login-show-register-link"
          >
            Zaregistruj se
          </a>
        </p>
      )}
    </div>
  )
}
