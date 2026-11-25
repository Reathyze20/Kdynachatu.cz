import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
// Skutečné styly appky: hláška musí být vidět i s globálním CSS (`.error-message` ho dřív skrývalo).
import '@/index.css'
import { apiClient } from '@/api/client'
import { authApi } from '@/api/auth'
import { AuthPage } from '@/features/auth/AuthPage'
import OnboardingPage from '@/features/onboarding/OnboardingPage'
import { ProfileDrawer } from '@/components/layout/ProfileDrawer'

// #498: chyby formulářů na přihlašovacích obrazovkách a v profilu jsou vidět, čtečka je přečte (role="alert")
// a prázdné povinné pole se označí hláškou u pole.

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    login: vi.fn(), logout: vi.fn(), updateAnimalIcon: vi.fn(), isAdmin: false, isSuperAdmin: false, token: 'token',
    user: { userId: 'u-1', username: 'Jana', role: 'user', animalIcon: null, cabinId: null, isSuperAdmin: false },
  }),
}))

type ApiResult = ReturnType<typeof apiClient.get>

function mockGet() {
  vi.spyOn(apiClient, 'get').mockImplementation((url: string) => {
    if (url === '/signup-status') return Promise.resolve({ data: { cabinSignupEnabled: true } }) as ApiResult
    if (url === '/demo-accounts') return Promise.resolve({ data: { accounts: [] } }) as ApiResult
    if (url === '/auth/refresh-token') {
      return Promise.resolve({
        data: { token: 't', cabinId: null, userId: 'u-1', username: 'Jana', role: 'user', animalIcon: null },
      }) as ApiResult
    }
    return Promise.resolve({ data: { email: 'jana@example.test', color: '#5d9b62', animalIcon: null } }) as ApiResult
  })
}

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { response: { status, data: { message } } })
}

function renderPage(page: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Najde hlášku s `role="alert"` a daným textem a ověří, že není skrytá (display, visibility ani opacity). */
async function expectVisibleAlert(text: string) {
  const alert = await waitFor(() => {
    const match = screen.queryAllByRole('alert').find((el) => el.textContent?.includes(text))
    expect(match, `role="alert" s textem „${text}“`).toBeDefined()
    return match!
  })
  expect(alert).toBeVisible()
  return alert
}

describe('chyby formulářů jsou vidět (#498)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockGet()
  })

  describe('přihlášení', () => {
    async function submitLogin(username: string, password: string) {
      const user = userEvent.setup()
      renderPage(<AuthPage />)
      const usernameInput = await screen.findByTestId('login-username-input')
      if (username) await user.type(usernameInput, username)
      if (password) await user.type(screen.getByTestId('login-password-input'), password)
      await user.click(screen.getByTestId('login-submit-button'))
    }

    it('špatné heslo ukáže viditelnou hlášku s role="alert"', async () => {
      vi.spyOn(apiClient, 'post').mockRejectedValue(httpError(401, 'Nesprávné jméno nebo heslo.'))
      await submitLogin('jana', 'spatne-heslo')
      const alert = await expectVisibleAlert('Nesprávné jméno nebo heslo.')
      expect(alert).toHaveAttribute('data-testid', 'login-error-message')
    })

    it('bez sítě ukáže viditelnou hlášku, ne jen toast', async () => {
      vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('Network Error'))
      await submitLogin('jana', 'heslo-123')
      await expectVisibleAlert('Chyba sítě')
    })

    it('prázdný formulář neodešle a označí obě pole hláškou u pole', async () => {
      const post = vi.spyOn(apiClient, 'post')
      await submitLogin('', '')

      const usernameInput = screen.getByTestId('login-username-input')
      const passwordInput = screen.getByTestId('login-password-input')
      const usernameError = await expectVisibleAlert('Vyplň uživatelské jméno.')
      const passwordError = await expectVisibleAlert('Vyplň heslo.')
      expect(usernameInput).toHaveAttribute('aria-invalid', 'true')
      expect(passwordInput).toHaveAttribute('aria-invalid', 'true')
      expect(usernameInput.getAttribute('aria-describedby')).toContain(usernameError.id)
      expect(passwordInput.getAttribute('aria-describedby')).toContain(passwordError.id)
      expect(post).not.toHaveBeenCalled()
    })

    it('vyplněné jméno a prázdné heslo označí jen heslo', async () => {
      const post = vi.spyOn(apiClient, 'post')
      await submitLogin('jana', '')
      await expectVisibleAlert('Vyplň heslo.')
      expect(screen.queryByText('Vyplň uživatelské jméno.')).not.toBeInTheDocument()
      expect(screen.getByTestId('login-username-input')).not.toHaveAttribute('aria-invalid')
      expect(post).not.toHaveBeenCalled()
    })
  })

  describe('zapomenuté heslo', () => {
    async function openForgotPassword() {
      const user = userEvent.setup()
      renderPage(<AuthPage />)
      await user.click(await screen.findByTestId('login-forgot-password-link'))
      return user
    }

    it('chyba serveru je vidět s role="alert"', async () => {
      vi.spyOn(apiClient, 'post').mockRejectedValue(httpError(500, 'Žádost se nepodařilo odeslat. Zkus to znovu.'))
      const user = await openForgotPassword()
      await user.type(screen.getByTestId('forgot-password-identifier-input'), 'jana@example.test')
      await user.click(screen.getByTestId('forgot-password-submit-button'))
      await expectVisibleAlert('Žádost se nepodařilo odeslat. Zkus to znovu.')
    })

    it('prázdné pole ukáže viditelnou hlášku a označí pole', async () => {
      const post = vi.spyOn(apiClient, 'post')
      const user = await openForgotPassword()
      await user.click(screen.getByTestId('forgot-password-submit-button'))
      await expectVisibleAlert('Zadej e-mail nebo uživatelské jméno.')
      expect(screen.getByTestId('forgot-password-identifier-input')).toHaveAttribute('aria-invalid', 'true')
      expect(post).not.toHaveBeenCalled()
    })
  })

  describe('onboarding', () => {
    it('krátký název chaty ukáže viditelnou hlášku u pole', async () => {
      const user = userEvent.setup()
      renderPage(<OnboardingPage />)
      await user.click(await screen.findByTestId('onboarding-submit-button'))
      await expectVisibleAlert('Název chaty musí mít alespoň 2 znaky.')
      expect(screen.getByTestId('onboarding-cabin-name-input')).toHaveAttribute('aria-invalid', 'true')
    })

    it('chyba serveru je vidět s role="alert"', async () => {
      vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('Network Error'))
      const user = userEvent.setup()
      renderPage(<OnboardingPage />)
      await user.type(await screen.findByTestId('onboarding-cabin-name-input'), 'Chata U Lesa')
      await user.click(screen.getByTestId('onboarding-submit-button'))
      await expectVisibleAlert('Chatu se nepodařilo vytvořit. Zkus to znovu.')
    })
  })

  describe('změna e-mailu v profilu', () => {
    async function setupProfile() {
      const user = userEvent.setup()
      renderPage(<ProfileDrawer isOpen onClose={vi.fn()} />)
      const emailInput = screen.getByTestId('profile-email-input')
      await waitFor(() => expect(emailInput).toHaveValue('jana@example.test'))
      await user.clear(emailInput)
      return { user, emailInput }
    }

    it('špatný formát e-mailu ukáže viditelnou hlášku s role="alert"', async () => {
      const { user, emailInput } = await setupProfile()
      await user.type(emailInput, 'neplatny-email')
      await user.click(screen.getByTestId('profile-change-email-button'))
      await expectVisibleAlert('Zadej e-mail ve správném formátu.')
      expect(emailInput).toHaveAttribute('aria-invalid', 'true')
    })

    it('selhání změny na serveru je vidět s role="alert"', async () => {
      vi.spyOn(authApi, 'changeMyEmail').mockRejectedValue(httpError(500, 'boom'))
      const { user, emailInput } = await setupProfile()
      await user.type(emailInput, 'nova@example.test')
      await user.type(screen.getByTestId('profile-email-password-input'), 'heslo-123')
      await user.click(screen.getByTestId('profile-change-email-button'))
      await expectVisibleAlert('E-mail se nepodařilo změnit. Zkus to znovu.')
    })

    it('špatné heslo je vidět u pole s role="alert"', async () => {
      vi.spyOn(authApi, 'changeMyEmail').mockRejectedValue(httpError(403, 'Nesprávné heslo. Zkus to znovu.'))
      const { user, emailInput } = await setupProfile()
      await user.type(emailInput, 'nova@example.test')
      await user.type(screen.getByTestId('profile-email-password-input'), 'spatne')
      await user.click(screen.getByTestId('profile-change-email-button'))
      await expectVisibleAlert('Nesprávné heslo. Zkus to znovu.')
    })
  })
})
