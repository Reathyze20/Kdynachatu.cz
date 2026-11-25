import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { AuthProvider } from '@/context/AuthContext'
import { ProfileDrawer } from '@/components/layout/ProfileDrawer'
import { SidebarProfileMenu } from '@/components/layout/SidebarProfileMenu'
import type { ReactElement } from 'react'

// #501: na mobilu jde odhlásit ze šuplíku profilu (sdílený rodinný telefon nebo tablet).
// Běžné „Odhlásit“ je před „Odhlásit všude“ a vede na přihlašovací stránku. Fiktivní data.

vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/api/client', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { email: 'jana@example.test', color: '#5d9b62', animalIcon: null } }) },
}))

function renderWithSession(page: ReactElement) {
  Object.entries({ authToken: 't-jana', userId: 'u-jana', username: 'Jana', role: 'user', cabinId: 'cabin-1' }).forEach(
    ([k, v]) => localStorage.setItem(k, v),
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/kalendar']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<h1>Přihlašovací stránka</h1>} />
            <Route path="*" element={page} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const renderDrawerWithSession = () => renderWithSession(<ProfileDrawer isOpen onClose={vi.fn()} />)

describe('Odhlásit ze šuplíku profilu (#501)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.spyOn(authApi, 'syncUploadsCookie').mockResolvedValue()
  })
  afterEach(() => vi.restoreAllMocks())

  it('„Odhlásit“ je před „Odhlásit všude“, má vlastní popis a dotykovou plochu 48 px', async () => {
    const user = userEvent.setup()
    renderDrawerWithSession()
    await user.click(screen.getByTestId('profile-tab-security-button'))

    const logout = screen.getByRole('button', { name: 'Odhlásit' })
    const logoutEverywhere = screen.getByTestId('profile-logout-everywhere-button')
    expect(logout.compareDocumentPosition(logoutEverywhere) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(logout).toHaveAccessibleDescription(/jen na tomhle zařízení/i)
    // jsdom neměří layout: 48 px dává token --touch-target-min z velikosti Button
    expect(logout.className).toContain('min-h-(--touch-target-min)')
  })

  it('odhlásí jen toto zařízení a pošle na přihlašovací stránku', async () => {
    const logoutRequest = vi.spyOn(authApi, 'logout').mockResolvedValue()
    const logoutEverywhere = vi.spyOn(authApi, 'logoutEverywhere')
    const user = userEvent.setup()
    renderDrawerWithSession()
    await user.click(screen.getByTestId('profile-tab-security-button'))

    await user.click(screen.getByRole('button', { name: 'Odhlásit' }))

    expect(await screen.findByRole('heading', { name: 'Přihlašovací stránka' })).toBeInTheDocument()
    expect(localStorage.getItem('authToken')).toBeNull()
    expect(logoutRequest).toHaveBeenCalledOnce()
    expect(logoutEverywhere).not.toHaveBeenCalled()
  })

  it('profilové menu v sidebaru odhlašuje stejně, na přihlašovací stránku', async () => {
    vi.spyOn(authApi, 'logout').mockResolvedValue()
    const user = userEvent.setup()
    renderWithSession(<SidebarProfileMenu onOpenProfileDrawer={vi.fn()} />)

    await user.click(screen.getByTestId('profile-menu-button'))
    await user.click(screen.getByRole('menuitem', { name: 'Odhlásit' }))

    expect(await screen.findByRole('heading', { name: 'Přihlašovací stránka' })).toBeInTheDocument()
  })
})
