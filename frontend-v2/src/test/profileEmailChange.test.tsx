import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { ProfileDrawer } from '@/components/layout/ProfileDrawer'

// #475: změna e-mailu chce současné heslo. Pole pro heslo se ukáže, až když se e-mail liší od uloženého;
// barva heslo nechce. Chyba se ukáže česky pod polem s heslem.

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn(), login: vi.fn(), updateAnimalIcon: vi.fn(), isAdmin: false, isSuperAdmin: false, token: 'token',
    user: { userId: 'u-1', username: 'Jana', role: 'user', animalIcon: null, cabinId: 'cabin-1', isSuperAdmin: false },
  }),
}))
vi.mock('@/api/client', () => ({ default: api }))

const emailInput = () => screen.getByTestId('profile-email-input')
const passwordInput = () => screen.queryByTestId('profile-email-password-input')

async function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={queryClient}><MemoryRouter><ProfileDrawer isOpen onClose={vi.fn()} /></MemoryRouter></QueryClientProvider>)
  await waitFor(() => expect(emailInput()).toHaveValue('jana@example.test'))
  const user = userEvent.setup()
  /** Přepíše e-mail, volitelně vyplní heslo a klikne na „Změnit“. */
  const changeEmail = async (password?: string) => {
    await user.clear(emailInput())
    await user.type(emailInput(), 'nova@example.test')
    if (password) await user.type(passwordInput()!, password)
    await user.click(screen.getByTestId('profile-change-email-button'))
  }
  return { user, changeEmail }
}

describe('změna e-mailu v profilu (#475)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    api.get.mockReset().mockResolvedValue({ data: { email: 'jana@example.test', color: '#5d9b62', animalIcon: null } })
    api.patch.mockReset().mockResolvedValue({ data: { message: 'ok' } })
  })

  it('heslo nechce, dokud se e-mail nezmění', async () => {
    const { user } = await setup()
    expect(passwordInput()).not.toBeInTheDocument()
    await user.type(emailInput(), 'x')
    expect(screen.getByLabelText('Současné heslo')).toBeInTheDocument()
    await user.type(emailInput(), '{backspace}')
    expect(passwordInput()).not.toBeInTheDocument()
  })

  it('bez hesla e-mail neodešle a česky řekne proč', async () => {
    const changeMyEmail = vi.spyOn(authApi, 'changeMyEmail')
    const { changeEmail } = await setup()
    await changeEmail()
    expect(await screen.findByText('Pro změnu e-mailu zadej své současné heslo.')).toBeInTheDocument()
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'true')
    expect(changeMyEmail).not.toHaveBeenCalled()
  })

  it('s heslem pošle nový e-mail i heslo a pole s heslem vyprázdní', async () => {
    const changeMyEmail = vi.spyOn(authApi, 'changeMyEmail').mockResolvedValue({ message: 'ok', user: { email: 'nova@example.test', color: '#5d9b62', animalIcon: null } })
    const { changeEmail } = await setup()
    await changeEmail('moje-heslo-123')
    await waitFor(() => expect(changeMyEmail).toHaveBeenCalledWith('nova@example.test', 'moje-heslo-123'))
    await waitFor(() => expect(screen.queryByDisplayValue('moje-heslo-123')).not.toBeInTheDocument())
  })

  it('špatné heslo (403) ukáže českou hlášku serveru pod polem s heslem', async () => {
    vi.spyOn(authApi, 'changeMyEmail').mockRejectedValue({ response: { status: 403, data: { message: 'Nesprávné heslo. Zkus to znovu.' } } })
    const { changeEmail } = await setup()
    await changeEmail('spatne-heslo')
    const error = await screen.findByText('Nesprávné heslo. Zkus to znovu.')
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'true')
    expect(passwordInput()!.getAttribute('aria-describedby')).toContain(error.id)
  })

  it('barva se uloží bez hesla', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'modrá' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledOnce())
    expect(api.patch).toHaveBeenCalledWith('/users/me', { color: '#1D5FA8' })
    expect(passwordInput()).not.toBeInTheDocument()
  })
})
