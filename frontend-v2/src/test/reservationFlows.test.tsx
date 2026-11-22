import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
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
    // Typ je od #212 pod rozbalovačem „Víc", nový formulář ho má sbalený.
    await user.click(screen.getByRole('button', { name: /Víc/ }))
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

// Formulář rezervace (#212): nahoře termín, kdo jede a účel, zbytek pod „Víc".
describe('booking form: essentials first, the rest under "Víc"', () => {
  const members = [{ id: 'u-me', username: 'Já' }, { id: 'u-jana', username: 'Jana' }]
  const stay = (over: Partial<Reservation>): Reservation => ({
    id: 'r-edit', userId: 'u-me', username: 'Já', from: '2027-08-02', to: '2027-08-04', purpose: 'Víkend', status: 'primary', ...over,
  })

  async function renderForm({ existing = null, allReservations = [] }: { existing?: Reservation | null; allReservations?: Reservation[] } = {}) {
    const { wrapper } = seededClient()
    render(
      <BookingForm open onClose={vi.fn()} fromDate="2027-08-02" toDate="2027-08-04" existing={existing} allReservations={allReservations} />,
      { wrapper },
    )
    await waitFor(() => expect(screen.getByLabelText('Příjezd')).toHaveFocus())
    return userEvent.setup()
  }

  const moreToggle = () => screen.getByRole('button', { name: /Víc/ })
  const sentBody = () => api.post.mock.calls[0]?.[1] as Record<string, unknown>

  beforeEach(() => {
    api.post.mockClear()
    api.put.mockClear()
    api.get.mockImplementation((url: string) => Promise.resolve({ data: (url === '/users' ? members : []) as unknown }))
  })

  it('a new form shows date, who and purpose with "Víc" collapsed; expanding reveals note, message and type', async () => {
    const user = await renderForm()
    expect(screen.getByLabelText('Odjezd')).toBeInTheDocument()
    expect(screen.getByLabelText('Účel návštěvy')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Kdo jede' })).toBeInTheDocument()
    expect(moreToggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText(/Poznámka/)).toBeNull()
    expect(screen.queryByLabelText(/Vzkaz pro dalšího/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Předběžná/ })).toBeNull()

    await user.click(moreToggle())
    expect(moreToggle()).toHaveAttribute('aria-expanded', 'true')
    // Sekce se prolíná z nulové průhlednosti, viditelná je až po krátké animaci.
    await waitFor(() => {
      expect(screen.getByLabelText(/Poznámka/)).toBeVisible()
      expect(screen.getByLabelText(/Vzkaz pro dalšího/)).toBeVisible()
      expect(screen.getByRole('button', { name: /Předběžná/ })).toBeVisible()
    })
  })

  it('the "Víc" toggle works from the keyboard', async () => {
    const user = await renderForm()
    moreToggle().focus()
    await user.keyboard('{Enter}')
    expect(moreToggle()).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard(' ')
    expect(moreToggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it.each([
    ['a note', { notes: 'Klíč u sousedů' }],
    ['a message for the next one', { handoverNote: 'Dřevo došlo' }],
    ['a tentative type', { status: 'soft' as const }],
    ['a backup type', { status: 'backup' as const }],
  ])('editing a stay with %s opens with "Víc" expanded', async (_label, over) => {
    await renderForm({ existing: stay(over) })
    expect(moreToggle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('editing a plain firm stay keeps "Víc" collapsed', async () => {
    await renderForm({ existing: stay({ notes: '', handoverNote: '' }) })
    expect(moreToggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('a validation error on a hidden field expands "Víc" and shows the error at the field', async () => {
    api.post.mockImplementationOnce(() =>
      Promise.reject(Object.assign(new Error('Request failed with status code 400'), {
        isAxiosError: true,
        response: { status: 400, data: { message: 'Chyba validace', errors: [{ path: 'notes', message: 'Maximální délka je 1000 znaků' }] } },
      })),
    )
    const user = await renderForm()
    await user.type(screen.getByLabelText('Účel návštěvy'), 'Víkend')
    await user.click(screen.getByRole('button', { name: 'Vytvořit rezervaci' }))

    await waitFor(() => expect(moreToggle()).toHaveAttribute('aria-expanded', 'true'))
    const notes = screen.getByLabelText(/Poznámka/)
    expect(notes).toHaveAttribute('aria-invalid', 'true')
    expect(notes).toHaveAccessibleDescription('Maximální délka je 1000 znaků')
  })

  it('an empty purpose is not sent and the form says so at the field', async () => {
    const user = await renderForm()
    await user.click(screen.getByRole('button', { name: 'Vytvořit rezervaci' }))

    const purpose = screen.getByLabelText('Účel návštěvy')
    expect(purpose).toHaveAttribute('aria-required', 'true')
    expect(purpose).toHaveAttribute('aria-invalid', 'true')
    expect(purpose).toHaveAccessibleDescription('Vyplňte účel návštěvy.')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('a purpose over 100 characters is not sent', async () => {
    const user = await renderForm()
    await user.click(screen.getByLabelText('Účel návštěvy'))
    await user.paste('x'.repeat(101))
    await user.click(screen.getByRole('button', { name: 'Vytvořit rezervaci' }))

    expect(screen.getByLabelText('Účel návštěvy')).toHaveAccessibleDescription('Účel může mít nejvýš 100 znaků.')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('"Ty" is always selected and cannot be removed; co-travellers toggle and go out without the organizer', async () => {
    const user = await renderForm()
    const who = screen.getByRole('group', { name: 'Kdo jede' })
    expect(within(who).getByText('Ty')).toBeInTheDocument()
    expect(within(who).queryByRole('button', { name: /Ty/ })).toBeNull()

    const jana = await within(who).findByRole('button', { name: 'Jana' })
    expect(jana).toHaveAttribute('aria-pressed', 'false')
    await user.click(jana)
    expect(jana).toHaveAttribute('aria-pressed', 'true')

    await user.type(screen.getByLabelText('Účel návštěvy'), 'Víkend')
    await user.click(screen.getByRole('button', { name: 'Vytvořit rezervaci' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/reservations', expect.anything()))
    expect(sentBody().participantIds).toEqual(['u-jana'])
    expect(sentBody().status).toBe('primary')
  })

  it('the backup warning is visible without expanding "Víc"', async () => {
    await renderForm({ allReservations: [stay({ id: 'r-other', userId: 'u-jana', username: 'Jana' })] })
    expect(moreToggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(/bude uložena jako záložní/)).toBeVisible()
  })

  it('when an admin edits someone else\'s stay, the owner is the fixed organizer and the admin is a co-traveller', async () => {
    await renderForm({ existing: stay({ userId: 'u-jana', username: 'Jana' }) })
    const who = screen.getByRole('group', { name: 'Kdo jede' })
    expect(await within(who).findByRole('button', { name: 'Já' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(who).getByText('Jana')).toBeInTheDocument()
    expect(within(who).queryByRole('button', { name: 'Jana' })).toBeNull()
    expect(within(who).queryByText('Ty')).toBeNull()
  })
})
