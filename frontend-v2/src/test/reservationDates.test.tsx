import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CalendarGrid } from '@/features/reservations/calendar/CalendarGrid'
import { BookingForm } from '@/features/reservations/ui/BookingForm'
import { buildNudges } from '@/features/dashboard/nudges'
import type { Reservation } from '@/api/reservations'
import type { DashboardReservationsData } from '@/api/dashboard'

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { userId: 'u-me' } }) }))
vi.mock('@/api/client', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [] })) } }))

// Pobyt přes noc přechodu na letní čas (So 27. 3. → Ne 28. 3. 2027).
const dstStay: Reservation = {
  id: 'r-dst', userId: 'u-tata', username: 'Táta', from: '2027-03-27', to: '2027-03-28', purpose: 'Víkend', status: 'primary',
}

function barOn(container: HTMLElement, day: string) {
  return container.querySelector(`[data-date="${day}"] [title^="Táta"]`)
}

function renderCalendar() {
  const noop = vi.fn()
  return render(
    <CalendarGrid
      month={2} year={2027} reservations={[dstStay]} availabilities={[]} currentUserId="u-me"
      selectedDay={null} rangeStart={null} onGoToPrev={noop} onGoToNext={noop} onRangeStartSet={noop}
      onRangeClear={noop} onRangeComplete={noop} onShowDetail={noop} onShowMonthList={noop} onDaySelect={noop}
    />,
  )
}

function renderForm(fromDate: string, toDate: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BookingForm open onClose={vi.fn()} fromDate={fromDate} toDate={toDate} allReservations={[dstStay]} />
    </QueryClientProvider>,
  )
}

const overlapWarning = /V tomto termínu existuje jiná rezervace/

afterEach(() => {
  vi.useRealTimers()
})

// Rodina sedí v Europe/Prague: půlnoc je tam 22:00/23:00 UTC předchozího dne
// a 28. 3. 2027 v 02:00 se přechází na letní čas.
beforeAll(() => {
  vi.stubEnv('TZ', 'Europe/Prague')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

describe('reservation dates: calendar and booking form agree in Europe/Prague', () => {
  it('runs in Europe/Prague (sanity check of the test setup)', () => {
    expect(new Date('2027-07-09T22:30:00Z').getDate()).toBe(10)
  })

  it('calendar paints exactly the reserved days across the DST switch', () => {
    const { container } = renderCalendar()
    expect(barOn(container, '2027-03-26')).toBeNull()
    expect(barOn(container, '2027-03-27')).not.toBeNull()
    expect(barOn(container, '2027-03-28')).not.toBeNull()
    expect(barOn(container, '2027-03-29')).toBeNull()
  })

  it('booking form sees an overlap on the departure day, as the calendar does', () => {
    renderForm('2027-03-28', '2027-03-30')
    expect(screen.getByText(overlapWarning)).toBeInTheDocument()
  })

  it('booking form sees no overlap on the day after departure, as the calendar does', () => {
    renderForm('2027-03-29', '2027-03-30')
    expect(screen.queryByText(overlapWarning)).toBeNull()
  })
})

describe('reservation dates: "today" is the local calendar day, not the UTC one', () => {
  function dashboard(to: string): DashboardReservationsData {
    return {
      activeReservation: {
        id: 'r1', username: 'Táta', userColor: null, userAnimalIcon: null, from: '2027-07-08', to,
        purpose: 'Víkend', handoverNote: null, isCheckoutCompleted: false,
      },
      upcomingReservations: [], myNextReservation: null, departingToday: false, nextFreeWeekend: null,
      lastStay: null, stats: { myNightsThisYear: 0, totalStaysThisMonth: 0 },
    }
  }

  it('half an hour after local midnight the departure nudge belongs to the new day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-07-10T00:30:00+02:00')) // = 2027-07-09T22:30Z
    const ids = (to: string) => buildNudges({ reservations: dashboard(to), myUsername: 'Táta' }).map((n) => n.id)
    expect(ids('2027-07-10')).toContain('departure-r1')
    expect(ids('2027-07-09')).not.toContain('departure-r1')
  })
})
