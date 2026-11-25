import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { ProfileDrawer } from '@/components/layout/ProfileDrawer'

// #485: „Odhlásit všude“ v profilu zneplatní všechna přihlášení (i aktuální) a odhlásí uživatele.
// Změna vlastního hesla zneplatní ostatní zařízení, aktuální pokračuje s novým tokenem z odpovědi.

const auth = vi.hoisted(() => ({ logout: vi.fn(), login: vi.fn() }))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    ...auth,
    updateAnimalIcon: vi.fn(),
    isAdmin: false,
    isSuperAdmin: false,
    token: 'stary-token',
    user: { userId: 'u-1', username: 'Jana', role: 'user', animalIcon: null, cabinId: 'cabin-1', isSuperAdmin: false },
  }),
}))
vi.mock('@/api/client', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { email: 'jana@example.test', color: '#5d9b62', animalIcon: null } }) },
}))

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

describe('Odhlásit všude (#485)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    auth.logout.mockReset()
    auth.login.mockReset()
    localStorage.clear()
  })

  it('tlačítko nejdřív jen otevře potvrzení, endpoint nevolá', async () => {
    const logoutEverywhere = vi.spyOn(authApi, 'logoutEverywhere').mockResolvedValue({ message: 'ok' })
    const user = userEvent.setup()
    renderDrawer()

    await user.click(screen.getByTestId('profile-tab-security-button'))
    await user.click(screen.getByTestId('profile-logout-everywhere-button'))

    expect(await screen.findByTestId('confirm-dialog-message')).toHaveTextContent('i na tomhle')
    expect(logoutEverywhere).not.toHaveBeenCalled()
    expect(auth.logout).not.toHaveBeenCalled()
  })

  it('potvrzení zavolá endpoint a odhlásí uživatele', async () => {
    const logoutEverywhere = vi.spyOn(authApi, 'logoutEverywhere').mockResolvedValue({ message: 'ok' })
    const user = userEvent.setup()
    renderDrawer()

    await user.click(screen.getByTestId('profile-tab-security-button'))
    await user.click(screen.getByTestId('profile-logout-everywhere-button'))
    await user.click(await screen.findByTestId('confirm-dialog-confirm-button'))

    await waitFor(() => expect(auth.logout).toHaveBeenCalledOnce())
    expect(logoutEverywhere).toHaveBeenCalledOnce()
  })

  it('když se odhlášení nepovede, uživatel zůstane přihlášený a vidí chybu v dialogu', async () => {
    vi.spyOn(authApi, 'logoutEverywhere').mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    renderDrawer()

    await user.click(screen.getByTestId('profile-tab-security-button'))
    await user.click(screen.getByTestId('profile-logout-everywhere-button'))
    await user.click(await screen.findByTestId('confirm-dialog-confirm-button'))

    expect(await screen.findByTestId('confirm-dialog-error')).toHaveTextContent('Zkus to znovu.')
    expect(auth.logout).not.toHaveBeenCalled()
  })
})

describe('změna vlastního hesla (#485)', () => {
  it('uloží nový token z odpovědi, takže tohle zařízení zůstane přihlášené', async () => {
    vi.spyOn(authApi, 'changeMyPassword').mockResolvedValue({ message: 'ok', token: 'novy-token' })
    localStorage.setItem('authToken', 'stary-token')
    const user = userEvent.setup()
    renderDrawer()

    await user.click(screen.getByTestId('profile-tab-security-button'))
    await user.type(screen.getByTestId('profile-old-password-input'), 'stare-heslo')
    await user.type(screen.getByTestId('profile-new-password-input'), 'nove-heslo-123')
    await user.type(screen.getByTestId('profile-new-password-confirm-input'), 'nove-heslo-123')
    await user.click(screen.getByTestId('profile-change-password-button'))

    await waitFor(() => expect(auth.login).toHaveBeenCalledOnce())
    expect(authApi.changeMyPassword).toHaveBeenCalledWith('stare-heslo', 'nove-heslo-123')
    expect(auth.login).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'novy-token', userId: 'u-1', cabinId: 'cabin-1', remember: true }),
    )
    expect(auth.logout).not.toHaveBeenCalled()
  })
})
