import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NotFoundPage } from '@/features/not-found/NotFoundPage'
import dormouseMap from '@/features/dashboard/scene/dormouse-map.png'
import dormouseMapWalk from '@/features/dashboard/scene/dormouse-map-walk.png'
import tokensCss from '@/styles/shadcn-tokens.css?raw'

// Plch s mapou na 404 (#657): podle volby „Scéna chaty“ v zařízení jednou přejde (Animovaná), rovnou stojí
// v poslední póze (Statická, nebo reduced-motion bez uložené volby), nebo zůstane ikona (Skrytá).
// Funguje i pro nepřihlášené, nadpis, text a tlačítko se nemění.

const auth = vi.hoisted(() => ({ isLoggedIn: false }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }))

function device({ reduceMotion = false } = {}) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduceMotion && query === '(prefers-reduced-motion: reduce)',
    media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }))
}

function renderNotFound() {
  return render(<MemoryRouter initialEntries={['/neexistuje']}><NotFoundPage /></MemoryRouter>)
}

const dormouse = () => screen.queryByTestId('not-found-dormouse')
const mapPinOff = (container: HTMLElement) => container.querySelector('svg.lucide-map-pin-off')

/** Tělo keyframu z `shadcn-tokens.css`. */
function keyframes(name: string) {
  return new RegExp(`@keyframes ${name}\\s*{([\\s\\S]*?)\\n {2}}`).exec(tokensCss)?.[1] ?? ''
}
/** Hodnota tokenu `--animate-<name>` z `shadcn-tokens.css`. */
function animation(name: string) {
  return new RegExp(`--animate-${name}:\\s*([^;]+);`).exec(tokensCss)?.[1] ?? ''
}

beforeEach(() => {
  localStorage.clear()
  auth.isLoggedIn = false
  device()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('404 ve stavu Animovaná (#657)', () => {
  it('plch s mapou jednou přejde po pásu snímků a je jen dekorace', () => {
    localStorage.setItem('cabinSceneMode', 'animated')
    const { container } = renderNotFound()

    const walker = dormouse()
    expect(walker).not.toBeNull()
    expect(walker).toHaveAttribute('aria-hidden', 'true')
    expect(walker).toHaveClass('pointer-events-none', 'animate-not-found-pass')
    const strip = walker!.querySelector('img')
    expect(strip).toHaveAttribute('src', dormouseMapWalk)
    expect(strip).toHaveAttribute('alt', '')
    expect(strip).toHaveClass('animate-not-found-frames')
    expect(mapPinOff(container)).toBeNull()
  })

  it('animace není nekonečná, trvá kolem 2 s a skončí na posledním snímku pásu', () => {
    for (const name of ['not-found-pass', 'not-found-frames']) {
      const value = animation(name)
      expect(value, name).not.toBe('')
      expect(value, name).not.toMatch(/infinite/)
      expect(value, name).toMatch(/\bforwards\b/)
      const ms = Number(/(\d+)ms/.exec(value)?.[1])
      expect(ms, name).toBeGreaterThanOrEqual(1500)
      expect(ms, name).toBeLessThanOrEqual(2500)
    }
    // Pás MAPA-4: 26 snímků po 100 CSS px (50 px spritu 2×); poslední snímek začíná na 2500 px.
    expect(animation('not-found-frames')).toMatch(/steps\(26, jump-none\)/)
    expect(keyframes('not-found-frames')).toMatch(/to\s*{\s*transform:\s*translateX\(-2500px\);\s*}/)
  })

  it('hýbe se jen transform, krokovaně jako pixel art', () => {
    for (const name of ['not-found-pass', 'not-found-frames']) {
      const body = keyframes(name)
      const properties = [...body.matchAll(/([\w-]+)\s*:/g)].map((match) => match[1])
      expect(properties.length, name).toBeGreaterThan(0)
      expect(new Set(properties), name).toEqual(new Set(properties.filter((p) => p === 'transform' || p === 'animation-timing-function')))
    }
    expect(keyframes('not-found-pass')).toMatch(/steps\(\d+/)
  })

  it('výslovná volba Animovaná platí i při reduced-motion v zařízení', () => {
    device({ reduceMotion: true })
    localStorage.setItem('cabinSceneMode', 'animated')
    renderNotFound()
    expect(dormouse()).toHaveClass('animate-not-found-pass')
  })
})

describe('404 ve stavu Statická (#657)', () => {
  it.each([
    ['uložená volba Statická', () => localStorage.setItem('cabinSceneMode', 'static')],
    ['reduced-motion bez uložené volby', () => device({ reduceMotion: true })],
  ])('%s: rovnou poslední póza bez animace', (_name, arrange) => {
    arrange()
    const { container } = renderNotFound()

    const still = dormouse()
    expect(still).not.toBeNull()
    expect(still).toHaveAttribute('aria-hidden', 'true')
    expect(still).toHaveClass('pointer-events-none')
    const img = still!.tagName === 'IMG' ? still! : still!.querySelector('img')
    expect(img).toHaveAttribute('src', dormouseMap)
    expect(img).toHaveAttribute('alt', '')
    expect(container.querySelector('[class*="animate-"]')).toBeNull()
    expect(mapPinOff(container)).toBeNull()
  })
})

describe('404 ve stavu Skrytá (#657)', () => {
  it('ukáže původní ikonu MapPinOff a žádného plcha', () => {
    localStorage.setItem('cabinSceneMode', 'hidden')
    const { container } = renderNotFound()
    expect(mapPinOff(container)).not.toBeNull()
    expect(dormouse()).toBeNull()
    expect(container.querySelector('img[src*="dormouse"]')).toBeNull()
  })
})

describe('text a cesta dál na 404 se nemění (#657)', () => {
  it.each([
    ['animated', false, '/', 'Zpět na úvod'],
    ['static', false, '/', 'Zpět na úvod'],
    ['hidden', false, '/', 'Zpět na úvod'],
    ['animated', true, '/dashboard', 'Zpět na přehled'],
    ['static', true, '/dashboard', 'Zpět na přehled'],
    ['hidden', true, '/dashboard', 'Zpět na přehled'],
  ])('%s, přihlášený %s: nadpis, věta a tlačítko na %s', (mode, loggedIn, href, label) => {
    localStorage.setItem('cabinSceneMode', mode)
    auth.isLoggedIn = loggedIn
    renderNotFound()

    expect(screen.getByRole('heading', { level: 2, name: 'Stránka nenalezena' })).toBeInTheDocument()
    expect(screen.getByText('Tato stránka neexistuje nebo jsme ji přesunuli. Zkontroluj adresu a zkus to znovu.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href)
    // Plch je dekorativní: čtečka nevidí žádný obrázek.
    expect(screen.queryByRole('img')).toBeNull()
  })
})
