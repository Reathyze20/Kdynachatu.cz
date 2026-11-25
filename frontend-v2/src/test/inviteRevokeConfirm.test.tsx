import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { adminApi, type Invite } from '@/api/admin'
import { AdminPage } from '@/features/admin/AdminPage'

// #258: „Zrušit“ u pozvánky zneplatnil odkaz na jedno ťuknutí. Teď nejdřív potvrzovací
// dialog; tlačítko v seznamu je obrysové, plný destruktivní styl má až potvrzení.

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true, user: { id: 'u-admin', username: 'Správce' } }),
}))
vi.mock('@/features/admin/components/AdminSectionMenu', () => ({ AdminSectionMenu: () => null }))
vi.mock('@/features/admin/components/SystemStatsPanel', () => ({ SystemStatsPanel: () => null }))
vi.mock('@/features/settings/CabinSettingsPage', () => ({ CabinSettingsPanel: () => null }))

const INVITE: Invite = {
  id: 'inv-1',
  token: 'tok-1',
  role: 'guest',
  maxUses: 1,
  usedCount: 0,
  createdAt: '2026-11-20T10:00:00.000Z',
  expiresAt: '2099-12-31T10:00:00.000Z',
  cabinName: 'Chata U Lesa',
  createdBy: { username: 'Jana' },
}

function renderInvites() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/invites']}>
        <AdminPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('zrušení pozvánky (#258)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(adminApi, 'getUsers').mockResolvedValue([])
    vi.spyOn(adminApi, 'getInvites').mockResolvedValue([INVITE])
  })

  it('tlačítko v seznamu je obrysové, ne plně destruktivní', async () => {
    renderInvites()
    const classes = (await screen.findByTestId('invite-revoke-button')).className.split(/\s+/)
    // Sdílený Button: ne plná varianta `danger`, ale obrysová `secondary` s červeným textem
    expect(classes).not.toContain('bg-destructive')
    expect(classes).toEqual(expect.arrayContaining(['border', 'border-input', 'text-destructive']))
  })

  it('ťuknutí na Zrušit pozvánku nezruší, jen otevře potvrzení s popisem pozvánky', async () => {
    const revoke = vi.spyOn(adminApi, 'revokeInvite').mockResolvedValue(undefined as never)
    const user = userEvent.setup()
    renderInvites()

    await user.click(await screen.findByTestId('invite-revoke-button'))

    expect(revoke).not.toHaveBeenCalled()
    const message = await screen.findByTestId('confirm-dialog-message')
    expect(message.textContent).toContain('host')
    expect(message.textContent).toContain('Chata U Lesa')
    expect(message.textContent).toContain('Jana')
    expect(message.textContent).toMatch(/přestane fungovat/)
    expect(screen.getByTestId('confirm-dialog-confirm-button').className).toMatch(/btn-danger/)
  })

  it('zavření dialogu tlačítkem Nechat platit nic nezmění', async () => {
    const revoke = vi.spyOn(adminApi, 'revokeInvite').mockResolvedValue(undefined as never)
    const user = userEvent.setup()
    renderInvites()

    await user.click(await screen.findByTestId('invite-revoke-button'))
    await user.click(await screen.findByTestId('confirm-dialog-cancel-button'))

    await waitFor(() => expect(screen.queryByTestId('confirm-dialog-message')).toBeNull())
    expect(revoke).not.toHaveBeenCalled()
    expect(within(screen.getByTestId('invite-active-list')).getAllByTestId('invite-card')).toHaveLength(1)
  })

  it('potvrzení v dialogu pozvánku zruší', async () => {
    const revoke = vi.spyOn(adminApi, 'revokeInvite').mockResolvedValue(undefined as never)
    const user = userEvent.setup()
    renderInvites()

    await user.click(await screen.findByTestId('invite-revoke-button'))
    await user.click(await screen.findByTestId('confirm-dialog-confirm-button'))

    await waitFor(() => expect(revoke.mock.calls[0]?.[0]).toBe('inv-1'))
    await waitFor(() => expect(screen.queryByTestId('confirm-dialog-message')).toBeNull())
  })

  it('když zrušení selže, dialog zůstane otevřený a ukáže chybu', async () => {
    vi.spyOn(adminApi, 'revokeInvite').mockRejectedValue(new Error('boom'))
    const user = userEvent.setup()
    renderInvites()

    await user.click(await screen.findByTestId('invite-revoke-button'))
    await user.click(await screen.findByTestId('confirm-dialog-confirm-button'))

    expect(await screen.findByTestId('confirm-dialog-error')).toBeTruthy()
    expect(screen.getByTestId('confirm-dialog-message')).toBeTruthy()
  })
})
