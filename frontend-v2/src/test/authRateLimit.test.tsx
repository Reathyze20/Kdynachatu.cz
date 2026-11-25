import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { apiClient } from '@/api/client'
import { AuthPage } from '@/features/auth/AuthPage'
import { RegisterForm } from '@/features/auth/RegisterForm'
import { tooManyAttemptsMessage } from '@/features/auth/tooManyAttempts'

// #499: na limit pokusů (HTTP 429) dostane člověk hlášku s časem, kdy to zkusit znovu, ne „Chyba sítě“.

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn(), logout: vi.fn(), isAdmin: false, token: null, user: null }),
}))

type ApiResult = ReturnType<typeof apiClient.get>

function mockGet() {
  vi.spyOn(apiClient, 'get').mockImplementation((url: string) => {
    if (url === '/signup-status') return Promise.resolve({ data: { cabinSignupEnabled: true } }) as ApiResult
    if (url === '/demo-accounts') return Promise.resolve({ data: { accounts: [] } }) as ApiResult
    if (url === '/municipalities') {
      return Promise.resolve({
        data: { municipalities: [{ code: 591866, name: 'Třebenice', district: 'Třebíč', region: 'Kraj Vysočina' }] },
      }) as ApiResult
    }
    return Promise.resolve({ data: {} }) as ApiResult
  })
}

/** 429 tak, jak ho vrací limitery (#499); `data` jde přepsat na holý řetězec ze starého limiteru nebo proxy. */
function tooManyRequests(retryAfterSeconds?: number, data: unknown = { message: 'Příliš mnoho pokusů.' }) {
  const headers = retryAfterSeconds === undefined ? {} : { 'retry-after': String(retryAfterSeconds) }
  return Object.assign(new Error('Request failed with status code 429'), { response: { status: 429, headers, data } })
}

function renderPage(page: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('tooManyAttemptsMessage', () => {
  it('ignores other errors than 429', () => {
    expect(tooManyAttemptsMessage({ response: { status: 401, data: {} } }, 'Moc pokusů.')).toBeNull()
    expect(tooManyAttemptsMessage(new Error('Network Error'), 'Moc pokusů.')).toBeNull()
  })

  it('rounds Retry-After up to whole minutes with Czech plural', () => {
    expect(tooManyAttemptsMessage(tooManyRequests(30), 'Moc pokusů.')).toBe('Moc pokusů. Zkus to znovu za 1 minutu.')
    expect(tooManyAttemptsMessage(tooManyRequests(150), 'Moc pokusů.')).toBe('Moc pokusů. Zkus to znovu za 3 minuty.')
    expect(tooManyAttemptsMessage(tooManyRequests(900), 'Moc pokusů.')).toBe('Moc pokusů. Zkus to znovu za 15 minut.')
  })

  it('says "za chvíli" without a usable Retry-After', () => {
    expect(tooManyAttemptsMessage(tooManyRequests(), 'Moc pokusů.')).toBe('Moc pokusů. Zkus to znovu za chvíli.')
  })
})

describe('limit pokusů na auth formulářích (#499)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockGet()
  })

  it('přihlášení ukáže limit s časem, ne „Chyba sítě“, i když tělo není JSON', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(tooManyRequests(600, 'Too many requests'))
    const user = userEvent.setup()
    renderPage(<AuthPage />)
    await user.type(await screen.findByTestId('login-username-input'), 'jana')
    await user.type(screen.getByTestId('login-password-input'), 'heslo-123')
    await user.click(screen.getByTestId('login-submit-button'))

    const alert = await screen.findByTestId('login-error-message')
    expect(alert).toHaveTextContent('Moc pokusů o přihlášení za sebou. Zkus to znovu za 10 minut.')
    expect(alert).not.toHaveTextContent('Chyba sítě')
  })

  it('zapomenuté heslo ukáže limit s časem', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(tooManyRequests(120))
    const user = userEvent.setup()
    renderPage(<AuthPage />)
    await user.click(await screen.findByTestId('login-forgot-password-link'))
    await user.type(await screen.findByTestId('forgot-password-identifier-input'), 'jana')
    await user.click(screen.getByTestId('forgot-password-submit-button'))

    expect(await screen.findByTestId('forgot-password-message')).toHaveTextContent(
      'Moc pokusů za sebou. Zkus to znovu za 2 minuty.',
    )
  })

  it('registrace ukáže limit s časem', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(tooManyRequests(900))
    const user = userEvent.setup()
    renderPage(<RegisterForm onShowLogin={vi.fn()} />)
    await user.type(screen.getByTestId('register-cabin-name-input'), 'Chata U Lesa')
    await user.type(screen.getByTestId('register-username-input'), 'novak')
    await user.type(screen.getByTestId('register-email-input'), 'novak@example.com')
    await user.type(screen.getByTestId('register-password-input'), 'Heslo-123456')
    await user.type(screen.getByTestId('register-municipality-input'), 'Třebe')
    await user.click(await screen.findByRole('option', { name: /okres Třebíč/ }))
    await user.click(screen.getByTestId('register-submit-button'))

    expect(await screen.findByTestId('register-message')).toHaveTextContent(
      'Moc pokusů za sebou. Zkus to znovu za 15 minut.',
    )
  })
})
