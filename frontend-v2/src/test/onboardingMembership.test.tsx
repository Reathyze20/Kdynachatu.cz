import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { apiClient } from '@/api/client'
import OnboardingPage from '@/features/onboarding/OnboardingPage'

// #500: onboarding pozná, že uživatele mezitím přidali do chaty, a člena s chatou pošle na Přehled.

const auth = vi.hoisted(() => ({
  login: vi.fn(),
  user: { userId: 'u-1', username: 'Jana', role: 'user', animalIcon: null, cabinId: null as string | null },
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: auth.login, logout: vi.fn(), user: auth.user }),
}))

type ApiResult = ReturnType<typeof apiClient.get>

function refreshResponse(cabinId: string | null) {
  return { data: { token: 'new-token', cabinId, userId: 'u-1', username: 'Jana', role: 'user', animalIcon: null } }
}

/** Mockuje API: `/refresh-token` vrací postupně zadaná cabinId, neznámé cesty skončí 404 jako na serveru. */
function mockApi(...cabinIds: (string | null)[]) {
  let call = 0
  vi.spyOn(apiClient, 'get').mockImplementation((url: string) => {
    if (url === '/signup-status') return Promise.resolve({ data: { cabinSignupEnabled: true } }) as ApiResult
    if (url === '/refresh-token') {
      const cabinId = cabinIds[Math.min(call++, cabinIds.length - 1)]
      return Promise.resolve(refreshResponse(cabinId)) as ApiResult
    }
    return Promise.reject(Object.assign(new Error('Not Found'), { response: { status: 404 } })) as ApiResult
  })
}

function renderOnboarding() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/onboarding']}>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/dashboard" element={<p data-testid="dashboard-stub">Přehled</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('onboarding – kontrola členství (#500)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    auth.login.mockReset()
    auth.user.cabinId = null
  })

  it('uživatele, kterého mezitím přidali do chaty, přihlásí s novým tokenem a pošle na Přehled', async () => {
    mockApi('cabin-1')
    renderOnboarding()

    expect(await screen.findByTestId('dashboard-stub')).toBeInTheDocument()
    expect(apiClient.get).toHaveBeenCalledWith('/refresh-token')
    expect(auth.login).toHaveBeenCalledWith(expect.objectContaining({ token: 'new-token', cabinId: 'cabin-1' }))
  })

  it('„Zkusit znovu“ zjistí přiřazení k chatě a pošle na Přehled', async () => {
    const user = userEvent.setup()
    mockApi(null, 'cabin-1')
    renderOnboarding()

    await user.click(await screen.findByTestId('onboarding-retry-button'))

    expect(await screen.findByTestId('dashboard-stub')).toBeInTheDocument()
    expect(auth.login).toHaveBeenCalledWith(expect.objectContaining({ cabinId: 'cabin-1' }))
  })

  it('uživatel bez chaty zůstane na onboardingu', async () => {
    mockApi(null)
    renderOnboarding()

    expect(await screen.findByTestId('onboarding-form')).toBeInTheDocument()
    expect(auth.login).not.toHaveBeenCalled()
  })

  it('přihlášeného člena s chatou pošle z /onboarding rovnou na Přehled', async () => {
    auth.user.cabinId = 'cabin-1'
    mockApi('cabin-1')
    renderOnboarding()

    expect(await screen.findByTestId('dashboard-stub')).toBeInTheDocument()
    expect(apiClient.get).not.toHaveBeenCalledWith('/refresh-token')
  })
})
