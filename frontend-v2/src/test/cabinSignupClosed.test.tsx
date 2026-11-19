import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { apiClient } from '@/api/client'
import { AuthPage } from '@/features/auth/AuthPage'
import OnboardingPage from '@/features/onboarding/OnboardingPage'

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn(), logout: vi.fn(), user: { username: 'Jana' } }),
}))

function mockApi(cabinSignupEnabled: boolean) {
  vi.spyOn(apiClient, 'get').mockImplementation((url: string) => {
    if (url === '/signup-status') {
      return Promise.resolve({ data: { cabinSignupEnabled } }) as ReturnType<typeof apiClient.get>
    }
    // Onboarding se nejdřív ptá, jestli uživatel mezitím nedostal chatu – nedostal.
    return Promise.resolve({
      data: { token: 't', cabinId: null, userId: 'u1', username: 'Jana', role: 'member', animalIcon: null },
    }) as ReturnType<typeof apiClient.get>
  })
}

function renderPage(page: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('cabin signup closed (CABIN_SIGNUP_ENABLED)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('login screen offers registration when signup is open', async () => {
    mockApi(true)
    renderPage(<AuthPage />)
    expect(await screen.findByTestId('login-show-register-link')).toBeInTheDocument()
  })

  it('login screen hides registration when signup is closed', async () => {
    mockApi(false)
    renderPage(<AuthPage />)
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/signup-status'))
    expect(screen.getByTestId('login-form')).toBeInTheDocument()
    expect(screen.queryByText(/Zaregistrujte se/)).not.toBeInTheDocument()
  })

  it('onboarding offers cabin creation when signup is open', async () => {
    mockApi(true)
    renderPage(<OnboardingPage />)
    expect(await screen.findByTestId('onboarding-form')).toBeInTheDocument()
    expect(screen.queryByTestId('onboarding-invite-only')).not.toBeInTheDocument()
  })

  it('onboarding explains invite-only access when signup is closed', async () => {
    mockApi(false)
    renderPage(<OnboardingPage />)
    expect(await screen.findByTestId('onboarding-invite-only')).toHaveTextContent(/pozvánk/)
    expect(screen.queryByTestId('onboarding-form')).not.toBeInTheDocument()
    expect(screen.queryByTestId('onboarding-submit-button')).not.toBeInTheDocument()
  })
})
