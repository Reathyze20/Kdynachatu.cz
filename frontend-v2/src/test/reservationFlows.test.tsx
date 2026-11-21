import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Reservation } from '@/api/reservations'
import { DASHBOARD_RESERVATIONS_KEY, RESERVATIONS_KEY, useDeleteReservation } from '@/features/reservations/hooks/useReservations'
import { BookingForm } from '@/features/reservations/ui/BookingForm'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'

const { api, socketHandlers } = vi.hoisted(() => ({
  api: {
    delete: vi.fn(() => Promise.resolve({ data: { message: 'Smazáno.' } })),
    get: vi.fn((_url: string) => Promise.resolve({ data: [] as unknown })),
    post: vi.fn((_url: string, _body?: unknown) => Promise.resolve({ data: { id: 'r-new' } as unknown })),
    put: vi.fn((_url: string, _body?: unknown) => Promise.resolve({ data: { id: 'r-edit' } as unknown })),
  },
  socketHandlers: new Map<string, (data?: unknown) => void>(),
}))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { userId: 'u-me' } }) }))
vi.mock('@/hooks/useSocket', () => ({
  useSocket: () => ({
    on: (event: string, handler: (data?: unknown) => void) => socketHandlers.set(event, handler),
    off: vi.fn(),
    socketGeneration: 0,
  }),
}))

// Kalendář i dashboard mají v cache načtená data; po změně musí být oba neplatné.
function seededClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  qc.setQueryData(RESERVATIONS_KEY, { reservations: [], availabilities: [] })
  qc.setQueryData(DASHBOARD_RESERVATIONS_KEY, { activeReservation: null })
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return { qc, wrapper }
}

const isStale = (qc: QueryClient, key: readonly unknown[]) => qc.getQueryState(key)?.isInvalidated

describe('reservation flows: calendar and dashboard share one source of truth', () => {
  it('deleting a reservation calls DELETE /reservations/:id and refreshes calendar and dashboard', async () => {
    const { qc, wrapper } = seededClient()
    const { result } = renderHook(() => useDeleteReservation(), { wrapper })

    await act(() => result.current.mutateAsync('r-1'))

    expect(api.delete).toHaveBeenCalledWith('/reservations/r-1')
    await waitFor(() => {
      expect(isStale(qc, RESERVATIONS_KEY)).toBe(true)
      expect(isStale(qc, DASHBOARD_RESERVATIONS_KEY)).toBe(true)
    })
  })

  it.each(['reservation:created', 'reservation:updated', 'reservation:deleted'])(
    'socket event %s refreshes calendar and dashboard',
    async (event) => {
      const { qc, wrapper } = seededClient()
      renderHook(() => useRealtimeSync(), { wrapper })

      act(() => socketHandlers.get(event)?.({ id: 'r-1' }))

      await waitFor(() => {
        expect(isStale(qc, RESERVATIONS_KEY)).toBe(true)
        expect(isStale(qc, DASHBOARD_RESERVATIONS_KEY)).toBe(true)
      })
    },
  )
})

// Typ rezervace (#208): formulář posílá `status`, ne boolean `soft`, který server ignoruje.
describe('booking form: reservation type', () => {
  const myStay = (status: Reservation['status']): Reservation => ({
    id: 'r-edit', userId: 'u-me', username: 'Já', from: '2027-08-02', to: '2027-08-04', purpose: 'Víkend', status,
  })

  async function renderForm(existing?: Reservation) {
    const { wrapper } = seededClient()
    const onClose = vi.fn()
    render(
      <BookingForm open onClose={onClose} fromDate="2027-08-02" toDate="2027-08-04" existing={existing ?? null} allReservations={[]} />,
      { wrapper },
    )
    // Modal focuses its first field after a short delay; wait for it so typing lands where the test aims.
    await waitFor(() => expect(screen.getByLabelText('Příjezd')).toHaveFocus())
    return { user: userEvent.setup(), onClose }
  }

  const sentBody = (mock: typeof api.post | typeof api.put) => mock.mock.calls[0]?.[1] as Record<string, unknown>

  beforeEach(() => {
    api.post.mockClear()
    api.put.mockClear()
  })

  it.each([
    ['Předběžná', 'soft'],
    ['Pevná', 'primary'],
  ])('creating with type %s sends status %s and no soft flag', async (label, status) => {
    const { user } = await renderForm()
    await user.type(screen.getByLabelText('Účel návštěvy'), 'Víkend')
    await user.click(screen.getByRole('button', { name: new RegExp(label) }))
    await user.click(screen.getByRole('button', { name: 'Vytvořit rezervaci' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/reservations', expect.anything()))
    expect(sentBody(api.post).status).toBe(status)
    expect(sentBody(api.post)).not.toHaveProperty('soft')
  })

  it('editing without changing the type does not send status', async () => {
    const { user } = await renderForm(myStay('soft'))
    await user.clear(screen.getByLabelText('Účel návštěvy'))
    await user.type(screen.getByLabelText('Účel návštěvy'), 'Dovolená')
    await user.click(screen.getByRole('button', { name: 'Uložit změny' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/reservations/r-edit', expect.anything()))
    expect(sentBody(api.put).purpose).toBe('Dovolená')
    expect(sentBody(api.put)).not.toHaveProperty('status')
    expect(sentBody(api.put)).not.toHaveProperty('soft')
  })

  it('switching a tentative stay to firm sends status primary', async () => {
    const { user } = await renderForm(myStay('soft'))
    await user.click(screen.getByRole('button', { name: /Pevná/ }))
    await user.click(screen.getByRole('button', { name: 'Uložit změny' }))

    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(sentBody(api.put).status).toBe('primary')
  })

  it('a backup stay shows its type read-only and saves without status', async () => {
    const { user } = await renderForm(myStay('backup'))
    expect(screen.getByText('Záložní – přidělil systém kvůli kolizi')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Pevná/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Předběžná/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Uložit změny' }))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(sentBody(api.put)).not.toHaveProperty('status')
  })

  it('a 409 when switching to firm shows the server message and keeps the form open', async () => {
    const serverMessage = 'V tomto termínu už je jiná pevná rezervace. Změňte termín, nebo rezervaci uložte jako předběžnou.'
    api.put.mockImplementationOnce(() =>
      Promise.reject(Object.assign(new Error('Request failed with status code 409'), {
        isAxiosError: true,
        response: { status: 409, data: { message: serverMessage } },
      })),
    )
    const { user, onClose } = await renderForm(myStay('soft'))
    await user.click(screen.getByRole('button', { name: /Pevná/ }))
    await user.click(screen.getByRole('button', { name: 'Uložit změny' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(serverMessage)
    expect(onClose).not.toHaveBeenCalled()
  })
})
