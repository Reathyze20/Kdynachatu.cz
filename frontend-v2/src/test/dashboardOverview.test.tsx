import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import type { DashboardReservationsData, UpcomingReservation } from '@/api/dashboard'

// Fiktivní API Přehledu (redesign #172). Žádná reálná data chaty.
const { responses } = vi.hoisted(() => ({ responses: new Map<string, unknown>() }))
vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn((url: string) =>
      responses.has(url) ? Promise.resolve({ data: responses.get(url) }) : new Promise<never>(() => {}),
    ),
  },
}))
vi.mock('@/api/dashboard', () => ({ fetchWeather: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-eva', cabinId: 'c-1', username: 'Eva' }, isAdmin: false }),
}))

const TODAY = '2026-12-10'

function upcoming(id: string, username: string, from: string, to: string, status = 'primary'): UpcomingReservation {
  return { id, userId: `u-${username}`, username, userColor: null, userAnimalIcon: null, from, to, purpose: 'Víkend', status }
}

function reservations(overrides: Partial<DashboardReservationsData> = {}): DashboardReservationsData {
  return {
    activeReservation: null,
    upcomingReservations: [],
    myNextReservation: null,
    departingToday: false,
    departingReservationId: null,
    nextFreeWeekend: null,
    lastStay: null,
    stats: { myNightsThisYear: 0, totalStaysThisMonth: 0 },
    ...overrides,
  }
}

function renderOverview(data: DashboardReservationsData) {
  responses.set('/cabin', { id: 'c-1', name: 'Chata U Lesa', weatherLocation: null, departureChecklist: [] })
  responses.set('/dashboard/reservations', data)
  responses.set('/dashboard/shopping', { pendingShoppingItems: [], totalPendingShoppingCount: 0, totalItemsCount: 0, essentialWarning: null })
  responses.set('/dashboard/notes', { latestNotes: [], pinnedHandoverNote: null, handoverNoteAuthor: null, handoverNoteUpdatedAt: null })
  responses.set('/dashboard/reconstruction', { totalActiveCount: 0, items: [] })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Přehled: řetězec turnusu teď → pak (#172)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${TODAY}T10:00:00`))
    localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    responses.clear()
  })

  it('karta „na chatě teď“ ukazuje řádek se dvěma dalšími pevnými pobyty, vlastní jako „Ty“', async () => {
    renderOverview(reservations({
      activeReservation: {
        id: 'r-now', username: 'Novákovi', userColor: null, userAnimalIcon: null,
        from: '2026-12-08', to: '2026-12-12', purpose: 'Víkend', handoverNote: null, isCheckoutCompleted: false,
      },
      upcomingReservations: [
        upcoming('r-eva', 'Eva', '2026-12-14', '2026-12-16'),
        upcoming('r-backup', 'Petr', '2026-12-20', '2026-12-22', 'backup'),
        upcoming('r-jana', 'Jana', '2026-12-28', '2026-12-30'),
      ],
    }))

    const chain = await screen.findByRole('group', { name: 'Řetězec turnusu' })
    expect(screen.getByTestId('dashboard-reservation-widget')).toContainElement(chain)
    expect(chain).toHaveTextContent('Teď: Novákovi')
    expect(chain).toHaveTextContent('Další: Ty po 14. 12.')
    expect(chain).toHaveTextContent('Pak: Jana po 28. 12.')
    expect(within(chain).queryByText('Petr')).not.toBeInTheDocument()
  })

  it('bez pobytu přes dnešek začíná řádek „Volno“', async () => {
    renderOverview(reservations({ upcomingReservations: [upcoming('r-jana', 'Jana', '2026-12-28', '2026-12-30')] }))

    const chain = await screen.findByRole('group', { name: 'Řetězec turnusu' })
    expect(chain).toHaveTextContent('Teď: Volno')
    expect(chain).toHaveTextContent('Další: Jana po 28. 12.')
  })

  it('bez aktuálního i budoucího pobytu se řádek nevykreslí', async () => {
    renderOverview(reservations())

    await screen.findByTestId('dashboard-reservation-widget')
    await screen.findByText('Chata je volná!')
    expect(screen.queryByRole('group', { name: 'Řetězec turnusu' })).not.toBeInTheDocument()
  })
})
