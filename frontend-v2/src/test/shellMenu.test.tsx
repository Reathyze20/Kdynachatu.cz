import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactElement } from 'react'
import { MobileNav } from '@/components/layout/MobileNav'
import { ProfileDrawer } from '@/components/layout/ProfileDrawer'
import { AdminRoute } from '@/components/layout/AdminRoute'
import { showToast } from '@/lib/toast'

// Kostra aplikace na mobilu podle DESIGN.md (#524): menu Víc nese účet, nápovědu a správu,
// plovoucí tlačítko nápovědy není. Fiktivní účet.

const auth = vi.hoisted(() => ({ isAdmin: false, logout: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    ...auth, isSuperAdmin: false, isGuest: false, token: 't', login: vi.fn(), updateAnimalIcon: vi.fn(),
    user: { userId: 'u-1', username: 'Jana', role: auth.isAdmin ? 'admin' : 'user', animalIcon: null, cabinId: 'c-1', isSuperAdmin: false },
  }),
}))
vi.mock('@/hooks/useCabinFeatures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useCabinFeatures')>()),
  useCabinFeatures: () => ({ data: { features: null, isWinterized: false } }),
}))
vi.mock('@/hooks/usePwaInstall', () => ({ usePwaInstall: () => ({ isStandalone: false, canInstall: null }) }))
vi.mock('@/api/client', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { email: 'jana@example.test', color: '#5d9b62', animalIcon: null } }), patch: vi.fn() },
}))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

function Path() {
  return <output data-testid="path">{useLocation().pathname}</output>
}

function renderAt(url: string, page: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="*" element={<>{page}<Path /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function openMore(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Víc/ }))
  return screen.findByRole('dialog', { name: 'Víc' })
}

describe('menu Víc (#524)', () => {
  beforeEach(() => {
    auth.isAdmin = false
    auth.logout.mockReset()
  })

  it('pod oddělovačem nabízí Můj profil, Nápovědu a Odhlásit, správu jen správci', async () => {
    const user = userEvent.setup()
    renderAt('/dashboard', <MobileNav onOpenProfileDrawer={vi.fn()} />)
    const sheet = await openMore(user)

    const separator = within(sheet).getByRole('separator')
    const account = ['Můj profil', 'Nápověda', 'Odhlásit'].map((name) => within(sheet).getByRole('button', { name }))
    for (const row of account) expect(separator.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(sheet).queryByRole('link', { name: 'Správa' })).not.toBeInTheDocument()
  })

  it('„Můj profil“ zavře menu a otevře šuplík profilu', async () => {
    const user = userEvent.setup()
    const openProfile = vi.fn()
    renderAt('/dashboard', <MobileNav onOpenProfileDrawer={openProfile} />)
    const sheet = await openMore(user)

    await user.click(within(sheet).getByRole('button', { name: 'Můj profil' }))
    expect(openProfile).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Víc' })).not.toBeInTheDocument())
  })

  it('„Odhlásit“ odhlásí toto zařízení a pošle na přihlašovací stránku', async () => {
    const user = userEvent.setup()
    renderAt('/dashboard', <MobileNav onOpenProfileDrawer={vi.fn()} />)
    const sheet = await openMore(user)

    await user.click(within(sheet).getByRole('button', { name: 'Odhlásit' }))
    expect(auth.logout).toHaveBeenCalledOnce()
    expect(screen.getByTestId('path')).toHaveTextContent('/login')
  })

  it('správce otevře z Víc správu a ve správě je Víc aktivní', async () => {
    auth.isAdmin = true
    const user = userEvent.setup()
    renderAt('/admin/cabin', <MobileNav onOpenProfileDrawer={vi.fn()} />)

    const more = screen.getByRole('button', { name: 'Víc (právě: Správa)' })
    expect(more).toHaveClass('active')
    const sheet = await openMore(user)
    const admin = within(sheet).getByRole('link', { name: 'Správa' })
    expect(admin).toHaveAttribute('href', '/admin')
    expect(admin).toHaveAttribute('aria-current', 'page')
  })
})

describe('šuplík profilu (#524)', () => {
  beforeEach(() => {
    auth.isAdmin = false
  })

  it('popisky polí jsou bez dvojteček', async () => {
    const user = userEvent.setup()
    renderAt('/dashboard', <ProfileDrawer isOpen onClose={vi.fn()} />)
    const drawer = screen.getByTestId('profile-drawer')
    expect(within(drawer).getByLabelText('E-mailová adresa')).toBeInTheDocument()

    await user.click(screen.getByTestId('profile-tab-security-button'))
    for (const label of drawer.querySelectorAll('label')) expect(label.textContent).not.toMatch(/:\s*$/)
  })

  it('správce má v sekci Správa řádky Správa chaty a Diagnostika', async () => {
    auth.isAdmin = true
    const user = userEvent.setup()
    renderAt('/dashboard', <ProfileDrawer isOpen onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Správa' })).toHaveClass('text-card-title')
    expect(screen.queryByText('Statistiky a logy')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Diagnostika' }))
    expect(screen.getByTestId('path')).toHaveTextContent('/admin/diagnostics')
  })

  it('řádek do správy se jmenuje Správa jako v menu Víc a na desktopu', async () => {
    auth.isAdmin = true
    const user = userEvent.setup()
    renderAt('/dashboard', <ProfileDrawer isOpen onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Správa' }))
    expect(screen.getByTestId('path')).toHaveTextContent('/admin')
  })

  it('nápovědu nenabízí, na mobilu je v menu Víc a na desktopu v sidebaru', () => {
    renderAt('/dashboard', <ProfileDrawer isOpen onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Nápověda' })).not.toBeInTheDocument()
  })
})

describe('správa pro běžného člena (#524)', () => {
  it('přesměruje na Přehled s vysvětlením', () => {
    auth.isAdmin = false
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<AdminRoute><h1>Správa</h1></AdminRoute>} />
          <Route path="/dashboard" element={<h1>Přehled</h1>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Přehled' })).toBeInTheDocument()
    expect(showToast).toHaveBeenCalledWith('Tohle může jen správce chaty.', 'info')
  })
})
