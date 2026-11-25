import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { adminApi, type CabinUser } from '@/api/admin'
import { AdminPage } from '@/features/admin/AdminPage'

// #522: dialog „Upravit uživatele“ podle DESIGN.md. V patičce jen Zrušit + Uložit,
// nevratné akce v oddělené Nebezpečné zóně a každá se nejdřív zeptá.

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true, user: { userId: 'u-admin', username: 'Správce' } }),
}))
vi.mock('@/features/admin/components/AdminSectionMenu', () => ({ AdminSectionMenu: () => null }))
vi.mock('@/features/admin/components/SystemStatsPanel', () => ({ SystemStatsPanel: () => null }))
vi.mock('@/features/admin/components/StagingFeedbackSection', () => ({ StagingFeedbackSection: () => null }))
vi.mock('@/features/settings/CabinSettingsPage', () => ({ CabinSettingsPanel: () => null }))

const USER: CabinUser = {
  id: 'u-jana',
  username: 'Jana',
  role: 'user',
  animalIcon: null,
  avatarColor: null,
  email: 'jana@example.test',
  isVerified: true,
  isBanned: false,
  isActive: true,
  createdAt: '2026-01-10T10:00:00.000Z',
  reservationCount: 3,
  photoCount: 2,
  threadCount: 5,
}

async function openEditDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin']}>
        <AdminPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  const user = userEvent.setup()
  await user.click(await screen.findByTestId('admin-edit-user-button'))
  const dialog = (await screen.findByText('Upravit uživatele')).closest('[data-testid="modal-card"]') as HTMLElement
  return { user, dialog }
}

describe('dialog Upravit uživatele (#522)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(adminApi, 'getUsers').mockResolvedValue([USER])
    vi.spyOn(adminApi, 'getInvites').mockResolvedValue([])
  })

  it('v patičce je jen Zrušit a Uložit, Uložit vpravo', async () => {
    const { dialog } = await openEditDialog()
    const footer = within(dialog).getByTestId('modal-footer')
    expect(within(footer).getAllByRole('button').map((button) => button.textContent)).toEqual(['Zrušit', 'Uložit'])
  })

  it('Zrušit dialog zavře a nic neuloží', async () => {
    const update = vi.spyOn(adminApi, 'updateUser').mockResolvedValue({ message: 'ok' })
    const { user, dialog } = await openEditDialog()

    await user.click(within(within(dialog).getByTestId('modal-footer')).getByRole('button', { name: 'Zrušit' }))

    await waitFor(() => expect(screen.queryByText('Upravit uživatele')).toBeNull())
    expect(update).not.toHaveBeenCalled()
  })

  it('statistiky účtu jsou jeden řádek meta textu', async () => {
    const { dialog } = await openEditDialog()
    expect(within(dialog).getByText('Aktivní · 3 rezervace · 2 fotky · 5 vláken')).toBeInTheDocument()
  })

  it('nevratné akce jsou v oddělené sekci Nebezpečná zóna', async () => {
    const { dialog } = await openEditDialog()
    const zone = within(dialog).getByRole('region', { name: 'Nebezpečná zóna' })
    expect(within(zone).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Odebrat z chaty',
      'Smazat rezervace',
      'Smazat uživatele',
    ])
  })

  it.each([
    ['Odebrat z chaty', 'removeUserFromCabin', 'Odebrat uživatele z chaty?'],
    ['Smazat rezervace', 'deleteUserReservations', 'Smazat rezervace?'],
    ['Smazat uživatele', 'deleteUser', 'Smazat uživatele?'],
  ] as const)('„%s“ se nejdřív zeptá a bez potvrzení nic neudělá', async (label, method, confirmTitle) => {
    const action = vi.spyOn(adminApi, method).mockResolvedValue({ message: 'ok' })
    const { user, dialog } = await openEditDialog()
    const zone = within(dialog).getByRole('region', { name: 'Nebezpečná zóna' })

    await user.click(within(zone).getByRole('button', { name: label }))
    expect(await screen.findByText(confirmTitle)).toBeInTheDocument()
    expect(action).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('confirm-dialog-cancel-button'))
    await waitFor(() => expect(screen.queryByText(confirmTitle)).toBeNull())
    expect(action).not.toHaveBeenCalled()

    await user.click(within(zone).getByRole('button', { name: label }))
    await user.click(await screen.findByTestId('confirm-dialog-confirm-button'))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(action.mock.calls[0]?.[0]).toBe('u-jana')
  })
})
