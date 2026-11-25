import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { apiClient } from '@/api/client'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { RegisterForm } from '@/features/auth/RegisterForm'
import { InvitePage } from '@/features/invite/InvitePage'

// #514: přihlašovací obrazovky bez slepých uliček, popsaná pole pozvánky, souhlas s podmínkami u registrace.

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn(), logout: vi.fn(), isAdmin: false, token: null, user: null }),
}))

type GetResult = ReturnType<typeof apiClient.get>
type PostResult = ReturnType<typeof apiClient.post>

function badRequest(message: string) {
  return Object.assign(new Error('Request failed with status code 400'), { response: { status: 400, data: { message } } })
}

function renderAt(path: string, routePath: string, page: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={page} />
          <Route path="/login" element={<div data-testid="login-route" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const validInvite = {
  valid: true,
  cabinName: 'Chata U Lesa',
  welcomeMessage: null,
  role: 'member',
  invitedBy: 'Jana',
  invitedByIcon: null,
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('ResetPasswordPage – expired link', () => {
  it('says the link expired and offers sending a new one from forgotten password', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(badRequest('Resetovací odkaz je neplatný nebo již vypršel.'))
    renderAt('/reset-password?token=expired-token-123456789', '/reset-password', <ResetPasswordPage />)

    expect(await screen.findByRole('heading', { name: 'Odkaz vypršel nebo už byl použitý.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Poslat nový odkaz' })).toHaveAttribute('href', '/login?view=forgot')
    expect(screen.getByRole('link', { name: 'Zpět na přihlášení' })).toHaveAttribute('href', '/login')
  })

  it('shows the same way out when the link expires while the new password is being typed', async () => {
    const user = userEvent.setup()
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: {} } as Awaited<GetResult>)
    vi.spyOn(apiClient, 'post').mockRejectedValue(badRequest('Resetovací odkaz je neplatný nebo již vypršel.'))
    renderAt('/reset-password?token=valid-token-123456789', '/reset-password', <ResetPasswordPage />)

    await user.type(await screen.findByLabelText('Nové heslo'), 'Heslo-123456')
    await user.type(screen.getByLabelText('Potvrzení nového hesla'), 'Heslo-123456')
    await user.click(screen.getByRole('button', { name: 'Uložit nové heslo' }))

    expect(await screen.findByRole('heading', { name: 'Odkaz vypršel nebo už byl použitý.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Poslat nový odkaz' })).toHaveAttribute('href', '/login?view=forgot')
  })

  it('offers a new link also when the token is missing', () => {
    renderAt('/reset-password', '/reset-password', <ResetPasswordPage />)
    expect(screen.getByRole('link', { name: 'Poslat nový odkaz' })).toHaveAttribute('href', '/login?view=forgot')
  })
})

describe('InvitePage', () => {
  it('invalid invite has a page heading and tells who to ask', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(badRequest('Pozvánka vypršela.'))
    renderAt('/invite/abc', '/invite/:token', <InvitePage />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Neplatná pozvánka' })).toBeInTheDocument()
    expect(screen.getByText('Požádej toho, kdo tě zval, o nový odkaz.')).toBeInTheDocument()
  })

  it('registration fields are labelled, say what to sign in with and use tykání', async () => {
    const user = userEvent.setup()
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: validInvite } as Awaited<GetResult>)
    renderAt('/invite/abc', '/invite/:token', <InvitePage />)

    await user.click(await screen.findByRole('button', { name: /Pokračovat/ }))

    expect(screen.getByLabelText('Uživatelské jméno (tím se budeš přihlašovat)')).toHaveAttribute('name', 'username')
    expect(screen.getByLabelText('Heslo')).toHaveAttribute('type', 'password')
    const email = screen.getByLabelText('E-mail (nepovinné)')
    expect(email).toHaveAttribute('type', 'email')
    expect(email).toHaveAttribute('placeholder', 'tvuj@email.cz')
    expect(screen.queryByText('Přezdívka')).not.toBeInTheDocument()
  })

  it('registration links terms and privacy', async () => {
    const user = userEvent.setup()
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: validInvite } as Awaited<GetResult>)
    renderAt('/invite/abc', '/invite/:token', <InvitePage />)

    await user.click(await screen.findByRole('button', { name: /Pokračovat/ }))

    const form = screen.getByTestId('invite-register-form')
    expect(within(form).getByRole('link', { name: 'obchodními podmínkami' })).toHaveAttribute('href', '/terms')
    expect(within(form).getByRole('link', { name: 'ochraně soukromí' })).toHaveAttribute('href', '/privacy')
  })

  it('a failed sign-up stays on the form instead of calling the invite invalid', async () => {
    const user = userEvent.setup()
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: validInvite } as Awaited<GetResult>)
    vi.spyOn(apiClient, 'post').mockRejectedValue(badRequest('Uživatelské jméno už někdo používá.') as unknown as Awaited<PostResult>)
    renderAt('/invite/abc', '/invite/:token', <InvitePage />)

    await user.click(await screen.findByRole('button', { name: /Pokračovat/ }))
    await user.type(screen.getByLabelText('Uživatelské jméno (tím se budeš přihlašovat)'), 'jana')
    await user.type(screen.getByLabelText('Heslo'), 'Heslo-123456')
    await user.click(screen.getByRole('button', { name: /Připojit se k chatě/ }))

    expect(await screen.findByTestId('invite-register-error')).toHaveTextContent('Uživatelské jméno už někdo používá.')
    expect(screen.getByLabelText('Uživatelské jméno (tím se budeš přihlašovat)')).toHaveValue('jana')
    expect(screen.queryByText('Neplatná pozvánka')).not.toBeInTheDocument()
  })
})

describe('RegisterForm – consent', () => {
  it('links terms and privacy next to the sign-up button', () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { municipalities: [] } } as Awaited<GetResult>)
    renderAt('/register', '/register', <RegisterForm onShowLogin={vi.fn()} />)

    const form = screen.getByTestId('register-form')
    expect(within(form).getByRole('link', { name: 'obchodními podmínkami' })).toHaveAttribute('href', '/terms')
    expect(within(form).getByRole('link', { name: 'ochraně soukromí' })).toHaveAttribute('href', '/privacy')
  })
})
