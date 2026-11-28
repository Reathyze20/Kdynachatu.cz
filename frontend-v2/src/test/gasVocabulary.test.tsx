import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardReservationsData, LastStay } from '@/api/dashboard'
import type { Reservation } from '@/api/reservations'
import { ActiveReservation } from '@/features/dashboard/ActiveReservation'
import { CheckoutSection } from '@/features/reservations/ui/CheckoutSection'

// Slovník plynu podle rozhodnutí #166 = A: „Plynová bomba“ · Dostatek / Dochází / Došlo.
// Fiktivní data, žádná reálná chata.
const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn((_url: string) => Promise.resolve({ data: {} as unknown })),
    patch: vi.fn((_url: string, _body?: unknown) => Promise.resolve({ data: { isCheckoutCompleted: true } as unknown })),
  },
}))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-eva', username: 'Eva' } }) }))

type Gas = 'full' | 'half' | 'low' | 'empty'
const TODAY = '2026-12-10'
// Čtení všech čtyř uložených hodnot a chybějící hodnoty; staré `half` je Dostatek.
const READ_CASES: [Gas | null, string | null][] = [
  ['full', 'Plynová bomba: Dostatek'],
  ['half', 'Plynová bomba: Dostatek'],
  ['low', 'Plynová bomba: Dochází'],
  ['empty', 'Plynová bomba: Došlo'],
  [null, null],
]
const OLD_GAS_WORDS = /Plný|Půl|Prázdný|Plyn:/i

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`))
  api.get.mockClear()
  api.patch.mockClear()
})
afterEach(() => vi.useRealTimers())

function stay(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 'r-1', userId: 'u-eva', username: 'Eva', from: '2026-12-08', to: TODAY,
    purpose: 'Víkend', status: 'primary', isCheckoutCompleted: false, ...overrides,
  }
}

function renderCheckout(reservation: Reservation) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <CheckoutSection reservation={reservation} />
    </QueryClientProvider>,
  )
}

describe('Stav chaty při odjezdu: plynová bomba', () => {
  it('nabízí tři segmenty Dostatek · Dochází · Došlo a odešle full / low / empty', async () => {
    renderCheckout(stay())

    const gas = await screen.findByRole('group', { name: 'Plynová bomba' })
    expect(within(gas).getAllByRole('button').map((b) => b.textContent)).toEqual(['Dostatek', 'Dochází', 'Došlo'])

    for (const [label, value] of [['Dostatek', 'full'], ['Dochází', 'low'], ['Došlo', 'empty']] as const) {
      fireEvent.click(within(gas).getByRole('button', { name: label }))
      expect(within(gas).getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(screen.getByRole('button', { name: 'Potvrdit odjezd' }))
      await waitFor(() => expect(api.patch).toHaveBeenLastCalledWith('/reservations/r-1/checkout', { checkoutState: { gas: value } }))
    }
  })

  it('plyn jde nechat nevyplněný, i po zrušení výběru', async () => {
    renderCheckout(stay())

    const gas = await screen.findByRole('group', { name: 'Plynová bomba' })
    fireEvent.click(within(gas).getByRole('button', { name: 'Dochází' }))
    fireEvent.click(within(gas).getByRole('button', { name: 'Dochází' }))
    fireEvent.click(screen.getByRole('button', { name: 'Potvrdit odjezd' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/reservations/r-1/checkout', { checkoutState: {} }))
  })
})

describe('Od minule na Přehledu: plynová bomba', () => {
  function renderOverviewCard(gas: Gas | null) {
    const lastStay: LastStay = {
      username: 'Jana', userColor: null, userAnimalIcon: null, from: '2026-12-05', to: '2026-12-07',
      isCheckoutCompleted: true, daysEmpty: 3, checkoutState: { gas, waterOff: true },
    }
    const data: DashboardReservationsData = {
      activeReservation: null, upcomingReservations: [], myNextReservation: null, departingToday: false,
      nextFreeWeekend: null, lastStay, stats: { myNightsThisYear: 0, totalStaysThisMonth: 0 },
    }
    render(
      <MemoryRouter>
        <ActiveReservation data={data} cabinDepartureChecklist={[]} />
      </MemoryRouter>,
    )
  }

  it.each(READ_CASES)('čte %s jako %s', (value, expected) => {
    renderOverviewCard(value)

    const briefing = screen.getByText('Od minule — Jana').parentElement as HTMLElement
    if (expected) expect(briefing).toHaveTextContent(expected)
    else expect(briefing).not.toHaveTextContent(/Plynová bomba/)
    expect(briefing).not.toHaveTextContent(OLD_GAS_WORDS)
  })
})
