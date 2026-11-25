/**
 * features/onboarding/OnboardingPage.tsx
 */
import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useLogout } from '@/hooks/useLogout'
import { apiClient } from '@/api/client'
import { showToast } from '@/lib/toast'
import { useCabinSignup } from '@/features/auth/hooks/useCabinSignup'
import '@/styles/onboarding.css'

interface CreateCabinResponse {
  token: string
  cabinId: string
  cabinName: string
  userId: string
  username: string
  role: string
  animalIcon: string | null
  isSuperAdmin?: boolean
}

interface RefreshTokenResponse {
  token: string
  cabinId: string | null
  userId: string
  username: string
  role: string
  animalIcon: string | null
  isSuperAdmin?: boolean
}

// Člen, který už chatu má, na onboardingu nemá co dělat (#500).
export default function OnboardingPage() {
  const { user } = useAuth()
  if (user?.cabinId) return <Navigate to="/dashboard" replace />
  return <CreateCabinOnboarding />
}

function CreateCabinOnboarding() {
  const { login, user } = useAuth()
  const logoutThisDevice = useLogout()
  const navigate = useNavigate()
  const nameRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nameInvalid, setNameInvalid] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const { signupEnabled, isLoading: signupLoading } = useCabinSignup()

  useEffect(() => {
    let cancelled = false
    async function checkForAssignedCabin() {
      try {
        // Auth routy visí přímo pod /api, tedy GET /api/refresh-token (#500).
        const res = await apiClient.get<RefreshTokenResponse>('/refresh-token')
        if (cancelled) return
        
        if (res.data.cabinId) {
          login({
            token: res.data.token,
            username: res.data.username,
            userId: res.data.userId,
            role: res.data.role,
            animalIcon: res.data.animalIcon,
            cabinId: res.data.cabinId,
            isSuperAdmin: res.data.isSuperAdmin,
            remember: !!localStorage.getItem('authToken'),
          })
          showToast('Chata přiřazena.', 'info')
          navigate('/dashboard', { replace: true })
          return
        }
      } catch (error) {
        void error
      } finally {
        if (!cancelled) setChecking(false)
      }
    }
    checkForAssignedCabin()
    return () => { cancelled = true }
  }, [login, navigate, retryCount])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = nameRef.current?.value.trim() ?? ''
    if (name.length < 2) {
      setError('Název chaty musí mít alespoň 2 znaky.')
      setNameInvalid(true)
      return
    }
    setError(null)
    setNameInvalid(false)
    setLoading(true)
    try {
      const res = await apiClient.post<CreateCabinResponse>('/cabin/create', { name })
      const data = res.data
      login({
        token: data.token,
        username: data.username,
        userId: data.userId,
        role: data.role,
        animalIcon: data.animalIcon,
        cabinId: data.cabinId,
        isSuperAdmin: data.isSuperAdmin,
        remember: !!localStorage.getItem('authToken'),
      })
      showToast('Chata vytvořena.', 'success')
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Chatu se nepodařilo vytvořit. Zkus to znovu.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  if (checking || signupLoading) {
    return (
      <div className="onboarding-page" data-testid="onboarding-page" data-onboarding-state="checking">
        <div className="onboarding-card card" style={{ textAlign: 'center' }}>
          <div className="spinner" />
          <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Kontroluji přiřazení k chatě…</p>
        </div>
      </div>
    )
  }

  function handleRetryCheck() {
    setChecking(true)
    setRetryCount((c) => c + 1)
  }

  return (
    <div className="onboarding-page" data-testid="onboarding-page" data-onboarding-state="ready">
      <div className="onboarding-card card">
        <div className="auth-brand">
          <img src="/logo-icon.svg" alt="Logo" className="auth-logo-icon" />
          <h1 className="auth-brand-text">Kdy na chatu</h1>
        </div>
        {signupEnabled ? (
          <>
            <h2 className="onboarding-title">Vytvoř svůj prostor</h2>
            <p className="auth-subtitle">
              Vítej{user?.username ? `, ${user.username}` : ''}! Pojmenuj svou chatu.
            </p>
            <form onSubmit={handleSubmit} noValidate data-testid="onboarding-form">
              <div className="form-group">
                <label htmlFor="cabin-name">Název chaty</label>
                <input ref={nameRef} id="cabin-name" type="text" placeholder="např. Chata U Lesa" maxLength={100} autoFocus autoComplete="off" required aria-invalid={nameInvalid || undefined} aria-describedby={error ? 'onboarding-error' : undefined} data-testid="onboarding-cabin-name-input" />
              </div>
              {error && <p id="onboarding-error" className="error-message show" role="alert" data-testid="onboarding-error-message">{error}</p>}
              <button type="submit" className="button-primary" style={{ width: '100%' }} disabled={loading} data-testid="onboarding-submit-button">
                {loading ? 'Vytvářím…' : 'Vytvořit chatu'}
              </button>
            </form>
            <p className="onboarding-hint">Název chaty můžeš kdykoli změnit v nastavení.</p>
          </>
        ) : (
          <div data-testid="onboarding-invite-only">
            <h2 className="onboarding-title">Do chaty se vstupuje přes pozvánku</h2>
            <p className="auth-subtitle">
              Vítej{user?.username ? `, ${user.username}` : ''}! Nové chaty teď zakládat nejde,
              do chaty tě přidá její správce pozvánkou.
            </p>
          </div>
        )}

        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Pozval tě někdo do existující chaty? Až tě správce přidá, klepni na Zkusit znovu. Jinak ho požádej o novou pozvánku.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button 
              type="button" 
              onClick={handleRetryCheck}
              className="button-secondary"
              style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
              data-testid="onboarding-retry-button"
            >
              Zkusit znovu
            </button>
            <button 
              type="button" 
              onClick={logoutThisDevice}
              className="button-secondary"
              style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
              data-testid="onboarding-logout-button"
            >
              Odhlásit se
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
