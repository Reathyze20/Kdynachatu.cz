import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { adminApi, type CabinUser } from '@/api/admin'
import { showToast } from '@/lib/toast'
import { AdminPage } from '@/features/admin/AdminPage'

// #522: seznam členů podle DESIGN.md – jedna karta s řádky (žádná karta v kartě), EmptyState, Button, lib/format.

vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, user: { userId: 'u-admin', username: 'Správce' } }) }))
vi.mock('@/features/admin/components/AdminSectionMenu', () => ({ AdminSectionMenu: () => null }))
vi.mock('@/features/admin/components/SystemStatsPanel', () => ({ SystemStatsPanel: () => null }))
vi.mock('@/features/admin/components/StagingFeedbackSection', () => ({ StagingFeedbackSection: () => null }))
vi.mock('@/features/settings/CabinSettingsPage', () => ({ CabinSettingsPanel: () => null }))

const JANA: CabinUser = {
  id: 'u-jana', username: 'Jana', role: 'user', animalIcon: null, avatarColor: null, email: 'jana@example.test',
  isVerified: true, isBanned: false, isActive: true, createdAt: '2026-01-10T10:00:00.000Z',
  reservationCount: 1, photoCount: 2, threadCount: 5,
}
const SELF: CabinUser = { ...JANA, id: 'u-admin', username: 'Správce', role: 'admin', email: null }

function renderMembers(users: CabinUser[]) {
  vi.spyOn(adminApi, 'getUsers').mockResolvedValue(users)
  vi.spyOn(adminApi, 'getInvites').mockResolvedValue([])
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin']}><AdminPage /></MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('seznam členů ve správě (#522)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(showToast).mockClear()
  })

  it('je jeden seznam řádků v jedné kartě, bez karty v kartě a bez legacy tříd', async () => {
    renderMembers([SELF, JANA])
    const section = screen.getByTestId('admin-users-section')
    const rows = await within(section).findAllByTestId('admin-user-card')

    expect(rows.map((row) => row.tagName)).toEqual(['LI', 'LI'])
    expect(within(section).getByRole('list')).toContainElement(rows[0])
    expect(section.querySelectorAll('.shadow-lift')).toHaveLength(0)
    expect(section.querySelectorAll('.btn, [class*="btn-"], .page-card, .admin-card, .admin-user-card, [class*="-empty-"]')).toHaveLength(0)
  })

  it('řádek ukáže e-mail, datum založení přes lib/format a akci Upravit se jménem účtu', async () => {
    renderMembers([SELF, JANA])
    const [self, jana] = await screen.findAllByTestId('admin-user-card')

    expect(within(self).getByText('Tvůj účet')).toBeInTheDocument()
    expect(within(self).getByText('Bez e-mailu')).toBeInTheDocument()
    expect(within(jana).getByText('jana@example.test')).toBeInTheDocument()
    expect(within(jana).getByText('Vytvořen 10. 1. 2026')).toBeInTheDocument()
    expect(within(jana).getByRole('button', { name: 'Upravit účet Jana' })).toBeInTheDocument()
  })

  it('bez členů ukáže prázdný stav s akcí Přidat člena', async () => {
    renderMembers([])
    const section = screen.getByTestId('admin-users-section')
    expect(await within(section).findByText('Zatím tu nikdo není.')).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Přidat člena' })).toBeInTheDocument()
  })

  it('filtr role je přepínač, hledání bez výsledku ukáže prázdný stav a Vyčistit filtr vrátí seznam', async () => {
    const user = renderMembers([SELF, JANA])
    await screen.findAllByTestId('admin-user-card')
    const admins = within(screen.getByTestId('admin-role-filters')).getByRole('button', { name: /Admini/ })

    await user.click(admins)
    expect(admins).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByTestId('admin-user-card')).toHaveLength(1)

    await user.type(screen.getByRole('searchbox', { name: 'Hledat člena' }), 'xyz')
    expect(screen.getByText('Tomu filtru nikdo neodpovídá.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Vyčistit filtr' }))
    expect(screen.getAllByTestId('admin-user-card')).toHaveLength(2)
    expect(admins).toHaveAttribute('aria-pressed', 'false')
  })

  it('jméno nového člena ze samých mezer ukáže chybu pod polem, ne toast, a nic neodešle', async () => {
    const create = vi.spyOn(adminApi, 'createUser').mockResolvedValue({ message: 'ok' } as never)
    const user = renderMembers([SELF])
    const username = await screen.findByTestId('admin-create-username-input')

    await user.type(username, '   ')
    await user.type(screen.getByTestId('admin-create-password-input'), 'tajneheslo1')
    await user.click(screen.getByTestId('admin-create-submit-button'))

    expect(create).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
    expect(username).toHaveAttribute('aria-invalid', 'true')
    expect(document.getElementById(username.getAttribute('aria-describedby') ?? '')).toHaveTextContent('Vyplň uživatelské jméno.')
    await user.type(username, 'Petr')
    expect(username).not.toHaveAttribute('aria-invalid')
  })
})
