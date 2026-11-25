/**
 * features/auth/RegisterForm.tsx
 * Překlad: #register-section z index.html + bindRegisterForm() z main.ts
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { showToast } from '@/lib/toast'
import { ArrowLeft, Eye, EyeOff, Mail } from 'lucide-react'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { MEMBER_PALETTE } from '@/lib/memberPalette'
import type { MunicipalityOption } from '@/api/municipalities'
import { MunicipalityPicker } from '@/components/shared/MunicipalityPicker'
import { tooManyAttemptsMessage } from './tooManyAttempts'
import { SignupConsent } from '@/components/shared/SignupConsent'

interface RegisterFormProps {
  onShowLogin: () => void
}

interface RegisterResponse {
  message?: string
  error?: string
  requiresVerification?: boolean
  testToken?: string
}

export function RegisterForm({ onShowLogin }: RegisterFormProps) {
  const navigate = useNavigate()
  const [selectedColor, setSelectedColor] = useState(MEMBER_PALETTE[0].hex)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [emailSent, setEmailSent] = useState<string | null>(null) // email address → show confirmation

  const cabinNameRef = useRef<HTMLInputElement>(null)
  const [municipality, setMunicipality] = useState<MunicipalityOption | null>(null)
  const usernameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  function showMsg(text: string, type: 'success' | 'error' | 'warning') {
    setMessage({ text, type })
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const cabinName = cabinNameRef.current!.value.trim()
    const username = usernameRef.current!.value.trim()
    const email = emailRef.current!.value.trim()
    const password = passwordRef.current!.value

    if (cabinName.length < 2) {
      showMsg('Název chaty musí mít alespoň 2 znaky.', 'error')
      return
    }
    if (!municipality) {
      showMsg('Vyber nejbližší obec ze seznamu.', 'error')
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      const { data } = await apiClient.post<RegisterResponse>('/register', {
        cabinName,
        municipalityCode: municipality.code,
        username,
        password,
        color: selectedColor,
        email,
      })

      // Token-based flow: e-mail pro aktivaci byl odeslán
      if (data.requiresVerification) {
        if (data.testToken) {
          showToast('E-mail se nepodařilo odeslat. Otevírám nouzový aktivační odkaz.', 'info')
          timerRef.current = setTimeout(() => navigate(`/verify?token=${data.testToken}`, { replace: true }), 1500)
          return
        }
        // Standardní flow — e-mail odeslán
        setEmailSent(email)
        showToast('Registrace dokončena. Zkontroluj e-mail.', 'success')
        return
      }

      showMsg('Registrace úspěšná, přihlas se.', 'success')
      timerRef.current = setTimeout(onShowLogin, 1500)
    } catch (err: unknown) {
      const data = (err as { response?: { data?: RegisterResponse } }).response?.data
      const msg = tooManyAttemptsMessage(err, 'Moc pokusů za sebou.') || data?.message || data?.error || 'Chyba sítě'
      showMsg(msg, 'error')
      if (data) showToast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  // E-mail byl odeslán — zobrazíme potvrzovací screen (stejné jako v originálu)
  if (emailSent) {
    return (
      <AuthLayout id="register-section" className="text-center" data-testid="register-email-sent-screen">
        <Mail size={24} aria-hidden="true" className="mx-auto mb-3 text-primary" />
        <h2 className="mb-2 text-card-title">Zkontroluj svůj e-mail</h2>
        <p className="mb-6 text-body text-(--text-muted)">
          Děkujeme za registraci.<br />
          Poslali jsme ti e-mail s odkazem pro aktivaci účtu na adresu <strong>{emailSent}</strong>.
        </p>
        <a
          href="#"
          className="inline-flex items-center gap-2 font-semibold text-primary underline"
          onClick={(e) => { e.preventDefault(); onShowLogin() }}
          data-testid="register-back-to-login-link"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Zpět na přihlášení
        </a>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout id="register-section" subtitle="Vytvoř prostor pro svou chatu" data-testid="register-form-view">

      <form id="register-form" noValidate onSubmit={handleSubmit} data-testid="register-form">
        <div className="form-section-label">Tvoje chata</div>

        <div className="form-group">
          <label htmlFor="register-cabin-name">Název chaty</label>
          <input
            type="text" id="register-cabin-name" name="cabinName" maxLength={100}
            autoComplete="off" placeholder="např. Chalupa pod Kletí"
            required minLength={2} ref={cabinNameRef}
            data-testid="register-cabin-name-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="register-municipality">Nejbližší obec (pro počasí)</label>
          <MunicipalityPicker
            id="register-municipality" value={municipality} onChange={setMunicipality}
            placeholder="např. Třebenice" required testId="register-municipality-input"
          />
        </div>

        <div className="form-section-label">Tvoje údaje</div>

        <div className="form-group">
          <label htmlFor="register-username">Uživatelské jméno</label>
          <input
            type="text" id="register-username" name="username" maxLength={50}
            autoComplete="username" required minLength={2} ref={usernameRef}
            data-testid="register-username-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="register-email">E-mail</label>
          <input
            type="email" id="register-email" name="email" maxLength={255}
            autoComplete="email" required ref={emailRef}
            data-testid="register-email-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="register-password">Heslo (min. 8 znaků)</label>
          <div className="input-eye-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              id="register-password" name="password" maxLength={100}
              autoComplete="new-password" required minLength={8} ref={passwordRef}
              data-testid="register-password-input"
            />
            <button
              type="button"
              className="toggle-password"
              id="toggle-password-register"
              aria-label={showPassword ? 'Skrýt heslo' : 'Zobrazit heslo'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Barva profilu</label>
          <div className="color-picker-swatches" id="register-color-swatches" data-testid="register-color-swatches">
            {MEMBER_PALETTE.map(({ hex, name }) => (
              <button
                key={hex}
                type="button"
                className={`color-swatch${selectedColor === hex ? ' active' : ''}`}
                style={{ backgroundColor: hex }}
                data-color={hex}
                aria-label={`Barva ${name}`}
                aria-pressed={selectedColor === hex}
                title={name}
                data-testid={`register-color-swatch-${hex.slice(1).toLowerCase()}`}
                onClick={() => setSelectedColor(hex)}
              />
            ))}
          </div>
          <input type="hidden" name="color" id="register-color" value={selectedColor} />
        </div>

        <SignupConsent />

        <button
          type="submit"
          className="button-primary"
          style={{ width: '100%' }}
          disabled={loading}
          data-testid="register-submit-button"
        >
          {loading ? 'Zakládám chatu…' : 'Založit chatu a registrovat'}
        </button>

        {message && (
          <p
            id="register-message"
            className="message"
            style={{
              marginTop: '.5rem',
              color: message.type === 'error'
                ? 'var(--status-error)'
                : message.type === 'warning'
                  ? 'var(--status-warning)'
                  : 'var(--status-success)',
              display: 'block',
            }}
            data-testid="register-message"
          >
            {message.text}
          </p>
        )}
      </form>

      <p className="toggle-form-text">
        Už máš účet?{' '}
        <a
          href="#"
          id="show-login-link"
          onClick={(e) => { e.preventDefault(); onShowLogin() }}
          data-testid="register-show-login-link"
        >
          Přihlas se
        </a>
      </p>
    </AuthLayout>
  )
}
