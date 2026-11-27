import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StayWeatherCard } from '@/features/weather/StayWeatherCard'
import { tileGrid, tileRows } from '@/features/weather/tileGrid'

// Karta Počasí na pobyt podle UX auditu 2026-11-25 (#526). Fiktivní chata, Open-Meteo je mockovaný `fetch`, dnes je sobota 1. 6. 2030.
vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn((url: string) => (url === '/cabin'
      ? Promise.resolve({ data: { id: 'c-1', name: 'Chata U Lesa', weatherLocation: 'Lhota', latitude: 49.5, longitude: 15.2, departureChecklist: [] } })
      : new Promise<never>(() => {}))),
  },
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { userId: 'u-eva', username: 'Eva', role: 'member' }, isAdmin: false }) }))

/** Odpověď Open-Meteo na 16 dní od dneška: přes den 15 °C, v noci 8 °C, slunce 4:52–21:07. */
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

async function renderCard(from: string, to: string) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(openMeteo()) })))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><MemoryRouter><StayWeatherCard from={from} to={to} /></MemoryRouter></QueryClientProvider>)
  const card = await screen.findByRole('region', { name: 'Počasí na pobyt' })
  await within(card).findAllByRole('listitem')
  return card
}

describe('Karta Počasí na pobyt (#526)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2030, 5, 1, 9))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('poznámka k orientačním dnům jmenuje dny pobytu, ne „Dny 8–16“', async () => {
    const card = await renderCard('2030-06-06', '2030-06-09')
    expect(card).toHaveTextContent('So a Ne jsou orientační, předpověď se ještě změní.')
    expect(card).not.toHaveTextContent('Dny 8–16')
  })

  it('jeden orientační den je v jednotném čísle', async () => {
    const card = await renderCard('2030-06-06', '2030-06-08')
    expect(card).toHaveTextContent('So je orientační, předpověď se ještě změní.')
  })

  it('víc než tři orientační dny řekne rozsahem', async () => {
    const card = await renderCard('2030-06-07', '2030-06-12')
    expect(card).toHaveTextContent('So 8. – St 12. jsou orientační, předpověď se ještě změní.')
  })

  it('bez orientačních dnů poznámka chybí', async () => {
    const card = await renderCard('2030-06-03', '2030-06-05')
    expect(card).not.toHaveTextContent('orientační')
  })

  it('délka dne má viditelný popisek', async () => {
    const card = await renderCard('2030-06-03', '2030-06-05')
    const label = within(card).getByText('Délka dne')
    expect(label).not.toHaveClass('sr-only')
    expect(label.parentElement).toHaveTextContent('Délka dne 16 h 15 min')
  })

  it('minimum v hodinovém souhrnu teploty je stejné jako na dlaždici dne', async () => {
    const card = await renderCard('2030-06-03', '2030-06-05')
    fireEvent.click(within(card).getByRole('tab', { name: 'Teplota' }))
    expect(within(card).getByRole('tabpanel')).toHaveTextContent('minimum 8°')
    expect(within(card).getByRole('button', { name: /^Pondělí 3\. 6\./ })).toHaveTextContent('18° / 8°')
  })

  it('dlaždice dnů mají stejnou výšku: řádky mřížky 1fr a tlačítko přes celou buňku', async () => {
    const card = await renderCard('2030-06-03', '2030-06-06')
    const list = within(card).getByRole('list')
    expect(list).toHaveClass('auto-rows-fr')
    for (const day of within(list).getAllByRole('button')) expect(day).toHaveClass('h-full')
  })

  it('čtyři dny na úzké kartě jsou dva řádky po dvou, ne tři a jeden', async () => {
    const card = await renderCard('2030-06-03', '2030-06-06')
    const list = within(card).getByRole('list')
    expect(list.style.getPropertyValue('--cols-3')).toBe('repeat(2, minmax(0, 1fr))')
    expect(within(list).getAllByRole('listitem').map((li) => li.style.getPropertyValue('--span-3'))).toEqual(['1', '1', '1', '1'])
  })
})

describe('Rozložení dlaždic dnů (#526)', () => {
  it('řádky se liší nejvýš o jednu dlaždici a žádná nezůstane v řádku sama', () => {
    for (const maxCols of [3, 5, 7]) {
      for (let n = 2; n <= 16; n++) {
        const rows = tileRows(n, maxCols)
        expect(rows.reduce((a, b) => a + b, 0)).toBe(n)
        expect(Math.max(...rows)).toBeLessThanOrEqual(maxCols)
        expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(1)
        expect(Math.min(...rows)).toBeGreaterThan(1)
      }
    }
    expect(tileRows(7, 3)).toEqual([3, 2, 2])
    expect(tileRows(1, 3)).toEqual([1])
  })

  it('mřížka má společný násobek délek řádků a každý řádek ho vyplní', () => {
    expect(tileGrid(7, 3)).toEqual({ columns: 6, spans: [2, 2, 2, 3, 3, 3, 3] })
    expect(tileGrid(4, 3)).toEqual({ columns: 2, spans: [1, 1, 1, 1] })
    expect(tileGrid(3, 7)).toEqual({ columns: 3, spans: [1, 1, 1] })
  })
})
