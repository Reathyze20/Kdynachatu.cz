/**
 * features/auth/AuthPage.tsx
 * Orchestruje přepínání mezi Login / Register / Forgot formuláři.
 * Pohled je v URL (`?view=register|forgot`), každé přepnutí je krok v historii a Zpět vrací o krok (#525).
 * E-mail se ověřuje jen odkazem (VerifyEmailPage na /verify), PIN formulář zrušen (#476).
 */
import { useSearchParams } from 'react-router-dom'
import { AuthBackdrop } from '@/components/layout/AuthLayout'
import { ForgotPasswordForm } from './ForgotPasswordForm'
import { LoginForm } from './LoginForm'
import { RegisterForm } from './RegisterForm'
import { useCabinSignup } from './hooks/useCabinSignup'
import { useDemoAccounts } from './hooks/useDemoAccounts'

type AuthView = 'login' | 'register' | 'forgot'

export function AuthPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { signupEnabled } = useCabinSignup()
  const demoAccounts = useDemoAccounts()
  const requested = searchParams.get('view')
  // Registrace jen když jde chatu založit, jinak (i během načítání stavu) přihlášení.
  const view: AuthView = requested === 'forgot' || (requested === 'register' && signupEnabled) ? requested : 'login'

  // Ostatní parametry (`?redirect=`) zůstávají, aby přihlášení po návratu vedlo tam, kam uživatel mířil.
  function setView(next: AuthView) {
    setSearchParams((params) => {
      const updated = new URLSearchParams(params)
      if (next === 'login') updated.delete('view')
      else updated.set('view', next)
      return updated
    })
  }

  return (
    <AuthBackdrop data-testid="auth-page" data-auth-view={view}>
      {view === 'login' && (
        <LoginForm
          onShowForgotPassword={() => setView('forgot')}
          onShowRegister={signupEnabled ? () => setView('register') : undefined}
          demoAccounts={demoAccounts}
        />
      )}
      {view === 'register' && (
        <RegisterForm
          onShowLogin={() => setView('login')}
        />
      )}
      {view === 'forgot' && (
        <ForgotPasswordForm onShowLogin={() => setView('login')} />
      )}
    </AuthBackdrop>
  )
}
