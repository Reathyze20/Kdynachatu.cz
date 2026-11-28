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
  // #685 (spec #677): Scéna chaty je volitelný blok, ve výchozím stavu vypnutý
  responses.set('/users/me', { dashboardPrefs: { cabinScene: true } })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><MemoryRouter><DashboardPage /></MemoryRouter></QueryClientProvider>)
}

/** Scéna je samostatný blok nad kartou „Na chatě teď“ (#685, spec #677), i nad prázdným stavem „Chata zatím čeká“. */
async function scene() {
  const img = await screen.findByRole('img', { name: /^Scéna chaty/ })
  expect(screen.getByTestId('dashboard-scene-widget')).toContainElement(img)
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
  vi.mocked(fetchWeather).mockImplementation(() => Promise.resolve(null))
})

describe('Scéna chaty v kartě „Na chatě teď“ (#563)', () => {
  it('prázdná chata: plch ve dne spí stočený na střeše, i v prázdném stavu karty', async () => {
    renderOverview(reservations())

    await screen.findByText('Chata zatím čeká')
    const img = await scene()
    expect(img).toHaveAccessibleName(/chata je prázdná/i)
    expect(img).toHaveAccessibleName(/plch spí stočený na střeše/i)
    expect(img).not.toHaveAccessibleName(/auto|noc/i)
  })

  it('někdo je na chatě: kouř z komína, svítí okno, plch vykukuje zpoza střechy; scéna není fokusovatelná', async () => {
    renderOverview(reservations({ activeReservation: active(stay('r-now', 'Novákovi', '2026-12-08', '2026-12-12')) }))

    await screen.findByRole('region', { name: 'Na chatě teď' })
    const img = await scene()
    expect(img).toHaveAccessibleName(/někdo je na chatě, z komína jde kouř a svítí okno/i)
    expect(img).toHaveAccessibleName(/plch vykukuje zpoza střechy/i)
    expect(img).not.toHaveAttribute('tabindex')
    expect(img.closest('a, button, [tabindex]')).toBeNull()
  })

  it('v den příjezdu stojí u chaty auto a plch vykukuje', async () => {
    renderOverview(reservations({ upcomingReservations: [stay('r-new', 'Svobodovi', TODAY, '2026-12-13')] }))

    const img = await scene()
    expect(img).toHaveAccessibleName(/dnes někdo přijíždí, u chaty stojí auto/i)
    expect(img).toHaveAccessibleName(/plch vykukuje/i)
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
    expect(img).not.toHaveAccessibleName(/auto|vykukuje/i)
    expect(img).toHaveAccessibleName(/plch spí stočený na střeše/i)
  })

  it('v den odjezdu bez příjezdu u chaty do 14:00 stojí auto a plch vykukuje (#579)', async () => {
    renderOverview(reservations({ activeReservation: active(stay('r-now', 'Novákovi', '2026-12-07', TODAY)) }), { time: '13:59' })

    expect(await scene()).toHaveAccessibleName(/u chaty stojí auto\. plch vykukuje/i)
  })

  it('v den příjezdu stojí auto i po 14:00 (#579)', async () => {
    renderOverview(reservations({ upcomingReservations: [stay('r-new', 'Svobodovi', TODAY, '2026-12-13')] }), { time: '18:00' })

    const img = await scene()
    expect(img).toHaveAccessibleName(/dnes někdo přijíždí, u chaty stojí auto/i)
    expect(img).toHaveAccessibleName(/plch vykukuje/i)
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

    expect(await screen.findByRole('img', { name: /zazimovaná, okenice jsou zavřené/i })).toHaveAccessibleName(/plch přes zimu spí schovaný pod střechou/i)
    const img = await scene()
    expect(img).not.toHaveAccessibleName(/někdo je na chatě|auto|vykukuje/i)
  })

  it('noc podle místního času zařízení: tmavá obloha s hvězdami', async () => {
    renderOverview(reservations(), { time: '21:30' })
    const img = await scene()
    expect(img).toHaveAccessibleName(/je noc, na nebi svítí hvězdy/i)
    // Plch je tvor noční: v noci je vzhůru.
    expect(img).toHaveAccessibleName(/plch v noci hryže u chaty oříšek/i)

    cleanup()
    renderOverview(reservations(), { time: '05:30' })
    expect(await scene()).toHaveAccessibleName(/je noc/i)

    cleanup()
    renderOverview(reservations(), { time: '07:00' })
    expect(await scene()).not.toHaveAccessibleName(/noc/i)
  })

  it('v noci je plch vzhůru i u obsazené chaty, na auto ale vykukuje i po setmění', async () => {
    renderOverview(reservations({ activeReservation: active(stay('r-now', 'Novákovi', '2026-12-08', '2026-12-12')) }), { time: '22:00' })
    expect(await scene()).toHaveAccessibleName(/někdo je na chatě.*plch v noci hryže u chaty oříšek/i)

    cleanup()
    renderOverview(reservations({ upcomingReservations: [stay('r-new', 'Svobodovi', TODAY, '2026-12-13')] }), { time: '22:00' })
    const img = await scene()
    expect(img).toHaveAccessibleName(/u chaty stojí auto\. plch vykukuje zpoza střechy/i)
    expect(img).not.toHaveAccessibleName(/oříšek/i)
  })

  // #685 (spec #677): host nemá volitelné bloky ani personalizaci, scénu nevidí ani se zapnutou v preferencích.
  // Nahrazuje testy „scéna hostovi neukáže cizí obsazenost“ a „host vidí déšť stejně jako ostatní“.
  it('host scénu nevidí, ani když ji má v preferencích zapnutou', async () => {
    auth.isGuest = true
    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode: 61 }))
    // Tvar dat pro hosta (#484): jen jeho vlastní pobyt příští týden, cizí probíhající pobyt backend nepošle.
    renderOverview(reservations({
      upcomingReservations: [stay('r-guest', 'Eva', '2026-12-17', '2026-12-19')],
      myNextReservation: { from: '2026-12-17', to: '2026-12-19', purpose: 'Víkend' },
    }))

    await screen.findByRole('region', { name: 'Na chatě teď' })
    await weatherLoaded()
    expect(screen.queryByRole('img', { name: /^Scéna chaty/ })).not.toBeInTheDocument()
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

  it('při sněhové pokrývce plch přes zimu spí pod střechou, i když je někdo na chatě', async () => {
    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ snowDepth: 0.12 }))
    renderOverview(reservations({ activeReservation: active(stay('r-now', 'Novákovi', '2026-12-08', '2026-12-12')) }))

    const img = await screen.findByRole('img', { name: /leží sníh/i })
    expect(img).toHaveAccessibleName(/plch přes zimu spí schovaný pod střechou/i)
    expect(img).not.toHaveAccessibleName(/vykukuje|oříšek/i)
  })

  it('bez sněhové pokrývky střecha bílá není', async () => {
    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ snowDepth: 0 }))
    renderOverview(reservations())

    await weatherLoaded()
    expect(await scene()).not.toHaveAccessibleName(/sníh|bílá/i)
  })

  it('při teplotě 0 °C a nižší mrzne: je vidět jinovatka', async () => {
    for (const temp of [0, -7]) {
      vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ temp }))
      renderOverview(reservations())

      const img = await screen.findByRole('img', { name: /mrzne/i })
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

// Srážky ve scéně (#609): popis říká, co obraz ukazuje; vrstvy, které popis nezmiňuje (šplouchání, blesk, šedý závoj),
// se ověřují přes `data-layer` skupiny vrstvy.
const layer = (img: HTMLElement, name: string) => img.querySelector(`[data-layer="${name}"]`)

describe('Déšť, mrholení a bouřka ve scéně chaty (#609)', () => {
  afterEach(() => {
    vi.mocked(fetchWeather).mockImplementation(() => Promise.resolve(null))
  })

  it('při mrholení (WMO 51–57) padají řídké kapky, na louce nešplouchá', async () => {
    for (const weatherCode of [51, 53, 55, 56, 57]) {
      vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode }))
      renderOverview(reservations())

      const img = await screen.findByRole('img', { name: /mrholí\./i })
      expect(img).not.toHaveAccessibleName(/prší|bouřka|sněží/i)
      expect(layer(img, 'rain')).not.toBeNull()
      expect(layer(img, 'splash')).toBeNull()
      cleanup()
    }
  })

  it('při dešti, mrznoucím dešti a přeháňkách (WMO 61–67, 80–82) padají husté kapky a na louce šplouchá', async () => {
    for (const weatherCode of [61, 63, 65, 66, 67, 80, 81, 82]) {
      vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode }))
      renderOverview(reservations())

      const img = await screen.findByRole('img', { name: /prší\./i })
      expect(img).not.toHaveAccessibleName(/mrholí|bouřka|sněží/i)
      expect(layer(img, 'rain')).not.toBeNull()
      expect(layer(img, 'splash')).not.toBeNull()
      cleanup()
    }
  })

  it('při bouřce (WMO 95–99) padají husté kapky, šplouchá a obloha jednou za čas zesvětlá bleskem', async () => {
    for (const weatherCode of [95, 96, 99]) {
      vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode }))
      renderOverview(reservations())

      const img = await screen.findByRole('img', { name: /bouřka\./i })
      expect(img).not.toHaveAccessibleName(/mrholí|prší|sněží/i)
      expect(img).toHaveAttribute('data-motion', 'animated')
      for (const name of ['rain', 'splash', 'lightning']) expect(layer(img, name)).not.toBeNull()
      cleanup()
    }
  })

  it('statická scéna i prefers-reduced-motion bez volby: kapky a několik šplouchanců stojí, blesk se nekreslí', async () => {
    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode: 95 }))
    const setups = [
      () => localStorage.setItem('cabinSceneMode', 'static'),
      () => vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)', media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      })),
    ]
    for (const setup of setups) {
      setup()
      renderOverview(reservations())

      const img = await screen.findByRole('img', { name: /bouřka\./i })
      expect(img).toHaveAttribute('data-motion', 'static')
      expect(layer(img, 'rain')).not.toBeNull()
      expect(layer(img, 'splash')).not.toBeNull()
      expect(layer(img, 'lightning')).toBeNull()
      cleanup()
      localStorage.clear()
      vi.unstubAllGlobals()
    }
  })

  it('Skrytá: v bouřce se nic nekreslí', async () => {
    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode: 95 }))
    localStorage.setItem('cabinSceneMode', 'hidden')
    renderOverview(reservations())

    await weatherLoaded()
    expect(screen.queryByRole('img', { name: /^Scéna chaty/ })).not.toBeInTheDocument()
  })

  it('při srážkách je zataženo: ve dne šedý závoj přes oblohu, v noci bez měsíce a hvězd', async () => {
    for (const weatherCode of [51, 61, 95]) {
      vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode }))
      renderOverview(reservations(), { time: '10:00' })
      const day = await screen.findByRole('img', { name: /mrholí|prší|bouřka/i })
      expect(layer(day, 'overcast')).not.toBeNull()
      cleanup()

      renderOverview(reservations(), { time: '21:30' })
      const night = await screen.findByRole('img', { name: /mrholí|prší|bouřka/i })
      expect(night).toHaveAccessibleName(/je noc\./i)
      expect(night).not.toHaveAccessibleName(/hvězd/i)
      expect(layer(night, 'stars')).toBeNull()
      cleanup()
    }
  })

  it('bez srážek je obloha jasná: žádný závoj, v noci svítí hvězdy', async () => {
    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode: 3 }))
    renderOverview(reservations(), { time: '10:00' })
    await weatherLoaded()
    expect(layer(await scene(), 'overcast')).toBeNull()
    cleanup()

    renderOverview(reservations(), { time: '21:30' })
    await weatherLoaded()
    expect(await scene()).toHaveAccessibleName(/je noc, na nebi svítí hvězdy/i)
  })

  it('při srážkách se plch schová pod střechu, i u obsazené chaty a i v noci (nehryže oříšek)', async () => {
    const occupied = reservations({ activeReservation: active(stay('r-now', 'Novákovi', '2026-12-08', '2026-12-12')) })
    for (const [weatherCode, data, time] of [[51, reservations(), '10:00'], [61, occupied, '10:00'], [95, reservations(), '21:30'], [80, occupied, '22:00']] as const) {
      vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode }))
      renderOverview(data, { time })

      const img = await screen.findByRole('img', { name: /mrholí|prší|bouřka/i })
      expect(img).toHaveAccessibleName(/plch se schoval před deštěm pod střechu\./i)
      expect(img).not.toHaveAccessibleName(/vykukuje|oříšek|na střeše/i)
      expect(layer(img, 'mascot')).toBeNull()
      expect(layer(img, 'zzz')).not.toBeNull()
      cleanup()
    }
  })

  it('na auto u chaty plch vykoukne i v dešti, ve dne i v noci', async () => {
    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode: 63 }))
    for (const time of ['10:00', '22:00']) {
      renderOverview(reservations({ upcomingReservations: [stay('r-new', 'Svobodovi', TODAY, '2026-12-13')] }), { time })

      const img = await screen.findByRole('img', { name: /prší/i })
      expect(img).toHaveAccessibleName(/u chaty stojí auto\. plch vykukuje zpoza střechy/i)
      expect(img).not.toHaveAccessibleName(/schoval/i)
      cleanup()
    }
  })

  it('zazimování nebo sníh přebíjí déšť: plch spí zimním spánkem', async () => {
    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode: 61 }))
    renderOverview(reservations(), { isWinterized: true })
    expect(await screen.findByRole('img', { name: /prší/i })).toHaveAccessibleName(/plch přes zimu spí schovaný pod střechou/i)
    cleanup()

    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode: 66, snowDepth: 0.05 }))
    renderOverview(reservations({ upcomingReservations: [stay('r-new', 'Svobodovi', TODAY, '2026-12-13')] }))
    const img = await screen.findByRole('img', { name: /prší/i })
    expect(img).toHaveAccessibleName(/plch přes zimu spí schovaný pod střechou/i)
    expect(img).not.toHaveAccessibleName(/schoval před deštěm|vykukuje/i)
  })

  it('sněhové kódy se nemění: sněží, žádné kapky ani šplouchání a plch se před deštěm neschovává', async () => {
    for (const weatherCode of [71, 75, 77, 85, 86]) {
      vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode }))
      renderOverview(reservations())

      const img = await screen.findByRole('img', { name: /sněží\./i })
      expect(img).not.toHaveAccessibleName(/mrholí|prší|bouřka|schoval/i)
      for (const name of ['rain', 'splash', 'overcast']) expect(layer(img, name)).toBeNull()
      cleanup()
    }
  })

  it('bouřka stojí, když je stránka na pozadí', async () => {
    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode: 95 }))
    renderOverview(reservations())
    const img = await screen.findByRole('img', { name: /bouřka/i })

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(img).toHaveAttribute('data-motion', 'paused')
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
  })
})

// Vítr, mlha a soumrak se svítáním ve scéně (#610): popis říká, co obraz ukazuje; vrstvu bez věty v popisu ověří `data-layer`.
describe('Vítr, mlha, soumrak a svítání ve scéně chaty (#610)', () => {
  const occupied = () => reservations({ activeReservation: active(stay('r-now', 'Novákovi', '2026-12-08', '2026-12-12')) })
  afterEach(() => {
    vi.mocked(fetchWeather).mockImplementation(() => Promise.resolve(null))
  })

  it('od 20 km/h se kouř z komína stáčí po větru, při 19 km/h ne', async () => {
    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ windSpeed: 19 }))
    renderOverview(occupied())
    await weatherLoaded()
    let img = await scene()
    expect(img).toHaveAccessibleName(/z komína jde kouř/i)
    expect(img).not.toHaveAccessibleName(/vítr|stáčí/i)
    cleanup()

    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ windSpeed: 20 }))
    renderOverview(occupied())
    img = await screen.findByRole('img', { name: /fouká vítr, kouř se stáčí\./i })
    expect(layer(img, 'smoke')).not.toBeNull()
  })

  it('od 40 km/h padá déšť i sníh šikmo, při 39 km/h svisle', async () => {
    for (const [weatherCode, falls] of [[63, /prší\./i], [73, /sněží\./i]] as const) {
      vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode, windSpeed: 39 }))
      renderOverview(reservations())
      let img = await screen.findByRole('img', { name: falls })
      expect(img).not.toHaveAccessibleName(/vítr|šikmo/i)
      cleanup()

      vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode, windSpeed: 40 }))
      renderOverview(reservations())
      img = await screen.findByRole('img', { name: falls })
      expect(img).toHaveAccessibleName(weatherCode === 63 ? /fouká silný vítr, kapky padají šikmo\./i : /fouká silný vítr, vločky padají šikmo\./i)
      cleanup()
    }
  })

  it('silný vítr u obsazené chaty v dešti: kouř se stáčí a kapky padají šikmo', async () => {
    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode: 95, windSpeed: 55 }))
    renderOverview(occupied())
    expect(await screen.findByRole('img', { name: /bouřka\./i })).toHaveAccessibleName(/fouká silný vítr, kouř se stáčí a kapky padají šikmo\./i)
  })

  it('vítr se nepopisuje, když není vidět: prázdná chata bez srážek, ani v silném větru', async () => {
    for (const windSpeed of [25, 39, 60]) {
      vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ windSpeed }))
      renderOverview(reservations())
      await weatherLoaded()
      expect(await scene()).not.toHaveAccessibleName(/vítr|stáčí|šikmo/i)
      cleanup()
    }
  })

  it('mlha (WMO 45, 48): pásy přes louku a stromy, ve dne šedý závoj, v noci bez hvězd a měsíce; plch se neschovává', async () => {
    for (const weatherCode of [45, 48]) {
      vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode }))
      renderOverview(reservations(), { time: '10:00' })
      const day = await screen.findByRole('img', { name: /je mlha\./i })
      expect(day).toHaveAccessibleName(/plch spí stočený na střeše/i)
      expect(day).not.toHaveAccessibleName(/schoval/i)
      expect(layer(day, 'overcast')).not.toBeNull()
      cleanup()

      renderOverview(reservations(), { time: '21:30' })
      const night = await screen.findByRole('img', { name: /je mlha\./i })
      expect(night).toHaveAccessibleName(/je noc\./i)
      expect(night).not.toHaveAccessibleName(/hvězd/i)
      expect(layer(night, 'stars')).toBeNull()
      expect(night).toHaveAccessibleName(/plch v noci hryže u chaty oříšek/i)
      cleanup()
    }
  })

  it('jiné kódy než 45 a 48 mlhu nekreslí', async () => {
    for (const weatherCode of [3, 51]) {
      vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode }))
      renderOverview(reservations())
      await weatherLoaded()
      expect(await scene()).not.toHaveAccessibleName(/mlha/i)
      cleanup()
    }
  })

  it('soumrak 45 min před západem slunce do západu, svítání od východu 30 min; mimo tato okna ne', async () => {
    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ sunriseTime: '07:45', sunsetTime: '16:02' }))
    const cases = [
      ['07:44', null], ['07:45', /svítá\./i], ['08:14', /svítá\./i], ['08:15', null],
      ['15:16', null], ['15:17', /zapadá slunce\./i], ['16:01', /zapadá slunce\./i], ['16:02', null],
    ] as const
    for (const [time, twilight] of cases) {
      renderOverview(reservations(), { time })
      await weatherLoaded()
      const img = await scene()
      if (twilight) expect(img).toHaveAccessibleName(twilight)
      else expect(img).not.toHaveAccessibleName(/svítá|zapadá/i)
      expect(img).not.toHaveAccessibleName(twilight?.source.startsWith('svítá') ? /zapadá/i : /svítá/i)
      cleanup()
    }
  })

  it('soumrak ani svítání za zataženého nebe (srážky, sněžení, mlha) ani bez časů slunce; u zazimované chaty ano', async () => {
    for (const weatherCode of [61, 73, 45]) {
      vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode }))
      renderOverview(reservations(), { time: '15:30' })
      await weatherLoaded()
      expect(await scene()).not.toHaveAccessibleName(/zapadá/i)
      cleanup()
    }

    for (const sun of [{ sunriseTime: null }, { sunsetTime: null }]) {
      vi.mocked(fetchWeather).mockResolvedValue(todayWeather(sun))
      for (const time of ['07:50', '15:30']) {
        renderOverview(reservations(), { time })
        await weatherLoaded()
        expect(await scene()).not.toHaveAccessibleName(/svítá|zapadá/i)
        cleanup()
      }
    }

    vi.mocked(fetchWeather).mockResolvedValue(todayWeather())
    renderOverview(reservations(), { time: '15:30', isWinterized: true })
    expect(await screen.findByRole('img', { name: /zapadá slunce\./i })).toHaveAccessibleName(/zazimovaná/i)
  })

  it('statická scéna i prefers-reduced-motion bez volby: mlha, stočený kouř, šikmé srážky a soumrak stojí jako obraz', async () => {
    const setups = [
      () => localStorage.setItem('cabinSceneMode', 'static'),
      () => prefersReducedMotion(true),
    ]
    for (const setup of setups) {
      setup()
      vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode: 45 }))
      renderOverview(reservations())
      const fog = await screen.findByRole('img', { name: /je mlha\./i })
      expect(fog).toHaveAttribute('data-motion', 'static')
      for (const name of ['fog-trees', 'fog-meadow']) expect(layer(fog, name)).not.toBeNull()
      cleanup()

      vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode: 63, windSpeed: 45 }))
      renderOverview(occupied())
      const storm = await screen.findByRole('img', { name: /kouř se stáčí a kapky padají šikmo\./i })
      expect(storm).toHaveAttribute('data-motion', 'static')
      cleanup()

      vi.mocked(fetchWeather).mockResolvedValue(todayWeather())
      renderOverview(reservations(), { time: '15:30' })
      expect(await screen.findByRole('img', { name: /zapadá slunce\./i })).toHaveAttribute('data-motion', 'static')
      cleanup()
      localStorage.clear()
      vi.unstubAllGlobals()
    }
  })

  it('Skrytá: v mlze ani ve větru se nic nekreslí', async () => {
    localStorage.setItem('cabinSceneMode', 'hidden')
    for (const weather of [{ weatherCode: 45 }, { weatherCode: 63, windSpeed: 45 }]) {
      vi.mocked(fetchWeather).mockResolvedValue(todayWeather(weather))
      renderOverview(occupied())
      await weatherLoaded()
      expect(screen.queryByRole('img', { name: /^Scéna chaty/ })).not.toBeInTheDocument()
      cleanup()
    }
  })

  it('mlha a vítr stojí na pozadí i mimo obrazovku', async () => {
    const callbacks: ((entries: { isIntersecting: boolean }[]) => void)[] = []
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) { callbacks.push(cb) }
      observe() {}
      disconnect() {}
    })
    vi.mocked(fetchWeather).mockResolvedValue(todayWeather({ weatherCode: 45, windSpeed: 30 }))
    renderOverview(occupied())
    const img = await screen.findByRole('img', { name: /je mlha\..*kouř se stáčí/i })
    expect(img).toHaveAttribute('data-motion', 'animated')

    act(() => callbacks.forEach((cb) => cb([{ isIntersecting: false }])))
    expect(img).toHaveAttribute('data-motion', 'paused')
    act(() => callbacks.forEach((cb) => cb([{ isIntersecting: true }])))

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(img).toHaveAttribute('data-motion', 'paused')
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    vi.unstubAllGlobals()
  })
})
