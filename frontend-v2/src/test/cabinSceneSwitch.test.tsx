import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ProfileDrawer } from '@/components/layout/ProfileDrawer'
import { CabinScene } from '@/features/dashboard/CabinScene'
import type { DashboardReservationsData } from '@/api/dashboard'

// Vypínač „Scéna chaty“ v profilovém panelu (#565): ukládá se per zařízení, projeví se hned ve scéně
// a vydrží nové vykreslení appky. Fiktivní účet, žádná data rodiny.
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

function prefersReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)', media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }))
}

/** Profilový panel a scéna chaty vedle sebe, jako když je panel otevřený nad Přehledem. */
function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}><MemoryRouter>
    <CabinScene data={EMPTY} winterized={false} />
    <ProfileDrawer isOpen onClose={vi.fn()} />
  </MemoryRouter></QueryClientProvider>)
  return within(screen.getByRole('group', { name: 'Scéna chaty' }))
}

const sceneImg = () => screen.queryByRole('img', { name: /^Scéna chaty/ })

describe('vypínač „Scéna chaty“ v profilu (#565)', () => {
  beforeEach(() => {
    localStorage.clear()
    api.get.mockReset().mockResolvedValue({ data: { email: 'jana@example.test', color: '#5d9b62', animalIcon: null } })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('nabízí Animovaná / Statická / Skrytá; bez volby je vybraná Animovaná', async () => {
    prefersReducedMotion(false)
    const sw = renderApp()

    expect(sw.getAllByRole('button').map((b) => b.textContent)).toEqual(['Animovaná', 'Statická', 'Skrytá'])
    expect(sw.getByRole('button', { name: 'Animovaná' })).toHaveAttribute('aria-pressed', 'true')
    expect(sw.getByRole('button', { name: 'Statická' })).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => expect(api.get).toHaveBeenCalled())
  })

  it('při prefers-reduced-motion: reduce je bez volby vybraná Statická', () => {
    prefersReducedMotion(true)
    const sw = renderApp()

    expect(sw.getByRole('button', { name: 'Statická' })).toHaveAttribute('aria-pressed', 'true')
    expect(sceneImg()).toHaveAttribute('data-motion', 'static')
  })

  it('volba se projeví ve scéně hned a vydrží nové vykreslení appky', async () => {
    prefersReducedMotion(false)
    const user = userEvent.setup()
    let sw = renderApp()
    expect(sceneImg()).toHaveAttribute('data-motion', 'animated')

    await user.click(sw.getByRole('button', { name: 'Skrytá' }))
    expect(sw.getByRole('button', { name: 'Skrytá' })).toHaveAttribute('aria-pressed', 'true')
    expect(sceneImg()).not.toBeInTheDocument()

    await user.click(sw.getByRole('button', { name: 'Statická' }))
    expect(sceneImg()).toHaveAttribute('data-motion', 'static')

    cleanup()
    sw = renderApp()
    expect(sw.getByRole('button', { name: 'Statická' })).toHaveAttribute('aria-pressed', 'true')
    expect(sceneImg()).toHaveAttribute('data-motion', 'static')
    expect(api.patch).not.toHaveBeenCalled()
  })
})
