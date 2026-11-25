import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { ProfileDrawer } from '@/components/layout/ProfileDrawer'

// #475: změna e-mailu v profilu chce současné heslo. Pole pro heslo se ukáže, až když se e-mail liší
// od uloženého; barva a avatar heslo nechtějí. Chyba se ukáže česky pod polem s heslem.

const api = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn(),
    login: vi.fn(),
    updateAnimalIcon: vi.fn(),
    isAdmin: false,
    isSuperAdmin: false,
    token: 'token',
    user: { userId: 'u-1', username: 'Jana', role: 'user', animalIcon: null, cabinId: 'cabin-1', isSuperAdmin: false },
  }),
}))
vi.mock('@/api/client', () => ({ default: api }))

function renderDrawer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProfileDrawer isOpen onClose={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function renderWithLoadedEmail() {
  renderDrawer()
  await waitFor(() => expect(screen.getByTestId('profile-email-input')).toHaveValue('jana@example.test'))
}

describe('změna e-mailu v profilu (#475)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    api.get.mockReset().mockResolvedValue({ data: { email: 'jana@example.test', color: '#5d9b62', animalIcon: null } })
    api.patch.mockReset().mockResolvedValue({ data: { message: 'ok' } })
  })

  it('heslo nechce, dokud se e-mail nezmění', async () => {
    const user = userEvent.setup()
    await renderWithLoadedEmail()

    expect(screen.queryByTestId('profile-email-password-input')).not.toBeInTheDocument()

    await user.type(screen.getByTestId('profile-email-input'), 'x')
    expect(screen.getByLabelText('Současné heslo')).toBeInTheDocument()

    await user.type(screen.getByTestId('profile-email-input'), '{backspace}')
    expect(screen.queryByTestId('profile-email-password-input')).not.toBeInTheDocument()
  })

  it('bez hesla e-mail neodešle a česky řekne proč', async () => {
    const changeMyEmail = vi.spyOn(authApi, 'changeMyEmail')
    const user = userEvent.setup()
    await renderWithLoadedEmail()

    await user.clear(screen.getByTestId('profile-email-input'))
    await user.type(screen.getByTestId('profile-email-input'), 'nova@example.test')
    await user.click(screen.getByTestId('profile-change-email-button'))

    expect(await screen.findByText('Pro změnu e-mailu zadej své současné heslo.')).toBeInTheDocument()
    expect(screen.getByTestId('profile-email-password-input')).toHaveAttribute('aria-invalid', 'true')
    expect(changeMyEmail).not.toHaveBeenCalled()
  })

  it('s heslem pošle nový e-mail i heslo a pole s heslem vyprázdní', async () => {
    const changeMyEmail = vi.spyOn(authApi, 'changeMyEmail').mockResolvedValue({
      message: 'ok',
      user: { email: 'nova@example.test', color: '#5d9b62', animalIcon: null },
    })
    const user = userEvent.setup()
    await renderWithLoadedEmail()

    await user.clear(screen.getByTestId('profile-email-input'))
    await user.type(screen.getByTestId('profile-email-input'), 'nova@example.test')
    await user.type(screen.getByTestId('profile-email-password-input'), 'moje-heslo-123')
    await user.click(screen.getByTestId('profile-change-email-button'))

    await waitFor(() => expect(changeMyEmail).toHaveBeenCalledWith('nova@example.test', 'moje-heslo-123'))
    await waitFor(() => expect(screen.queryByDisplayValue('moje-heslo-123')).not.toBeInTheDocument())
  })

  it('špatné heslo (403) ukáže českou hlášku serveru pod polem s heslem', async () => {
    vi.spyOn(authApi, 'changeMyEmail').mockRejectedValue({
      response: { status: 403, data: { message: 'Nesprávné heslo. Zkus to znovu.' } },
    })
    const user = userEvent.setup()
    await renderWithLoadedEmail()

    await user.clear(screen.getByTestId('profile-email-input'))
    await user.type(screen.getByTestId('profile-email-input'), 'nova@example.test')
    await user.type(screen.getByTestId('profile-email-password-input'), 'spatne-heslo')
    await user.click(screen.getByTestId('profile-change-email-button'))

    const error = await screen.findByText('Nesprávné heslo. Zkus to znovu.')
    const password = screen.getByTestId('profile-email-password-input')
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(password.getAttribute('aria-describedby')).toContain(error.id)
  })

  it('barva se uloží bez hesla', async () => {
    const user = userEvent.setup()
    await renderWithLoadedEmail()

    const swatch = screen.getAllByRole('button', { pressed: false })[0]
    await user.click(swatch)

    await waitFor(() => expect(api.patch).toHaveBeenCalledOnce())
    expect(api.patch.mock.calls[0][0]).toBe('/users/me')
    expect(api.patch.mock.calls[0][1]).not.toHaveProperty('currentPassword')
    expect(screen.queryByTestId('profile-email-password-input')).not.toBeInTheDocument()
  })
})
