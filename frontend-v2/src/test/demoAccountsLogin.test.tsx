import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { AuthPage } from '@/features/auth/AuthPage'

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn() }),
}))

const STAGING_ACCOUNTS = [
  { username: 'demo-spravce', label: 'Správce', role: 'admin', password: 'Admin-heslo-123' },
  { username: 'demo-jana', label: 'Jana', role: 'user', password: 'Clen-heslo-4567' },
]

function mockApi(accounts: unknown) {
  vi.spyOn(apiClient, 'get').mockImplementation((url: string) => {
    if (url === '/demo-accounts') {
      return Promise.resolve({ data: { accounts } }) as ReturnType<typeof apiClient.get>
    }
    return Promise.resolve({ data: { cabinSignupEnabled: false } }) as ReturnType<typeof apiClient.get>
  })
}

function renderAuthPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('rychlé přihlášení demo účty (staging)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('click on a demo name fills username and password without submitting', async () => {
    mockApi(STAGING_ACCOUNTS)
    const postSpy = vi.spyOn(apiClient, 'post')
    renderAuthPage()

    await userEvent.click(await screen.findByRole('button', { name: /Jana/ }))

    expect(screen.getByTestId('login-username-input')).toHaveValue('demo-jana')
    expect(screen.getByTestId('login-password-input')).toHaveValue('Clen-heslo-4567')
    expect(postSpy).not.toHaveBeenCalled()
  })

  it('lists every demo account by name', async () => {
    mockApi(STAGING_ACCOUNTS)
    renderAuthPage()

    expect(await screen.findByRole('button', { name: /Správce/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Jana/ })).toBeInTheDocument()
  })

  it('outside staging (empty list) shows no demo section', async () => {
    mockApi([])
    renderAuthPage()

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/demo-accounts'))
    expect(screen.getByTestId('login-form')).toBeInTheDocument()
    expect(screen.queryByTestId('login-demo-accounts')).not.toBeInTheDocument()
  })
})
