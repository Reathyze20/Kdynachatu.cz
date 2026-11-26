/**
 * features/onboarding/OnboardingPage.tsx
 */
import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useLogout } from '@/hooks/useLogout'
import { LogoutPendingChangesDialog } from '@/components/layout/LogoutPendingChangesDialog'
import { apiClient } from '@/api/client'
import { showToast } from '@/lib/toast'
import { useCabinSignup } from '@/features/auth/hooks/useCabinSignup'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/button'

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
  const { requestLogout, pendingDialog } = useLogout()
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
      <AuthLayout data-testid="onboarding-page" data-onboarding-state="checking">
        <p role="status" className="text-center text-body text-(--text-muted)">Kontroluji přiřazení k chatě…</p>
      </AuthLayout>
    )
  }

  function handleRetryCheck() {
    setChecking(true)
    setRetryCount((c) => c + 1)
  }

  const welcome = `Vítej${user?.username ? `, ${user.username}` : ''}!`

  return (
    <AuthLayout data-testid="onboarding-page" data-onboarding-state="ready">
      {signupEnabled ? (
        <>
          <h2 className="mb-2 text-center text-card-title text-(--text-main)">Vytvoř svůj prostor</h2>
          <p className="mb-6 text-center text-body text-(--text-muted)">{welcome} Pojmenuj svou chatu.</p>
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
          <p className="mt-4 text-center text-label text-(--text-muted)">Název chaty můžeš kdykoli změnit v nastavení.</p>
        </>
      ) : (
        <div className="text-center" data-testid="onboarding-invite-only">
          <h2 className="mb-2 text-card-title text-(--text-main)">Do chaty se vstupuje přes pozvánku</h2>
          <p className="text-body text-(--text-muted)">
            {welcome} Nové chaty teď zakládat nejde, do chaty tě přidá její správce pozvánkou.
          </p>
        </div>
      )}

      <div className="mt-6 border-t border-rule-soft pt-6 text-center">
        <p className="mb-4 text-label text-(--text-muted)">
          Pozval tě někdo do existující chaty? Až tě správce přidá, klepni na Zkusit znovu. Jinak ho požádej o novou pozvánku.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" variant="secondary" onClick={handleRetryCheck} data-testid="onboarding-retry-button">
            Zkusit znovu
          </Button>
          <Button type="button" variant="secondary" onClick={requestLogout} data-testid="onboarding-logout-button">
            Odhlásit se
          </Button>
        </div>
        <LogoutPendingChangesDialog {...pendingDialog} />
      </div>
    </AuthLayout>
  )
}
