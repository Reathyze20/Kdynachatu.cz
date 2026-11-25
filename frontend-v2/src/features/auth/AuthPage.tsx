/**
 * features/auth/AuthPage.tsx
 * Orchestruje přepínání mezi Login / Register / Forgot formuláři.
 * E-mail se ověřuje jen odkazem (VerifyEmailPage na /verify), PIN formulář zrušen (#476).
 */
import { useState } from 'react'
import { ForgotPasswordForm } from './ForgotPasswordForm'
import { LoginForm } from './LoginForm'
import { RegisterForm } from './RegisterForm'
import { useCabinSignup } from './hooks/useCabinSignup'
import { useDemoAccounts } from './hooks/useDemoAccounts'

type AuthView = 'login' | 'register' | 'forgot'

export function AuthPage() {
  const [view, setView] = useState<AuthView>('login')
  const { signupEnabled } = useCabinSignup()
  const demoAccounts = useDemoAccounts()

  return (
    <div className="app-wrapper photo-backdrop" data-testid="auth-page" data-auth-view={view}>
      {view === 'login' && (
        <LoginForm
          onShowForgotPassword={() => setView('forgot')}
          onShowRegister={signupEnabled ? () => setView('register') : undefined}
          demoAccounts={demoAccounts}
        />
      )}
      {view === 'register' && signupEnabled && (
        <RegisterForm
          onShowLogin={() => setView('login')}
        />
      )}
      {view === 'forgot' && (
        <ForgotPasswordForm onShowLogin={() => setView('login')} />
      )}
    </div>
  )
}
