import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Reservation } from '@/api/reservations'
import { ReservationDetail } from '@/features/reservations/ui/ReservationDetail'

// #461: detail rezervace a předávka podle DESIGN.md – Smazat v kebab menu přes ConfirmDialog,
// chyba načtení předávky je v stayDetailHandover.test.tsx (#222). Fiktivní data.
const { api, auth } = vi.hoisted(() => ({
  api: { get: vi.fn((_url: string): Promise<unknown> => Promise.resolve({ data: null })) },
  auth: { userId: 'u-me' },
}))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { userId: auth.userId, role: 'member' }, isAdmin: false }) }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2030, 10, 29, 9))
  auth.userId = 'u-me'
  api.get.mockImplementation(() => Promise.resolve({ data: { checkoutTasks: [] } }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

function renderDetail(onDelete = vi.fn()) {
  const stay: Reservation = { id: 'r-1', userId: 'u-me', username: 'Eva', from: '2030-11-28', to: '2030-11-30', purpose: 'Víkend', status: 'primary' }
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <MemoryRouter>
        <ReservationDetail reservation={stay} onBack={vi.fn()} onEdit={vi.fn()} onDelete={onDelete} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { card: screen.getByTestId('reservation-detail-card'), user: userEvent.setup() }
}

describe('reservation detail per DESIGN.md (#461)', () => {
  it('Smazat sits in the kebab menu and deletes only after the confirmation dialog', async () => {
    const onDelete = vi.fn()
    const { card, user } = renderDetail(onDelete)

    await user.click(within(card).getByRole('button', { name: 'Další akce' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Smazat' }))
    expect(onDelete).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('dialog', { name: 'Smazat rezervaci' })
    await user.click(within(dialog).getByRole('button', { name: 'Smazat' }))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('r-1'))
    // Dialog se zavře, až server potvrdí; počkat na konec animace, ať se fokus nevrací po konci testu.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('someone else\'s stay has neither Upravit nor the kebab menu for a member', () => {
    auth.userId = 'u-other'
    const { card } = renderDetail()
    expect(within(card).queryByRole('button', { name: 'Upravit' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Další akce' })).toBeNull()
  })
})
