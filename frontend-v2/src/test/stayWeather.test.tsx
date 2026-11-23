import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Reservation } from '@/api/reservations'
import { ReservationDetail } from '@/features/reservations/ui/ReservationDetail'
import { fetchCabinForecast, pickStayForecast, stayForecastWindow, type CabinForecast } from '@/api/stayWeather'

// Počasí na pobyt (#324): Open-Meteo je mockovaný `fetch`, dnes je sobota 1. 6. 2030.
const TODAY = '2030-06-01'
const { api, auth } = vi.hoisted(() => ({
  api: { get: vi.fn((_url: string) => Promise.resolve({ data: null as unknown })) },
  auth: { role: 'member' },
}))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { userId: 'u-me', role: auth.role } }) }))

/** Odpověď Open-Meteo na 16 dní od dneška; `codes` a `mins` přepíšou počasí a minimum podle data. */
function openMeteo(codes: Record<string, number> = {}, mins: Record<string, number> = {}) {
  const time = Array.from({ length: 16 }, (_, i) => new Date(Date.UTC(2030, 5, 1 + i)).toISOString().slice(0, 10))
  const hours = time.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`))
  const each = <T,>(list: string[], value: (d: string) => T) => list.map(value)
  return {
    daily: {
      time, weather_code: each(time, (d) => codes[d] ?? 2), temperature_2m_max: each(time, () => 18.4),
      temperature_2m_min: each(time, (d) => mins[d] ?? 7.6), sunrise: each(time, (d) => `${d}T04:52`), sunset: each(time, (d) => `${d}T21:07`),
      uv_index_max: each(time, () => 6.3), precipitation_probability_max: each(time, () => 40), precipitation_sum: each(time, () => 1.26),
    },
    hourly: { time: hours, precipitation_probability: each(hours, () => 30), wind_speed_10m: each(hours, () => 12.4), temperature_2m: each(hours, () => 15.2) },
  }
}

function mockFetch(...bodies: unknown[]) {
  const fetchMock = vi.fn()
  for (const body of bodies) fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(body) })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const PLACE = { weatherLocation: 'Lhota', municipalityName: 'Lhota', latitude: 49.5, longitude: 15.2 }
const NO_PLACE = { weatherLocation: null, latitude: null, longitude: null }

afterEach(() => vi.unstubAllGlobals())

describe('předpověď na pobyt: API', () => {
  it('stáhne 16 dní pro obec a vrátí jen dny pobytu s hodinovými řadami, u probíhajícího zbývající, od 8. dne orientační', async () => {
    const fetchMock = mockFetch(openMeteo())
    const result = (await fetchCabinForecast(PLACE)) as CabinForecast
    const stay = pickStayForecast(result, '2030-06-03', '2030-06-05', TODAY)
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/latitude=49\.5&longitude=15\.2.*forecast_days=16/)
    expect(stay.days.map((d) => [d.date, d.dayName])).toEqual([['2030-06-03', 'Po'], ['2030-06-04', 'Út'], ['2030-06-05', 'St']])
    expect(stay.days[0]).toMatchObject({ tempMax: 18, tempMin: 8, precipProbability: 40, sunrise: '04:52', sunset: '21:07', uvIndex: 6, tentative: false })
    expect(stay.days[0].hours).toHaveLength(24)
    expect(stay.days[0].hours[14]).toEqual({ time: '14:00', precipProbability: 30, windSpeed: 12, temp: 15 })
    expect(pickStayForecast(result, '2030-05-30', '2030-06-02', TODAY).days.map((d) => d.date)).toEqual(['2030-06-01', '2030-06-02'])
    const later = pickStayForecast(result, '2030-06-06', '2030-06-09', TODAY).days
    expect(later.map((d) => [d.date, d.tentative])).toEqual([['2030-06-06', false], ['2030-06-07', false], ['2030-06-08', true], ['2030-06-09', true]])
  })

  it('pobyt za horizontem dostane datum začátek minus 15 dní, skončený pobyt nic', () => {
    expect(stayForecastWindow('2030-06-17', '2030-06-19', TODAY)).toEqual({ kind: 'later', availableFrom: '2030-06-02' })
    expect(stayForecastWindow('2030-06-16', '2030-06-19', TODAY)).toEqual({ kind: 'open' })
    expect(stayForecastWindow('2030-05-28', '2030-05-31', TODAY)).toEqual({ kind: 'ended' })
    expect(stayForecastWindow('2030-05-28', TODAY, TODAY)).toEqual({ kind: 'open' })
  })

  it('bez lokality nestahuje nic, textovou lokalitu geokóduje, nenalezenou ohlásí', async () => {
    const fetchMock = mockFetch({ results: [{ latitude: 50.1, longitude: 14.4, name: 'Lhota' }] }, openMeteo(), { results: [] })
    expect(await fetchCabinForecast({ ...NO_PLACE, weatherLocation: ' ' })).toBe('EMPTY_LOCATION')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await fetchCabinForecast({ ...NO_PLACE, weatherLocation: 'Lhota' })).toMatchObject({ city: 'Lhota' })
    expect(String(fetchMock.mock.calls[1][0])).toContain('latitude=50.1&longitude=14.4')
    expect(await fetchCabinForecast({ ...NO_PLACE, weatherLocation: 'Nikde' })).toBe('LOCATION_NOT_FOUND')
  })
})

function renderDetail(from: string, to: string, cabin: object = PLACE, role = 'member') {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2030, 5, 1, 9))
  auth.role = role
  api.get.mockImplementation((url: string) => Promise.resolve({ data: url === '/cabin' ? cabin : { watching: false } }))
  const stay: Reservation = { id: 'r-1', userId: 'u-petr', username: 'Petr', from, to, purpose: 'Víkend', status: 'primary' }
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <ReservationDetail reservation={stay} onBack={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onAssign={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const weatherCard = () => screen.queryByRole('region', { name: 'Počasí na pobyt' })

describe('předpověď na pobyt: karta v detailu pobytu', () => {
  afterEach(() => vi.useRealTimers())

  it('ukáže dny pobytu, slunce, UV, výstrahy se jménem dne a štítek orientační', async () => {
    // Pá přeháňky (WMO 80, ne bouřka) a 0 °C, So bouřka, Ne nejchladnější −3 °C
    mockFetch(openMeteo({ '2030-06-07': 80, '2030-06-08': 96 }, { '2030-06-07': 0, '2030-06-09': -3 }))
    renderDetail('2030-06-07', '2030-06-09')

    const card = await screen.findByRole('region', { name: 'Počasí na pobyt' })
    const days = await within(card).findAllByRole('listitem')
    expect(days.map((d) => d.querySelector('.sr-only')?.textContent)).toEqual([
      'Pátek 7. 6.: Přeháňky, 18 až 0 °C, srážky 40 %',
      'Sobota 8. 6.: Bouřka, 18 až 8 °C, srážky 40 %, orientační',
      'Neděle 9. 6.: Polojasno, 18 až −3 °C, srážky 40 %, orientační',
    ])
    for (const text of ['04:52', '21:07', 'UV 6 vysoký']) expect(within(card).getByText(text)).toBeInTheDocument()
    expect(within(card).getByText(/mráz až −3 °C/).textContent).toContain('Ne 9. 6.:')
    expect(within(card).getByText(/hrozí bouřka/).textContent).toContain('So 8. 6.:')
    expect(within(card).getAllByText('orientační')).toHaveLength(2)
  })

  it('pobyt za horizontem ukáže, od kdy bude předpověď, a nic nestahuje', async () => {
    const fetchMock = mockFetch()
    renderDetail('2030-06-20', '2030-06-22')

    expect(await screen.findByRole('region', { name: 'Počasí na pobyt' })).toHaveTextContent('Předpověď bude k dispozici od st 5. 6.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skončený pobyt kartu nemá, výpadek Open-Meteo ukáže krátkou větu a detail nerozbije', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    renderDetail('2030-05-20', '2030-05-22')
    await screen.findByText('Víkend')
    expect(weatherCard()).not.toBeInTheDocument()
    cleanup()

    renderDetail('2030-06-03', '2030-06-04')
    expect(await screen.findByText('Předpověď se teď nepodařilo načíst.')).toBeInTheDocument()
    expect(screen.getByTestId('reservation-detail-card')).toHaveTextContent('Víkend')
  })

  it('bez lokality vidí správce odkaz do nastavení, člen kartu nevidí', async () => {
    renderDetail('2030-06-03', '2030-06-04', NO_PLACE, 'admin')
    expect(await screen.findByRole('link', { name: 'Nastavit lokalitu počasí' })).toHaveAttribute('href', '/admin/cabin')
    cleanup()

    renderDetail('2030-06-03', '2030-06-04', NO_PLACE)
    await screen.findByText('Víkend')
    await waitFor(() => expect(weatherCard()).not.toBeInTheDocument())
    expect(screen.queryByRole('link', { name: 'Nastavit lokalitu počasí' })).not.toBeInTheDocument()
  })
})
