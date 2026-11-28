import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ProfileDrawer } from '@/components/layout/ProfileDrawer'
import { CabinScene } from '@/features/dashboard/CabinScene'
import { useSceneMode } from '@/features/dashboard/sceneMode'
import type { DashboardReservationsData } from '@/api/dashboard'

// Vypínač „Scéna chaty“ v profilovém panelu (#565): projeví se hned ve scéně a vydrží nové vykreslení appky.
// Od #687 (spec #677) se ukládá na server, ne per zařízení, a „Skrytá“ = vypnutý přepínač Scéna chaty
// (volba Animovaná / Statická je u něj). Fiktivní účet, žádná data rodiny.
const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn(), login: vi.fn(), updateAnimalIcon: vi.fn(), isAdmin: false, isSuperAdmin: false, token: 'token',
    user: { userId: 'u-1', username: 'Jana', role: 'user', animalIcon: null, cabinId: 'cabin-1', isSuperAdmin: false },
  }),
}))

const EMPTY: DashboardReservationsData = {
  activeReservation: null, upcomingReservations: [], myNextReservation: null, departingToday: false, departingReservationId: null,
  nextFreeWeekend: null, lastStay: null, stats: { myNightsThisYear: 0, totalStaysThisMonth: 0 },
}
// #687: Scéna chaty je zapnutá, režim si uživatel ještě nevybral
const PROFILE = { email: 'jana@example.test', color: '#5d9b62', animalIcon: null, dashboardPrefs: { cabinScene: true } }

function prefersReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)', media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }))
}

/** Scéna jako na Přehledu: s režimem přihlášeného ze serveru (#687). */
function Scene() {
  return <CabinScene data={EMPTY} winterized={false} mode={useSceneMode(true).mode} />
}

/** Profilový panel a scéna chaty vedle sebe, jako když je panel otevřený nad Přehledem. */
async function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}><MemoryRouter>
    <Scene />
    <ProfileDrawer isOpen onClose={vi.fn()} />
  </MemoryRouter></QueryClientProvider>)
  // #687: volba je u přepínače Scéna chaty a ukáže se, až dorazí preference ze serveru
  return within(await screen.findByRole('group', { name: 'Režim scény' }))
}

/** PATCH /users/me uloží režim jako server, příští GET ho vrátí. */
function serverSaves() {
  api.patch.mockImplementation((_url: string, body: { dashboardPrefs: Record<string, unknown> }) => {
    const me = { ...PROFILE, dashboardPrefs: { ...PROFILE.dashboardPrefs, ...body.dashboardPrefs } }
    api.get.mockResolvedValue({ data: me })
    return Promise.resolve({ data: { message: 'ok', user: me } })
  })
}

const sceneImg = () => screen.queryByRole('img', { name: /^Scéna chaty/ })

describe('vypínač „Scéna chaty“ v profilu (#565)', () => {
  beforeEach(() => {
    localStorage.clear()
    api.get.mockReset().mockResolvedValue({ data: PROFILE })
    api.patch.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('nabízí Animovaná / Statická (Skrytá = vypnutý přepínač, #687); bez volby je vybraná Animovaná', async () => {
    prefersReducedMotion(false)
    const sw = await renderApp()

    expect(sw.getAllByRole('button').map((b) => b.textContent)).toEqual(['Animovaná', 'Statická'])
    expect(sw.getByRole('button', { name: 'Animovaná' })).toHaveAttribute('aria-pressed', 'true')
    expect(sw.getByRole('button', { name: 'Statická' })).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => expect(api.get).toHaveBeenCalled())
  })

  it('při prefers-reduced-motion: reduce je bez volby vybraná Statická', async () => {
    prefersReducedMotion(true)
    const sw = await renderApp()

    expect(sw.getByRole('button', { name: 'Statická' })).toHaveAttribute('aria-pressed', 'true')
    expect(sceneImg()).toHaveAttribute('data-motion', 'static')
  })

  it('volba se projeví ve scéně hned a vydrží nové vykreslení appky', async () => {
    prefersReducedMotion(false)
    const user = userEvent.setup()
    serverSaves()
    let sw = await renderApp()
    expect(sceneImg()).toHaveAttribute('data-motion', 'animated')

    await user.click(sw.getByRole('button', { name: 'Statická' }))
    expect(sceneImg()).toHaveAttribute('data-motion', 'static')

    cleanup()
    sw = await renderApp()
    expect(sw.getByRole('button', { name: 'Statická' })).toHaveAttribute('aria-pressed', 'true')
    expect(sceneImg()).toHaveAttribute('data-motion', 'static')
    // #687: volba se uloží na server, ne do zařízení
    expect(api.patch).toHaveBeenCalledWith('/users/me', { dashboardPrefs: { sceneMode: 'static' } })
    expect(localStorage.getItem('cabinSceneMode')).toBeNull()
  })
})
