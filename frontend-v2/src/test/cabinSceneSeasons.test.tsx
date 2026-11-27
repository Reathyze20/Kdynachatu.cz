import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { DashboardReservationsData, WeatherData } from '@/api/dashboard'
import { CabinScene } from '@/features/dashboard/CabinScene'
import { deriveCabinScene, sceneBackdrop } from '@/features/dashboard/cabinSceneState'
import bgBare from '@/features/dashboard/scene/bg-bare.png'
import bgSnow from '@/features/dashboard/scene/bg-snow.png'
import bgSpring from '@/features/dashboard/scene/bg-spring.png'
import bgSummer from '@/features/dashboard/scene/bg-summer.png'
import bgAutumn from '@/features/dashboard/scene/bg-autumn.png'

// Roční období ve scéně chaty (#656, spec #652): pozadí krajiny podle data zařízení, sníh má přednost. Fiktivní data.

const EMPTY: DashboardReservationsData = {
  activeReservation: null, upcomingReservations: [], myNextReservation: null, departingToday: false, departingReservationId: null,
  nextFreeWeekend: null, lastStay: null, stats: { myNightsThisYear: 0, totalStaysThisMonth: 0 },
}

function weather(overrides: Partial<WeatherData> = {}): WeatherData {
  return {
    temp: 12, description: 'Jasno', icon: 'sun', color: '', humidity: 60, windSpeed: 5, feelsLike: 11, city: 'Horní Lhota',
    sunriseTime: '06:00', sunsetTime: '20:00', uvIndex: 3, precipProbabilityToday: 0, stormAlert: null,
    hourlyRain: [], hourlyWind: [], hourlyTemp: [], forecast: [], weatherCode: 0, snowDepth: 0, ...overrides,
  }
}

const stateOn = (date: string, w?: WeatherData) => deriveCabinScene(EMPTY, false, new Date(`${date}T10:00:00`), w)
const seasonOn = (date: string, w?: WeatherData) => stateOn(date, w).season

describe('roční období ve stavu scény (#656)', () => {
  it.each([
    ['2027-02-28', 'bare'], ['2027-03-01', 'spring'],
    ['2028-02-29', 'bare'], ['2028-03-01', 'spring'],
    ['2027-05-31', 'spring'], ['2027-06-01', 'summer'],
    ['2027-08-31', 'summer'], ['2027-09-01', 'autumn'],
    ['2026-11-15', 'autumn'], ['2026-11-16', 'bare'],
    ['2026-12-31', 'bare'], ['2027-01-01', 'bare'],
  ])('%s je %s', (date, season) => {
    expect(seasonOn(date)).toBe(season)
  })

  it('období nečte počasí: bez počasí i s deštěm je stejné', () => {
    expect(seasonOn('2027-07-15')).toBe('summer')
    expect(seasonOn('2027-07-15', weather({ weatherCode: 63 }))).toBe('summer')
  })

  it('pozadí krajiny je období, sněhová pokrývka má přednost', () => {
    expect(sceneBackdrop(stateOn('2027-04-10'))).toBe('spring')
    expect(sceneBackdrop(stateOn('2026-12-10'))).toBe('bare')
    const snowyApril = stateOn('2027-04-10', weather({ snowDepth: 0.1 }))
    expect(snowyApril.season).toBe('spring')
    expect(sceneBackdrop(snowyApril)).toBe('snow')
    expect(sceneBackdrop(stateOn('2027-10-05', weather({ snowDepth: 0.1 })))).toBe('snow')
  })
})

/** Scéna jako na Přehledu, bez uložené volby a bez reduced-motion je Animovaná. */
function renderScene(date: string, { time = '10:00', w }: { time?: string; w?: WeatherData } = {}) {
  vi.setSystemTime(new Date(`${date}T${time}:00`))
  render(<CabinScene data={EMPTY} winterized={false} weather={w} />)
  return screen.getByRole('img', { name: /^Scéna chaty/ })
}
const layer = (img: HTMLElement, name: string) => img.querySelector(`[data-layer="${name}"]`)
const background = (img: HTMLElement) => layer(img, 'sky')?.querySelector('image')?.getAttribute('href')

describe('pozadí scény podle ročního období (#656)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it.each([
    ['2027-04-10', bgSpring, /Je jaro, louka se zelená\./],
    ['2027-07-15', bgSummer, /Je léto, louka je sytě zelená\./],
    ['2027-10-05', bgAutumn, /Je podzim, louka zlátne a břízy žloutnou\./],
  ])('%s: pozadí období a věta v popisu', (date, href, sentence) => {
    const img = renderScene(date)
    expect(background(img)).toBe(href)
    expect(img).toHaveAccessibleName(sentence)
  })

  it('holá krajina bez sněhu: dnešní pozadí a popis bez věty o období', () => {
    const img = renderScene('2026-12-10')
    expect(background(img)).toBe(bgBare)
    expect(img).not.toHaveAccessibleName(/je jaro|je léto|je podzim/i)
  })

  it('při sněhové pokrývce se kreslí sníh i na jaře a popis o období mlčí', () => {
    const img = renderScene('2027-04-10', { w: weather({ snowDepth: 0.1 }) })
    expect(background(img)).toBe(bgSnow)
    expect(img).toHaveAccessibleName(/leží sníh/i)
    expect(img).not.toHaveAccessibleName(/je jaro/i)
  })

  it.each(['2027-04-10', '2027-07-15', '2027-10-05'])('%s: noc, déšť, mlha, soumrak, vítr a jinovatka se kreslí přes období', (date) => {
    const night = renderScene(date, { time: '23:00' })
    expect(layer(night, 'night')).not.toBeNull()
    expect(night).toHaveAccessibleName(/je noc/i)
    cleanup()

    const rain = renderScene(date, { w: weather({ weatherCode: 63 }) })
    expect(layer(rain, 'rain')).not.toBeNull()
    expect(layer(rain, 'overcast')).not.toBeNull()
    expect(rain).toHaveAccessibleName(/prší\./i)
    cleanup()

    const fog = renderScene(date, { w: weather({ weatherCode: 45 }) })
    expect(layer(fog, 'fog-meadow')).not.toBeNull()
    expect(fog).toHaveAccessibleName(/je mlha\./i)
    cleanup()

    const duskWithSun = renderScene(date, { time: '19:30', w: weather() })
    expect(layer(duskWithSun, 'dusk')).not.toBeNull()
    expect(duskWithSun).toHaveAccessibleName(/zapadá slunce\./i)
    cleanup()

    const windy = renderScene(date, { w: weather({ weatherCode: 63, windSpeed: 45 }) })
    expect(windy).toHaveAccessibleName(/fouká silný vítr, kapky padají šikmo/i)
    cleanup()

    const frost = renderScene(date, { w: weather({ temp: -2 }) })
    expect(frost).toHaveAccessibleName(/jinovatka/i)
    expect(background(frost)).not.toBe(bgSnow)
  })
})
