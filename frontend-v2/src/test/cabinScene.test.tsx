import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import type { ActiveReservation, DashboardReservationsData, UpcomingReservation, WeatherData } from '@/api/dashboard'
import { fetchWeather } from '@/api/dashboard'

// Scéna chaty v kartě „Na chatě teď“ (#563). Fiktivní API Přehledu, dnes je čtvrtek 10. 12. 2026.
const { responses, auth } = vi.hoisted(() => ({ responses: new Map<string, unknown>(), auth: { isGuest: false } }))
vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn((url: string) => (responses.has(url) ? Promise.resolve({ data: responses.get(url) }) : new Promise<never>(() => {}))),
    put: vi.fn(() => new Promise<never>(() => {})),
    post: vi.fn(() => new Promise<never>(() => {})),
  },
}))
vi.mock('@/api/dashboard', () => ({ fetchWeather: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-eva', cabinId: 'c-1', username: 'Eva' }, isAdmin: false, isGuest: auth.isGuest }),
}))

const TODAY = '2026-12-10'

function stay(id: string, username: string, from: string, to: string): UpcomingReservation {
  return { id, userId: `u-${username}`, username, userColor: null, userAnimalIcon: null, from, to, purpose: 'Víkend', status: 'primary' }
}
function active({ userId: _userId, status: _status, ...s }: UpcomingReservation): ActiveReservation {
  return { ...s, handoverNote: null, isCheckoutCompleted: false }
}
function reservations(overrides: Partial<DashboardReservationsData> = {}): DashboardReservationsData {
  return {
    activeReservation: null, upcomingReservations: [], myNextReservation: null, departingToday: false, departingReservationId: null,
    nextFreeWeekend: null, lastStay: null, stats: { myNightsThisYear: 0, totalStaysThisMonth: 0 }, ...overrides,
  }
}

function renderOverview(data: DashboardReservationsData, { time = '10:00', isWinterized = false } = {}) {
  vi.setSystemTime(new Date(`${TODAY}T${time}:00`))
  responses.set('/cabin', { id: 'c-1', name: 'Chata U Lesa', weatherLocation: null, departureChecklist: [], isWinterized })
  responses.set('/dashboard/reservations', data)
  responses.set('/dashboard/shopping', { pendingShoppingItems: [], totalPendingShoppingCount: 0, totalItemsCount: 0, essentialWarning: null })
  responses.set('/dashboard/notes', { latestNotes: [], pinnedHandoverNote: null, handoverNoteAuthor: null, handoverNoteUpdatedAt: null })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><MemoryRouter><DashboardPage /></MemoryRouter></QueryClientProvider>)
}

/** Scéna je obrázek nahoře v kartě „Na chatě teď“ (i v jejím prázdném stavu „Chata zatím čeká“). */
async function scene() {
  const img = await screen.findByRole('img', { name: /^Scéna chaty/ })
  expect(screen.getByTestId('dashboard-reservation-widget')).toContainElement(img)
  return img
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  localStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  responses.clear()
  auth.isGuest = false
})

describe('Scéna chaty v kartě „Na chatě teď“ (#563)', () => {
  it('prázdná chata: plch spí na zápraží, i v prázdném stavu karty', async () => {
    renderOverview(reservations())

    await screen.findByText('Chata zatím čeká')
    const img = await scene()
    expect(img).toHaveAccessibleName(/chata je prázdná/i)
    expect(img).toHaveAccessibleName(/plch spí na zápraží/i)
    expect(img).not.toHaveAccessibleName(/auto|noc/i)
  })

  it('někdo je na chatě: kouř z komína, svítí okno, plch štípe dříví; scéna není fokusovatelná', async () => {
    renderOverview(reservations({ activeReservation: active(stay('r-now', 'Novákovi', '2026-12-08', '2026-12-12')) }))

    const header = await screen.findByRole('region', { name: 'Na chatě teď' })
    const img = within(header).getByRole('img', { name: /^Scéna chaty/ })
    expect(img).toHaveAccessibleName(/někdo je na chatě, z komína jde kouř a svítí okno/i)
    expect(img).toHaveAccessibleName(/plch štípe dříví/i)
    expect(img).not.toHaveAttribute('tabindex')
    expect(img.closest('a, button, [tabindex]')).toBeNull()
  })

  it('v den příjezdu stojí u chaty auto a plch mává', async () => {
    renderOverview(reservations({ upcomingReservations: [stay('r-new', 'Svobodovi', TODAY, '2026-12-13')] }))

    const img = await scene()
    expect(img).toHaveAccessibleName(/dnes někdo přijíždí, u chaty stojí auto/i)
    expect(img).toHaveAccessibleName(/plch mává/i)
  })

  it('v den odjezdu stojí u chaty auto a odjíždějící je do 14:00 ještě na chatě', async () => {
    renderOverview(reservations({ activeReservation: active(stay('r-now', 'Novákovi', '2026-12-07', TODAY)) }), { time: '13:59' })

    const img = await scene()
    expect(img).toHaveAccessibleName(/někdo je na chatě/i)
    expect(img).toHaveAccessibleName(/dnes někdo odjíždí, u chaty stojí auto/i)
  })

  it('po 14:00 v den odjezdu bez příjezdu už odjíždějící na chatě není a auto odjelo (#579)', async () => {
    renderOverview(reservations({ activeReservation: active(stay('r-now', 'Novákovi', '2026-12-07', TODAY)) }), { time: '14:00' })

    const img = await scene()
    expect(img).toHaveAccessibleName(/chata je prázdná/i)
    expect(img).not.toHaveAccessibleName(/auto|mává/i)
    expect(img).toHaveAccessibleName(/plch spí na zápraží/i)
  })

  it('v den odjezdu bez příjezdu plch do 14:00 u auta mává (#579)', async () => {
    renderOverview(reservations({ activeReservation: active(stay('r-now', 'Novákovi', '2026-12-07', TODAY)) }), { time: '13:59' })

    expect(await scene()).toHaveAccessibleName(/u chaty stojí auto\. plch mává/i)
  })

  it('v den příjezdu stojí auto i po 14:00 (#579)', async () => {
    renderOverview(reservations({ upcomingReservations: [stay('r-new', 'Svobodovi', TODAY, '2026-12-13')] }), { time: '18:00' })

    const img = await scene()
    expect(img).toHaveAccessibleName(/dnes někdo přijíždí, u chaty stojí auto/i)
    expect(img).toHaveAccessibleName(/plch mává/i)
  })

  it('předávka ve stejný den: obsazeno i auto; po 14:00 jako karta „Chata je volná“, auto zůstává', async () => {
    const data = reservations({
      activeReservation: active(stay('r-old', 'Novákovi', '2026-12-07', TODAY)),
      upcomingReservations: [stay('r-new', 'Svobodovi', TODAY, '2026-12-13')],
    })
    renderOverview(data)

    let img = await scene()
    expect(img).toHaveAccessibleName(/někdo je na chatě/i)
    expect(img).toHaveAccessibleName(/dnes se na chatě střídají, u chaty stojí auto/i)

    cleanup()
    renderOverview(data, { time: '15:00' })
    expect(await screen.findByRole('group', { name: 'Teď' })).toHaveTextContent('Chata je volná')
    img = await scene()
    expect(img).toHaveAccessibleName(/chata je prázdná/i)
    expect(img).toHaveAccessibleName(/dnes se na chatě střídají, u chaty stojí auto/i)
  })

  it('zazimování přebíjí obsazenost i auto', async () => {
    const data = reservations({
      activeReservation: active(stay('r-old', 'Novákovi', '2026-12-07', TODAY)),
      upcomingReservations: [stay('r-new', 'Svobodovi', TODAY, '2026-12-13')],
    })
    renderOverview(data, { isWinterized: true })

    expect(await screen.findByRole('img', { name: /zazimovaná, okenice jsou zavřené/i })).toHaveAccessibleName(/plch odpočívá/i)
    const img = await scene()
    expect(img).not.toHaveAccessibleName(/někdo je na chatě|auto|mává/i)
  })

  it('noc podle místního času zařízení: tmavá obloha s hvězdami', async () => {
    renderOverview(reservations(), { time: '21:30' })
    expect(await scene()).toHaveAccessibleName(/je noc, na nebi svítí hvězdy/i)

    cleanup()
    renderOverview(reservations(), { time: '05:30' })
    expect(await scene()).toHaveAccessibleName(/je noc/i)

    cleanup()
    renderOverview(reservations(), { time: '07:00' })
    expect(await scene()).not.toHaveAccessibleName(/noc/i)
  })

  it('host: z dat omezených na jeho pobyt scéna cizí obsazenost neukáže', async () => {
    auth.isGuest = true
    // Tvar dat pro hosta (#484): jen jeho vlastní pobyt příští týden, cizí probíhající pobyt backend nepošle.
    renderOverview(reservations({
      upcomingReservations: [stay('r-guest', 'Eva', '2026-12-17', '2026-12-19')],
      myNextReservation: { from: '2026-12-17', to: '2026-12-19', purpose: 'Víkend' },
    }))

    const img = await scene()
    expect(img).toHaveAccessibleName(/chata je prázdná/i)
    expect(img).not.toHaveAccessibleName(/někdo je na chatě|auto/i)
  })
})

// Počasí ve scéně (#564): podvržené dnešní počasí z `fetchWeather`, jen vnější chování (popis scény).
function todayWeather(overrides: Partial<WeatherData> = {}): WeatherData {
  return {
    temp: 5, description: 'Zataženo', icon: 'cloud', color: '', humidity: 80, windSpeed: 5, feelsLike: 3, city: 'Horní Lhota',
    sunriseTime: '07:45', sunsetTime: '16:02', uvIndex: 0, precipProbabilityToday: 0, stormAlert: null,
    hourlyRain: [], hourlyWind: [], hourlyTemp: [], forecast: [], weatherCode: 3, snowDepth: 0, ...overrides,
  }
}

/** Počasí je načtené, až ho ukáže karta dneška nahoře na Přehledu; scéna sdílí stejný dotaz. */
async function weatherLoaded() {
  await waitFor(() => expect(screen.getByTestId('cabin-today')).toHaveTextContent('°C'))
}

describe('Počasí a denní doba ve scéně chaty (#564)', () => {
  afterEach(() => {
    vi.mocked(fetchWeather).mockImplementation(() => Promise.resolve(null))
  })

  it('při sněžení padají vločky a popis zmiňuje sněžení, i přes obsazenou chatu', async () => {
    for (const weatherCode of [71, 73, 77, 85, 86]) {
      vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode }))
      renderOverview(reservations({ activeReservation: active(stay('r-now', 'Novákovi', '2026-12-08', '2026-12-12')) }))

      const img = await screen.findByRole('img', { name: /sněží/i })
      expect(img).toHaveAccessibleName(/někdo je na chatě/i)
      cleanup()
    }
  })

  it('déšť ani přeháňky nejsou sněžení', async () => {
    for (const weatherCode of [61, 80, 95]) {
      vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode }))
      renderOverview(reservations())

      await weatherLoaded()
      expect(await scene()).not.toHaveAccessibleName(/sněží/i)
      cleanup()
    }
  })

  it('při sněhové pokrývce je střecha bílá a popis zmiňuje sníh, i u zazimované chaty', async () => {
    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ snowDepth: 0.12 }))
    renderOverview(reservations(), { isWinterized: true })

    const img = await screen.findByRole('img', { name: /leží sníh/i })
    expect(img).toHaveAccessibleName(/střecha je bílá/i)
    expect(img).toHaveAccessibleName(/zazimovaná/i)
    expect(img).not.toHaveAccessibleName(/sněží/i)
  })

  it('bez sněhové pokrývky střecha bílá není', async () => {
    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ snowDepth: 0 }))
    renderOverview(reservations())

    await weatherLoaded()
    expect(await scene()).not.toHaveAccessibleName(/sníh|bílá/i)
  })

  it('při teplotě 0 °C a nižší mrzne: plch má šálu a je vidět jinovatka', async () => {
    for (const temp of [0, -7]) {
      vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ temp }))
      renderOverview(reservations())

      const img = await screen.findByRole('img', { name: /mrzne/i })
      expect(img).toHaveAccessibleName(/plch má šálu/i)
      expect(img).toHaveAccessibleName(/jinovatka/i)
      cleanup()
    }
  })

  it('nad nulou nemrzne', async () => {
    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ temp: 1 }))
    renderOverview(reservations())

    await weatherLoaded()
    expect(await scene()).not.toHaveAccessibleName(/mrzne|šál|jinovatk/i)
  })

  it('den a noc podle dnešního východu a západu slunce v obci chaty, ne podle hodin zařízení', async () => {
    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ sunriseTime: '07:45', sunsetTime: '16:02' }))
    for (const [time, night] of [['07:44', true], ['07:45', false], ['16:01', false], ['16:02', true]] as const) {
      renderOverview(reservations(), { time })

      await weatherLoaded()
      if (night) expect(await scene()).toHaveAccessibleName(/je noc/i)
      else expect(await scene()).not.toHaveAccessibleName(/noc/i)
      cleanup()
    }

    // Letní večer: podle hodin zařízení by byla noc, slunce ale ještě nezapadlo.
    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ sunriseTime: '04:55', sunsetTime: '21:10' }))
    renderOverview(reservations(), { time: '20:30' })
    await weatherLoaded()
    expect(await scene()).not.toHaveAccessibleName(/noc/i)
  })

  it('bez obce, s nenalezenou obcí i při selhání počasí je scéna bez počasí, bez chyby, noc podle zařízení', async () => {
    const failures: (() => Promise<never> | Promise<'EMPTY_LOCATION' | 'LOCATION_NOT_FOUND' | null>)[] = [
      () => Promise.resolve('EMPTY_LOCATION'),
      () => Promise.resolve('LOCATION_NOT_FOUND'),
      () => Promise.resolve(null),
      () => Promise.reject(new Error('Open-Meteo nedostupné')),
    ]
    for (const failure of failures) {
      vi.mocked(fetchWeather).mockClear()
      vi.mocked(fetchWeather).mockImplementation(failure)
      renderOverview(reservations(), { time: '21:30' })

      await waitFor(() => expect(fetchWeather).toHaveBeenCalled())
      await act(async () => {})
      const img = await scene()
      expect(img).toHaveAccessibleName(/je noc/i)
      expect(img).not.toHaveAccessibleName(/sněží|sníh|mrzne/i)
      expect(screen.queryByText(/chyba|nepodařilo/i)).not.toBeInTheDocument()
      cleanup()
    }
  })
})

// Vypínač „Scéna chaty“ a animace (#565): jen hodnota vypínače, výchozí stav a přítomnost scény, ne snímky animací.
// `data-motion` na obrázku říká, jestli se scéna hýbe (animated), stojí (paused) nebo je statická (static).
function prefersReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)', media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }))
}

describe('Vypínač „Scéna chaty“ na Přehledu (#565)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  })

  it('bez uložené volby se scéna hýbe', async () => {
    prefersReducedMotion(false)
    renderOverview(reservations({ activeReservation: active(stay('r-now', 'Novákovi', '2026-12-08', '2026-12-12')) }))

    expect(await scene()).toHaveAttribute('data-motion', 'animated')
  })

  it('bez uložené volby je scéna při prefers-reduced-motion: reduce statická', async () => {
    prefersReducedMotion(true)
    renderOverview(reservations())

    expect(await scene()).toHaveAttribute('data-motion', 'static')
  })

  it('uložená volba přebije výchozí stav podle zařízení', async () => {
    prefersReducedMotion(false)
    localStorage.setItem('cabinSceneMode', 'static')
    renderOverview(reservations())
    expect(await scene()).toHaveAttribute('data-motion', 'static')

    cleanup()
    prefersReducedMotion(true)
    localStorage.setItem('cabinSceneMode', 'animated')
    renderOverview(reservations())
    expect(await scene()).toHaveAttribute('data-motion', 'animated')
  })

  it('Skrytá: scéna není v DOM, karta „Na chatě teď“ i prázdný stav zůstávají', async () => {
    localStorage.setItem('cabinSceneMode', 'hidden')
    renderOverview(reservations({ activeReservation: active(stay('r-now', 'Novákovi', '2026-12-08', '2026-12-12')) }))

    const header = await screen.findByRole('region', { name: 'Na chatě teď' })
    expect(within(header).getByRole('group', { name: 'Teď' })).toHaveTextContent('Novákovi')
    expect(screen.queryByRole('img', { name: /^Scéna chaty/ })).not.toBeInTheDocument()

    cleanup()
    renderOverview(reservations())
    await screen.findByText('Chata zatím čeká')
    expect(screen.queryByRole('img', { name: /^Scéna chaty/ })).not.toBeInTheDocument()
  })

  it('animace stojí, když je stránka na pozadí, a po návratu se rozběhne', async () => {
    renderOverview(reservations())
    const img = await scene()

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(img).toHaveAttribute('data-motion', 'paused')

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(img).toHaveAttribute('data-motion', 'animated')
  })

  it('animace stojí, když je scéna mimo obrazovku', async () => {
    const callbacks: ((entries: { isIntersecting: boolean }[]) => void)[] = []
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) { callbacks.push(cb) }
      observe() {}
      disconnect() {}
    })
    renderOverview(reservations())
    const img = await scene()

    act(() => callbacks.forEach((cb) => cb([{ isIntersecting: false }])))
    expect(img).toHaveAttribute('data-motion', 'paused')
    act(() => callbacks.forEach((cb) => cb([{ isIntersecting: true }])))
    expect(img).toHaveAttribute('data-motion', 'animated')
  })
})
