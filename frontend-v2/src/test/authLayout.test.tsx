import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { apiClient } from '@/api/client'
import { AuthPage } from '@/features/auth/AuthPage'
import { VerifyEmailPage } from '@/features/auth/VerifyEmailPage'
import { NotFoundPage } from '@/features/not-found/NotFoundPage'

// #525: veřejné obrazovky mají jeden rám (fotka, papírová karta, logo s názvem appky na střed)
// a pohled přihlášení / registrace / zapomenuté heslo je v URL, takže Zpět v telefonu vrací o krok.

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn() }),
}))

function renderAt(url: string) {
  vi.spyOn(apiClient, 'get').mockImplementation((path: string) => {
    if (path === '/demo-accounts') return Promise.resolve({ data: { accounts: [] } }) as ReturnType<typeof apiClient.get>
    return Promise.resolve({ data: { cabinSignupEnabled: true } }) as ReturnType<typeof apiClient.get>
  })
  const router = createMemoryRouter([{ path: '*', element: <AuthPage /> }], { initialEntries: [url] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>)
  return router
}

describe('pohled přihlášení v URL (#525)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('registrace přidá krok do historie, Zpět vrátí přihlášení a ?redirect zůstane', async () => {
    const router = renderAt('/login?redirect=%2Fnotes')
    await userEvent.click(await screen.findByTestId('login-show-register-link'))

    expect(await screen.findByTestId('register-form')).toBeInTheDocument()
    const params = new URLSearchParams(router.state.location.search)
    expect(params.get('view')).toBe('register')
    expect(params.get('redirect')).toBe('/notes')

    await act(() => router.navigate(-1))
    expect(await screen.findByTestId('login-form')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?redirect=%2Fnotes')
  })

  it('zapomenuté heslo a odkaz zpět na přihlášení jsou kroky v historii', async () => {
    const router = renderAt('/login')
    await userEvent.click(await screen.findByTestId('login-forgot-password-link'))
    expect(await screen.findByTestId('forgot-password-form')).toBeInTheDocument()

    await act(() => router.navigate(-1))
    expect(await screen.findByTestId('login-form')).toBeInTheDocument()
  })

  it('odkaz s ?view=forgot otevře rovnou obnovu hesla', async () => {
    renderAt('/login?view=forgot')
    expect(await screen.findByTestId('forgot-password-form')).toBeInTheDocument()
  })
})

describe('jeden rám veřejných obrazovek (#525)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it.each([
    ['přihlášení', '/login', 'login-form'],
    ['registrace', '/login?view=register', 'register-form'],
    ['zapomenuté heslo', '/login?view=forgot', 'forgot-password-form'],
  ])('%s: jedno h1 s názvem appky v rámu s fotkou', async (_name, url, testId) => {
    renderAt(url)
    await screen.findByTestId(testId)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Kdy na chatu' }).closest('.photo-backdrop')).not.toBeNull()
  })

  it('popisky polí přihlášení jsou bez dvojtečky', async () => {
    renderAt('/login')
    expect(await screen.findByLabelText('Uživatelské jméno')).toBeInTheDocument()
    expect(screen.getByLabelText('Heslo')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Zapamatovat si mě' })).toBeInTheDocument()
  })
})

describe('samostatné veřejné obrazovky ve stejném rámu (#525)', () => {
  it.each<[string, string, ReactNode, string]>([
    ['ověření e-mailu bez odkazu', '/verify', <VerifyEmailPage />, 'Chybí ověřovací odkaz'],
    ['404', '/neexistuje', <NotFoundPage />, 'Stránka nenalezena'],
  ])('%s: jedno h1 s názvem appky v rámu s fotkou, stav jako h2', (_name, url, page, title) => {
    render(<MemoryRouter initialEntries={[url]}>{page}</MemoryRouter>)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Kdy na chatu' }).closest('.photo-backdrop')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
  })
})
