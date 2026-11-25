import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { adminApi, type Invite } from '@/api/admin'
import { AdminPage } from '@/features/admin/AdminPage'

// #522: „Odstranit“ v archivu pozvánek mazal na jedno ťuknutí. Mazání jde přes ConfirmDialog (DESIGN.md §7).

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true, user: { id: 'u-admin', username: 'Správce' } }),
}))
vi.mock('@/features/admin/components/AdminSectionMenu', () => ({ AdminSectionMenu: () => null }))
vi.mock('@/features/admin/components/SystemStatsPanel', () => ({ SystemStatsPanel: () => null }))
vi.mock('@/features/settings/CabinSettingsPage', () => ({ CabinSettingsPanel: () => null }))

const EXPIRED: Invite = {
  id: 'inv-old',
  token: 'tok-old',
  role: 'user',
  maxUses: 1,
  usedCount: 0,
  createdAt: '2020-01-01T10:00:00.000Z',
  expiresAt: '2020-01-05T10:00:00.000Z',
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

describe('odstranění pozvánky z archivu (#522)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(adminApi, 'getUsers').mockResolvedValue([])
    vi.spyOn(adminApi, 'getInvites').mockResolvedValue([EXPIRED])
  })

  it('Odstranit jen otevře potvrzení s popisem pozvánky, Nechat nic nesmaže', async () => {
    const revoke = vi.spyOn(adminApi, 'revokeInvite').mockResolvedValue(undefined as never)
    const user = userEvent.setup()
    renderInvites()

    await user.click(await screen.findByTestId('invite-archive-delete-button'))

    expect(revoke).not.toHaveBeenCalled()
    expect(screen.getByText('Odstranit pozvánku z archivu?')).toBeInTheDocument()
    const message = screen.getByTestId('confirm-dialog-message')
    expect(message.textContent).toContain('člen')
    expect(message.textContent).toContain('Chata U Lesa')
    expect(screen.getByTestId('confirm-dialog-confirm-button').textContent).toBe('Odstranit')

    await user.click(screen.getByTestId('confirm-dialog-cancel-button'))
    await waitFor(() => expect(screen.queryByTestId('confirm-dialog-message')).toBeNull())
    expect(revoke).not.toHaveBeenCalled()
  })

  it('potvrzení pozvánku odstraní a dialog zavře', async () => {
    const revoke = vi.spyOn(adminApi, 'revokeInvite').mockResolvedValue(undefined as never)
    const user = userEvent.setup()
    renderInvites()

    await user.click(await screen.findByTestId('invite-archive-delete-button'))
    await user.click(screen.getByTestId('confirm-dialog-confirm-button'))

    await waitFor(() => expect(revoke.mock.calls[0]?.[0]).toBe('inv-old'))
    await waitFor(() => expect(screen.queryByTestId('confirm-dialog-message')).toBeNull())
  })

  it('když odstranění selže, dialog zůstane otevřený a ukáže chybu', async () => {
    vi.spyOn(adminApi, 'revokeInvite').mockRejectedValue(new Error('boom'))
    const user = userEvent.setup()
    renderInvites()

    await user.click(await screen.findByTestId('invite-archive-delete-button'))
    await user.click(screen.getByTestId('confirm-dialog-confirm-button'))

    expect(await screen.findByTestId('confirm-dialog-error')).toHaveTextContent(/odstranit/i)
    expect(screen.getByTestId('confirm-dialog-message')).toBeInTheDocument()
  })
})
