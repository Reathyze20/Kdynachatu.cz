import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Reservation } from '@/api/reservations'
import { ReservationDetail } from '@/features/reservations/ui/ReservationDetail'

// Detail pobytu v Kalendáři (#506): datum s měsícem malým písmenem, žádné mrtvé „Přiřadit“,
// „Hlídat“ jen u pobytu, který ještě neskončil, se srozumitelným stavem a vysvětlením.

const { api, auth, watch } = vi.hoisted(() => ({
  api: {
    get: vi.fn((_url: string) => Promise.resolve({ data: null as unknown })),
    post: vi.fn((_url: string) => Promise.resolve({ data: {} })),
    delete: vi.fn((_url: string) => Promise.resolve({ data: {} })),
  },
  auth: { role: 'member' },
  watch: { watching: false },
}))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { userId: 'u-me', role: auth.role } }) }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2030, 10, 20, 9))
  auth.role = 'member'
  watch.watching = false
  api.get.mockImplementation((url: string) => {
    if (url.endsWith('/watch')) return Promise.resolve({ data: { ...watch } })
    if (url === '/cabin') return Promise.resolve({ data: { checkoutTasks: [], weatherLocation: null, latitude: null, longitude: null } })
    return Promise.resolve({ data: null })
  })
  api.post.mockImplementation(() => { watch.watching = true; return Promise.resolve({ data: {} }) })
  api.delete.mockImplementation(() => { watch.watching = false; return Promise.resolve({ data: {} }) })
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

function renderDetail(overrides: Partial<Reservation> = {}) {
  const stay: Reservation = {
    id: 'r-1', userId: 'u-petr', username: 'Petr', from: '2030-11-28', to: '2030-11-30', purpose: 'Víkend', status: 'primary', ...overrides,
  }
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <MemoryRouter>
        <ReservationDetail reservation={stay} onBack={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { card: screen.getByTestId('reservation-detail-card'), user: userEvent.setup() }
}

describe('reservation detail: dates', () => {
  it('writes the month in lower case, as the formatting module does', () => {
    const { card } = renderDetail()
    expect(within(card).getByText('28. listopadu')).toBeInTheDocument()
    expect(within(card).getByText('30. listopadu')).toBeInTheDocument()
    expect(within(card).queryByText(/Listopadu/)).toBeNull()
  })
})

describe('reservation detail: no dead "Přiřadit" button (#175)', () => {
  it('an admin on someone else\'s stay gets edit and delete, but no "Přiřadit"', () => {
    auth.role = 'admin'
    const { card } = renderDetail()
    expect(within(card).getByRole('button', { name: 'Upravit' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Přiřadit' })).toBeNull()
  })
})

describe('reservation detail: watching a stay', () => {
  it('explains watching in visible text, not only in a tooltip', async () => {
    const { card } = renderDetail()
    const button = await within(card).findByRole('button', { name: 'Hlídat' })
    expect(button).not.toHaveAttribute('title')
    expect(within(card).getByText(/až se termín uvolní, objeví se to na nástěnce chaty/i)).toBeVisible()
  })

  it('on: shows "Hlídám" and offers "Přestat hlídat"; off: back to "Hlídat"', async () => {
    const { card, user } = renderDetail()

    await user.click(await within(card).findByRole('button', { name: 'Hlídat' }))

    expect(api.post).toHaveBeenCalledWith('/reservations/r-1/watch')
    const stop = await within(card).findByRole('button', { name: 'Přestat hlídat' })
    expect(within(card).getByText('Hlídám')).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Zrušit' })).toBeNull()

    await user.click(stop)

    expect(api.delete).toHaveBeenCalledWith('/reservations/r-1/watch')
    expect(await within(card).findByRole('button', { name: 'Hlídat' })).toBeInTheDocument()
    expect(within(card).queryByText('Hlídám')).toBeNull()
  })

  it('a stay that already ended offers no watching and does not ask the server', async () => {
    const { card } = renderDetail({ from: '2030-11-10', to: '2030-11-12' })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/cabin'))
    expect(within(card).queryByRole('button', { name: 'Hlídat' })).toBeNull()
    expect(api.get).not.toHaveBeenCalledWith('/reservations/r-1/watch')
  })

  it('a stay that ends today can still be watched', async () => {
    const { card } = renderDetail({ from: '2030-11-18', to: '2030-11-20' })
    expect(await within(card).findByRole('button', { name: 'Hlídat' })).toBeInTheDocument()
  })
})
