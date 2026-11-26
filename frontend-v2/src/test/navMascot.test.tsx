import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MobileNav } from '@/components/layout/MobileNav'
import { ProfileDrawer } from '@/components/layout/ProfileDrawer'
import tokensCss from '@/styles/shadcn-tokens.css?raw'
import helpCss from '@/styles/help.css?raw'

// Maskot na mobilní liště (#566): jednou za otevření appky přejde po horní hraně lišty, jen ve stavu
// Animovaná, ne přes otevřené okno ani klávesnici. Testy přes lištu, jak ji vidí uživatel; falešné hodiny, proto
// fireEvent místo userEvent. Fiktivní účet.

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn(), login: vi.fn(), updateAnimalIcon: vi.fn(), isAdmin: false, isSuperAdmin: false, isGuest: false, token: 'token',
    user: { userId: 'u-1', username: 'Jana', role: 'user', animalIcon: null, cabinId: 'c-1', isSuperAdmin: false },
  }),
}))
vi.mock('@/hooks/useCabinFeatures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useCabinFeatures')>()),
  useCabinFeatures: () => ({ data: { features: null, isWinterized: false } }),
}))
vi.mock('@/hooks/usePwaInstall', () => ({
  usePwaInstall: () => ({ isStandalone: false, canInstall: null }),
}))

/** Dost dlouho na to, aby maskot přišel i odešel. */
const LONG_WHILE = 60_000

function device({ mobile = true, reduceMotion = false } = {}) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: (mobile && query === '(max-width: 767px)') || (reduceMotion && query === '(prefers-reduced-motion: reduce)'),
    media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }))
}

function Path() {
  return <output data-testid="path">{useLocation().pathname}</output>
}

function renderNav({ drawerOpen = false } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <input aria-label="Poznámka" />
        <MobileNav />
        <ProfileDrawer isOpen={drawerOpen} onClose={vi.fn()} />
        <Path />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Volba „Scéna chaty“ změněná v jiném okně appky (stejná cesta jako přepnutí v profilu: localStorage + událost). */
function switchSceneMode(mode: string) {
  act(() => {
    localStorage.setItem('cabinSceneMode', mode)
    window.dispatchEvent(new StorageEvent('storage', { key: 'cabinSceneMode' }))
  })
}

const mascot = () => screen.queryByTestId('nav-mascot')
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))

/** Čeká, až se maskot objeví; vrátí ho, nebo null, když za dlouhou chvíli nepřišel. */
function waitForMascot() {
  for (let t = 0; t < LONG_WHILE; t += 500) {
    if (mascot()) return mascot()
    wait(500)
  }
  return mascot()
}

describe('maskot na mobilní liště (#566)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    sessionStorage.clear()
    api.get.mockReset().mockResolvedValue({ data: { email: 'jana@example.test', color: '#5d9b62', animalIcon: null } })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('ve stavu Animovaná chvíli po otevření appky přejde po liště a odejde', () => {
    device()
    renderNav()
    expect(mascot()).not.toBeInTheDocument()

    const walker = waitForMascot()
    expect(walker).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Hlavní navigace' })).getByTestId('nav-mascot')).toBe(walker)

    wait(LONG_WHILE)
    expect(mascot()).not.toBeInTheDocument()
  })

  it('je dekorativní: skrytý pro čtečky a nedá se na něj ťuknout, ťuknutí projde na tlačítko lišty', () => {
    device()
    renderNav()
    const walker = waitForMascot()!

    expect(walker).toHaveAttribute('aria-hidden', 'true')
    expect(walker).toHaveClass('pointer-events-none')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Kalendář' }))
    expect(screen.getByTestId('path')).toHaveTextContent('/reservations')
  })

  it('objeví se nejvýš jednou za otevření appky, ani po navigaci, ani po novém vykreslení lišty', () => {
    device()
    const { unmount } = renderNav()
    expect(waitForMascot()).toBeInTheDocument()
    wait(LONG_WHILE)

    fireEvent.click(screen.getByRole('link', { name: 'Zásoby' }))
    fireEvent.click(screen.getByRole('link', { name: 'Přehled' }))
    expect(waitForMascot()).toBeNull()

    unmount()
    renderNav()
    expect(waitForMascot()).toBeNull()
  })

  it.each([['static', 'Statická'], ['hidden', 'Skrytá']])('ve stavu %s (%s) se neobjeví', (mode) => {
    device()
    localStorage.setItem('cabinSceneMode', mode)
    renderNav()
    expect(waitForMascot()).toBeNull()
  })

  it('při omezeném pohybu v zařízení a bez volby (Statická) se neobjeví', () => {
    device({ reduceMotion: true })
    renderNav()
    expect(waitForMascot()).toBeNull()
  })

  it('na desktopu se neobjeví', () => {
    device({ mobile: false })
    renderNav()
    expect(waitForMascot()).toBeNull()
  })

  it('neobjeví se, dokud je otevřené modální okno', () => {
    device()
    renderNav()
    fireEvent.click(screen.getByRole('button', { name: /Víc/ }))
    expect(screen.getByRole('dialog', { name: 'Víc' })).toBeInTheDocument()

    expect(waitForMascot()).toBeNull()
  })

  it('neobjeví se, dokud je otevřený šuplík profilu', () => {
    device()
    renderNav({ drawerOpen: true })
    expect(screen.getByRole('heading', { name: 'Můj profil' })).toBeInTheDocument()

    expect(waitForMascot()).toBeNull()
  })

  it('přepnutí na Statickou během průchodu ho hned schová a po návratu na Animovanou už nevyjde', () => {
    device()
    renderNav()
    expect(waitForMascot()).toBeInTheDocument()

    switchSceneMode('static')
    expect(mascot()).not.toBeInTheDocument()

    switchSceneMode('animated')
    expect(waitForMascot()).toBeNull()
  })

  it('neobjeví se, dokud je otevřená klávesnice (fokus v textovém poli)', () => {
    device()
    renderNav()
    act(() => screen.getByRole('textbox', { name: 'Poznámka' }).focus())

    expect(waitForMascot()).toBeNull()
  })

  it('když se během průchodu otevře okno, maskot zmizí a už se nevrátí', async () => {
    device()
    renderNav()
    expect(waitForMascot()).toBeInTheDocument()

    // Okno se hlásí přes MutationObserver, jeho zpětné volání doběhne až v mikroúloze.
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Víc/ })))
    expect(mascot()).not.toBeInTheDocument()

    // Odchodová animace okna běží na skutečných snímcích.
    vi.useRealTimers()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    vi.useFakeTimers()
    expect(waitForMascot()).toBeNull()
  })

  it('otočí se dřív, než dojde k tlačítku nápovědy (i na nejužším displeji 320 px)', () => {
    // jsdom neměří layout: hlídá se kontrakt v CSS. Nápověda zabírá u pravého okraje odsazení + šířku (help.css,
    // bere se nejširší varianta); maskot (snímek 60 px) nejdál dojde do bodu, kde se v keyframes otočí zpět.
    const walk = /@keyframes scene-mascot-walk\s*{([\s\S]*?)\n {2}}/.exec(tokensCss)?.[1] ?? ''
    const farthest = Math.max(...[...walk.matchAll(/translate\((-?\d+)px/g)].map((m) => Number(m[1])))
    const fabs = [...helpCss.matchAll(/\.fab-help\s*{[^}]*right:\s*(\d+)px;[^}]*width:\s*(\d+)px/g)]
    const fabReach = Math.max(...fabs.map((m) => Number(m[1]) + Number(m[2])))
    expect(farthest).toBeGreaterThan(0)
    expect(fabReach).toBeGreaterThanOrEqual(64)
    expect(farthest + 60).toBeLessThanOrEqual(320 - fabReach)
  })
})
