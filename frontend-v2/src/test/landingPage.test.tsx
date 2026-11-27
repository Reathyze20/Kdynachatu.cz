import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NewLandingPage } from '@/features/landing/NewLandingPage'

// #700: nová landing page na design systému. Pořadí sekcí, jediné h1, žádný ceník ani registrace a scéna
// chaty v heru bez počasí a bez API, podle volby „Scéna chaty“ v zařízení.
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/api/client', () => ({ default: api, apiClient: api }))

function prefersReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)', media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }))
}

const renderLanding = () => render(<MemoryRouter><NewLandingPage /></MemoryRouter>)
const scene = () => screen.queryByRole('img', { name: /^Scéna chaty/ })

beforeEach(() => {
  localStorage.clear()
  prefersReducedMotion(false)
})
afterEach(() => {
  vi.unstubAllGlobals()
  api.get.mockReset()
  api.post.mockReset()
})

describe('landing page (#700)', () => {
  it('má jediné h1 s claimem a nadpisy bez přeskočené úrovně', () => {
    renderLanding()
    const h1 = screen.getAllByRole('heading', { level: 1 })
    expect(h1).toHaveLength(1)
    expect(h1[0]).toHaveTextContent('Sdílená chata bez dohadování.')

    const levels = screen.getAllByRole('heading').map((h) => Number(h.tagName.slice(1)))
    expect(levels[0]).toBe(1)
    levels.slice(1).forEach((level, i) => expect(level - levels[i]).toBeLessThanOrEqual(1))
  })

  it('sekce jdou v pořadí lišta → hero → screenshoty → funkce → formulář → patička', () => {
    const { container } = renderLanding()
    const order = ['nav', '#hero', '#ukazka', '#funkce', '#zapis', 'footer'].map((sel) => {
      const el = container.querySelector(sel)
      expect(el, sel).not.toBeNull()
      return el as Element
    })
    order.slice(1).forEach((el, i) => {
      expect(order[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
    expect(within(container.querySelector('#hero') as HTMLElement).getByText(/Kdo kdy jede, v jakém stavu chatu nechal a co dochází\./)).toBeInTheDocument()
    expect(within(container.querySelector('#ukazka') as HTMLElement).getByRole('heading', { name: 'Víš, v jakém stavu najdeš chatu, ještě než vyjedeš.' })).toBeInTheDocument()
  })

  it('nemá ceník, Discord, nepravdivé funkce ani CTA na registraci', () => {
    const { container } = renderLanding()
    expect(container).not.toHaveTextContent(/ceník|předplatné|Kč\s*\/\s*měsíc|Discord|kanban|nástěnk|osobní volno|Vyzkoušet zdarma|Založit zdarma|Jak to funguje/i)
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href') ?? '').not.toMatch(/register|signup|registrace|view=/i)
    }
    const ctas = screen.getAllByRole('link', { name: 'Zapsat se' })
    ctas.forEach((cta) => expect(cta).toHaveAttribute('href', '#zapis'))
  })

  it('lišta má „Přihlásit se“ jen jednou, menu ho neopakuje a otevírá se tlačítkem', () => {
    renderLanding()
    const bar = screen.getByTestId('landing-nav')
    expect(within(bar).getByRole('link', { name: 'Přihlásit se' })).toHaveAttribute('href', '/login')

    const menu = screen.getByTestId('landing-mobile-menu')
    const toggle = within(bar).getByRole('button', { name: 'Otevřít menu' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(menu).not.toBeVisible()
    fireEvent.click(toggle)
    expect(within(bar).getByRole('button', { name: 'Zavřít menu' })).toHaveAttribute('aria-expanded', 'true')
    expect(menu).toBeVisible()
    expect(within(menu).queryByText('Přihlásit se')).toBeNull()
  })

  it('screenshoty mají popis a načítají se líně se známou velikostí', () => {
    const { container } = renderLanding()
    const shots = within(container.querySelector('#ukazka') as HTMLElement).getAllByRole('img')
    expect(shots).toHaveLength(3)
    for (const img of shots) {
      expect(img.getAttribute('alt')).toBeTruthy()
      expect(img).toHaveAttribute('loading', 'lazy')
      expect(img).toHaveAttribute('width')
      expect(img).toHaveAttribute('height')
    }
  })

  it('hero ukazuje scénu chaty s ročním obdobím, bez počasí a bez volání API', () => {
    renderLanding()
    expect(scene()).toHaveAttribute('data-motion', 'animated')
    expect(scene()?.getAttribute('aria-label')).not.toMatch(/Prší|Sněží|Mrholí|Bouřka|Mlha|vítr|Mrzne|Leží sníh/)
    expect(api.get).not.toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('volba Skrytá scénu skryje', () => {
    localStorage.setItem('cabinSceneMode', 'hidden')
    renderLanding()
    expect(scene()).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it.each([
    ['volba Statická', () => localStorage.setItem('cabinSceneMode', 'static')],
    ['prefers-reduced-motion', () => prefersReducedMotion(true)],
  ])('%s scénu zastaví', (_, arrange) => {
    arrange()
    renderLanding()
    expect(scene()).toHaveAttribute('data-motion', 'static')
  })

  it('titulek karty je claim a po odchodu ze stránky se vrátí název appky', () => {
    const { unmount } = renderLanding()
    expect(document.title).toBe('Sdílená chata bez dohadování | Kdy na chatu')
    unmount()
    expect(document.title).toBe('Kdy na chatu')
  })
})
