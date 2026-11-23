import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { ActiveReservation, DashboardReservationsData, UpcomingReservation } from '@/api/dashboard'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { pickOverviewStay, overviewStayTitle } from '@/features/dashboard/overviewStay'
import { StayWeatherCard } from '@/features/weather/StayWeatherCard'

// Počasí na pobyt na Přehledu (#326). Fiktivní pobyty, Open-Meteo je mockovaný `fetch`, dnes je sobota 1. 6. 2030.
const TODAY = '2030-06-01'
const ME = { userId: 'u-eva', username: 'Eva' }
const { responses } = vi.hoisted(() => ({ responses: new Map<string, unknown>() }))
vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn((url: string) => (responses.has(url) ? Promise.resolve({ data: responses.get(url) }) : new Promise<never>(() => {}))),
    put: vi.fn(() => new Promise<never>(() => {})),
    post: vi.fn(() => new Promise<never>(() => {})),
  },
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { ...ME, role: 'member' }, isAdmin: false }) }))

function stay(id: string, username: string, from: string, to: string, extra: Partial<UpcomingReservation> = {}): UpcomingReservation {
  return { id, userId: `u-${username.toLowerCase()}`, username, userColor: null, userAnimalIcon: null, from, to, purpose: 'Víkend', status: 'primary', ...extra }
}
/** Probíhající pobyt jako z API: bez userId autora a bez stavu. */
function active({ userId: _userId, status: _status, ...s }: UpcomingReservation): ActiveReservation {
  return { ...s, handoverNote: null, isCheckoutCompleted: false }
}

describe('Přehled: výběr pobytu pro počasí', () => {
  const pick = (act: ActiveReservation | null, upcoming: UpcomingReservation[], today = TODAY) =>
    pickOverviewStay(act, upcoming, ME, today)

  it('okno je od 7 dní před příjezdem do dne odjezdu včetně', () => {
    const petr = stay('r-petr', 'Petr', '2030-06-08', '2030-06-10')
    expect(pick(null, [petr])).toEqual({ stay: petr, mine: false })
    expect(pick(null, [petr], '2030-05-31')).toBeNull()
    expect(pick(active(petr), [], '2030-06-10')?.stay.id).toBe('r-petr')
    expect(pick(active(petr), [], '2030-06-11')).toBeNull()
    expect(pick(null, [])).toBeNull()
  })

  it('vlastní pobyt (autor nebo účastník) má přednost, jinak probíhající před příštím', () => {
    const now = active(stay('r-jana', 'Jana', '2030-05-30', '2030-06-02'))
    const petr = stay('r-petr', 'Petr', '2030-06-03', '2030-06-05')
    const mine = stay('r-eva', 'Eva', '2030-06-06', '2030-06-07')
    const withMe = stay('r-karel', 'Karel', '2030-06-04', '2030-06-06', { participants: [{ ...ME, userColor: null, userAnimalIcon: null }] })
    expect(pick(now, [petr])?.stay.id).toBe('r-jana')
    expect(pick(active(stay('r-moje', 'Eva', '2030-05-31', '2030-06-02')), [withMe])).toMatchObject({ mine: true, stay: { id: 'r-moje' } })
    expect(pick(now, [petr, mine])).toMatchObject({ stay: mine, mine: true })
    expect(pick(now, [petr, withMe, mine])).toMatchObject({ stay: withMe, mine: true })
    expect(pick(null, [stay('r-zaloha', 'Eva', '2030-06-03', '2030-06-04', { status: 'backup' }), petr])?.stay.id).toBe('r-petr')
  })

  it('titulek říká, čí pobyt to je, a krátký rozsah dat', () => {
    expect(overviewStayTitle({ stay: stay('r', 'Eva', '2030-06-07', '2030-06-09'), mine: true })).toBe('Tvůj pobyt · pá 7. – ne 9. 6.')
    expect(overviewStayTitle({ stay: stay('r', 'Petr', '2030-06-29', '2030-07-01'), mine: false })).toBe('Pobyt: Petr · so 29. 6. – po 1. 7.')
    expect(overviewStayTitle({ stay: stay('r', 'Petr', '2030-06-08', '2030-06-08'), mine: false })).toBe('Pobyt: Petr · so 8. 6.')
  })
})

/** Odpověď Open-Meteo na 16 dní od dneška. */
function openMeteo() {
  const time = Array.from({ length: 16 }, (_, i) => new Date(Date.UTC(2030, 5, 1 + i)).toISOString().slice(0, 10))
  const hours = time.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`))
  const all = <T,>(list: string[], value: T) => list.map(() => value)
  return {
    daily: {
      time, weather_code: all(time, 2), temperature_2m_max: all(time, 18), temperature_2m_min: all(time, 8),
      sunrise: time.map((d) => `${d}T04:52`), sunset: time.map((d) => `${d}T21:07`), uv_index_max: all(time, 6),
      precipitation_probability_max: all(time, 40), precipitation_sum: all(time, 1),
    },
    hourly: { time: hours, precipitation_probability: all(hours, 30), wind_speed_10m: all(hours, 12), temperature_2m: all(hours, 15) },
  }
}

/** Předpověď na pobyt odpoví fixturou, ostatní volání Open-Meteo (řádek počasí v hlavičce) selžou. */
function mockOpenMeteo() {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(url.includes('forecast_days=16') ? { ok: true, json: () => Promise.resolve(openMeteo()) } : { ok: false, status: 503 }))
  vi.stubGlobal('fetch', fetchMock)
  return () => fetchMock.mock.calls.filter(([url]) => String(url).includes('forecast_days=16')).length
}

function reservations(activeReservation: ActiveReservation | null, upcomingReservations: UpcomingReservation[]): DashboardReservationsData {
  return {
    activeReservation, upcomingReservations, myNextReservation: null, departingToday: false, departingReservationId: null,
    nextFreeWeekend: null, lastStay: null, stats: { myNightsThisYear: 0, totalStaysThisMonth: 0 },
  }
}

function renderWith(qc: QueryClient, node: ReactNode) {
  render(<QueryClientProvider client={qc}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>)
}

function renderOverview(data: DashboardReservationsData, qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  responses.set('/cabin', { id: 'c-1', name: 'Chata U Lesa', weatherLocation: 'Lhota', latitude: 49.5, longitude: 15.2, departureChecklist: [] })
  responses.set('/dashboard/reservations', data)
  responses.set('/dashboard/shopping', { pendingShoppingItems: [], totalPendingShoppingCount: 0, totalItemsCount: 0, essentialWarning: null })
  responses.set('/dashboard/notes', { latestNotes: [], pinnedHandoverNote: null, handoverNoteAuthor: null, handoverNoteUpdatedAt: null })
  renderWith(qc, <DashboardPage />)
  return qc
}

describe('Přehled: karta Počasí na pobyt', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2030, 5, 1, 9))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    responses.clear()
  })

  it('cizí pobyt v okně ukáže v hlavním sloupci se jménem a jen zbývajícími dny', async () => {
    mockOpenMeteo()
    renderOverview(reservations(active(stay('r-petr', 'Petr', '2030-05-30', '2030-06-03')), []))

    const card = await screen.findByRole('region', { name: 'Počasí na pobyt' })
    expect(screen.getByTestId('dashboard-stack')).toContainElement(card)
    expect(card).toHaveTextContent('Pobyt: Petr · čt 30. 5. – po 3. 6.')
    expect(await within(card).findAllByRole('listitem')).toHaveLength(3)
  })

  it('vlastní pobyt má přednost před dřívějším cizím: „Tvůj pobyt“', async () => {
    mockOpenMeteo()
    renderOverview(reservations(null, [
      stay('r-petr', 'Petr', '2030-06-02', '2030-06-04'),
      stay('r-eva', 'Eva', '2030-06-07', '2030-06-09'),
    ]))

    const card = await screen.findByRole('region', { name: 'Počasí na pobyt' })
    expect(card).toHaveTextContent('Tvůj pobyt · pá 7. – ne 9. 6.')
    expect(card).not.toHaveTextContent('Petr')
  })

  it('bez pobytu v okně se karta nevykreslí a nic nestahuje', async () => {
    const forecastCalls = mockOpenMeteo()
    renderOverview(reservations(null, [stay('r-petr', 'Petr', '2030-06-09', '2030-06-11')]))

    await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(screen.queryByRole('region', { name: 'Počasí na pobyt' })).not.toBeInTheDocument()
    expect(forecastCalls()).toBe(0)
  })

  it('hodinový graf je na Přehledu sbalený, otevře ho tlačítko „Hodinový graf“ i ťuknutí na den (#338)', async () => {
    mockOpenMeteo()
    renderOverview(reservations(null, [stay('r-petr', 'Petr', '2030-06-03', '2030-06-05')]))
    const card = await screen.findByRole('region', { name: 'Počasí na pobyt' })
    const toggle = await within(card).findByRole('button', { name: 'Hodinový graf' })
    const chart = () => within(card).queryByRole('tablist', { name: 'Řada hodinového grafu' })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(chart()).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(chart()).toBeInTheDocument()
    fireEvent.click(toggle)
    await waitFor(() => expect(chart()).not.toBeInTheDocument())

    fireEvent.click(within(card).getByRole('button', { name: /^Úterý 4\. 6\./ }))
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(chart()).toBeInTheDocument()
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Úterý')
  })

  it('tlačítko „Hodinový graf“ je v hlavičce karty vedle názvu pobytu, ne pod výstrahami (#356)', async () => {
    mockOpenMeteo()
    renderOverview(reservations(null, [stay('r-petr', 'Petr', '2030-06-03', '2030-06-05')]))
    const card = await screen.findByRole('region', { name: 'Počasí na pobyt' })
    const toggle = await within(card).findByRole('button', { name: 'Hodinový graf' })
    const firstDay = within(card).getByRole('button', { name: /^Pondělí 3\. 6\./ })

    expect(toggle.compareDocumentPosition(firstDay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(toggle.parentElement).toContainElement(within(card).getByText(/^Pobyt: Petr/))
  })

  it('v detailu pobytu zůstává graf otevřený, bez tlačítka „Hodinový graf“ (#338)', async () => {
    mockOpenMeteo()
    responses.set('/cabin', { id: 'c-1', name: 'Chata U Lesa', weatherLocation: 'Lhota', latitude: 49.5, longitude: 15.2, departureChecklist: [] })
    renderWith(new QueryClient({ defaultOptions: { queries: { retry: false } } }), <StayWeatherCard from="2030-06-03" to="2030-06-05" />)
    const card = await screen.findByRole('region', { name: 'Počasí na pobyt' })

    expect(await within(card).findByRole('tablist', { name: 'Řada hodinového grafu' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Hodinový graf' })).not.toBeInTheDocument()
  })

  it('vnořená pole karty (dny, slunce, záložky grafu) mají papír --inset, vybraná záložka povrch karty (#339)', async () => {
    mockOpenMeteo()
    responses.set('/cabin', { id: 'c-1', name: 'Chata U Lesa', weatherLocation: 'Lhota', latitude: 49.5, longitude: 15.2, departureChecklist: [] })
    renderWith(new QueryClient({ defaultOptions: { queries: { retry: false } } }), <StayWeatherCard from="2030-06-03" to="2030-06-05" />)
    const card = await screen.findByRole('region', { name: 'Počasí na pobyt' })

    const days = await within(card).findAllByRole('button', { name: /\d+\. 6\./ })
    expect(days.filter((d) => d.getAttribute('aria-pressed') === 'false').every((d) => d.classList.contains('bg-inset'))).toBe(true)
    expect(within(card).getByRole('tablist', { name: 'Řada hodinového grafu' })).toHaveClass('bg-inset')
    expect(within(card).getByRole('tab', { selected: true })).toHaveClass('bg-sheet')
    expect(card.querySelector('.bg-slate-50, .bg-slate-100, .bg-white')).toBeNull()
  })

  it('detail pobytu po Přehledu předpověď znovu nestahuje (sdílený klíč dotazu)', async () => {
    const forecastCalls = mockOpenMeteo()
    const qc = renderOverview(reservations(null, [stay('r-petr', 'Petr', '2030-06-03', '2030-06-05')]))
    await within(await screen.findByRole('region', { name: 'Počasí na pobyt' })).findAllByRole('listitem')
    cleanup()

    renderWith(qc, <StayWeatherCard from="2030-06-03" to="2030-06-05" />)
    expect(await within(await screen.findByRole('region', { name: 'Počasí na pobyt' })).findAllByRole('listitem')).toHaveLength(3)
    expect(forecastCalls()).toBe(1)
  })
})
