import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { adminApi, type Invite } from '@/api/admin'
import { AdminPage } from '@/features/admin/AdminPage'

// #522: seznam pozvánek podle DESIGN.md – jedna karta, řádky ListRow, EmptyState, datum z lib/format.
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, user: { id: 'u-admin', username: 'Správce' } }) }))
vi.mock('@/features/admin/components/AdminSectionMenu', () => ({ AdminSectionMenu: () => null }))
vi.mock('@/features/admin/components/SystemStatsPanel', () => ({ SystemStatsPanel: () => null }))

const invite = (id: string, expiresAt: string): Invite => ({
  id, token: `tok-${id}`, role: 'guest', maxUses: 1, usedCount: 0, createdAt: '2026-11-20T10:00:00.000Z',
  expiresAt, cabinName: 'Chata U Lesa', createdBy: { username: 'Jana' },
})

function renderInvites(invites: Invite[]) {
  vi.spyOn(adminApi, 'getUsers').mockResolvedValue([])
  vi.spyOn(adminApi, 'getInvites').mockResolvedValue(invites)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/admin/invites']}><AdminPage /></MemoryRouter></QueryClientProvider>)
}

describe('seznam pozvánek (#522)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('aktivní i archivní pozvánky jsou řádky seznamů v jedné kartě, bez vnořených karet a legacy tříd', async () => {
    renderInvites([invite('inv-1', '2099-12-31T10:00:00.000Z'), invite('inv-old', '2020-01-05T10:00:00.000Z')])

    const list = await screen.findByTestId('invite-active-list')
    expect(within(list).getAllByTestId('invite-card').map((row) => row.tagName)).toEqual(['LI'])
    expect(within(list).getByText('Platí do 31. 12. 2099')).toBeInTheDocument()
    expect(within(screen.getByTestId('invite-archive-list')).getByText('Platnost do 5. 1. 2020').closest('li')).not.toBeNull()

    const section = screen.getByTestId('admin-invites-section')
    expect(section.querySelectorAll('.shadow-lift')).toHaveLength(0)
    // Kopírovací tlačítko je sdílená komponenta s vlastním převodem, mimo tento řez.
    const legacy = [...section.querySelectorAll('[class]:not([data-testid="invite-copy-message-button"])')]
      .map((node) => node.getAttribute('class') ?? '')
      .filter((name) => /(^|\s)(btn(-[\w-]+)?|page-card|admin-card|admin-invite-(?!status)[\w-]+)(\s|$)|-empty-/.test(name))
    expect(legacy).toEqual([])
  })

  it('bez aktivních pozvánek ukáže prázdný stav', async () => {
    renderInvites([])
    expect(await screen.findByText('Zatím tu nejsou žádné aktivní pozvánky.')).toBeInTheDocument()
  })
})
