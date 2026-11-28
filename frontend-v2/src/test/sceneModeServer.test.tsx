import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { useMigrateDeviceSceneMode } from '@/features/dashboard/sceneMode'
import { Toast } from '@/components/shared/Toast'
import apiClient from '@/api/client'
import type { DashboardReservationsData } from '@/api/dashboard'

// Režim „Scéna chaty“ na serveru (#687, spec #677): volba Animovaná / Statická u přepínače Scéna chaty, „Skrytá“ = vypnutý
// přepínač; volba ze zařízení se jednou přenese na server. Fiktivní účet a chata, žádná data rodiny.
const { responses } = vi.hoisted(() => ({ responses: new Map<string, unknown>() }))
vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn((url: string) => (responses.has(url) ? Promise.resolve({ data: responses.get(url) }) : new Promise<never>(() => {}))),
    patch: vi.fn(), post: vi.fn(() => new Promise<never>(() => {})),
  },
}))
vi.mock('@/api/dashboard', () => ({ fetchWeather: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ isAdmin: false, isGuest: false, user: { userId: 'u-1', username: 'Jana', role: 'user', cabinId: 'cabin-1' } }),
}))

const EMPTY: DashboardReservationsData = {
  activeReservation: null, upcomingReservations: [], myNextReservation: null, departingToday: false, departingReservationId: null,
  nextFreeWeekend: null, lastStay: null, stats: { myNightsThisYear: 0, totalStaysThisMonth: 0 },
}
const STORAGE_KEY = 'cabinSceneMode'
type Prefs = Record<string, boolean | string> | null

function setApi(dashboardPrefs: Prefs) {
  responses.set('/users/me', { id: 'u-1', username: 'Jana', email: 'jana@example.test', color: '#5d9b62', animalIcon: null, role: 'user', isEmailVerified: true, dashboardPrefs })
  responses.set('/cabin', { id: 'cabin-1', name: 'Chata U Lesa', weatherLocation: null, departureChecklist: [] })
  responses.set('/dashboard/reservations', EMPTY)
  responses.set('/dashboard/shopping', { pendingShoppingItems: [], totalPendingShoppingCount: 0, totalItemsCount: 0, essentialWarning: null })
  responses.set('/dashboard/notes', { latestNotes: [], pinnedHandoverNote: null, handoverNoteAuthor: null, handoverNoteUpdatedAt: null })
}

/** PATCH /users/me uloží preference jako server: sloučí změnu s uloženými. */
function patchSucceeds() {
  vi.mocked(apiClient.patch).mockImplementation((_url: string, body?: unknown) => {
    const me = responses.get('/users/me') as { dashboardPrefs: Prefs }
    const dashboardPrefs = { ...me.dashboardPrefs, ...(body as { dashboardPrefs: Record<string, boolean | string> }).dashboardPrefs }
    responses.set('/users/me', { ...me, dashboardPrefs })
    return Promise.resolve({ data: { message: 'ok', user: { email: null, color: '#5d9b62', animalIcon: null, dashboardPrefs } } })
  })
}

/** Přenos volby ze zařízení běží v AppShell, tady vedle Přehledu. */
const MigrateDeviceSceneMode = () => (useMigrateDeviceSceneMode(true), null)

function renderApp({ migrate = false } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={qc}><MemoryRouter>
    {migrate && <MigrateDeviceSceneMode />}
    <DashboardPage />
  </MemoryRouter></QueryClientProvider>)
}

async function openEditSheet() {
  fireEvent.click(await screen.findByRole('button', { name: 'Upravit Přehled' }))
  const sheet = await screen.findByRole('dialog', { name: 'Upravit Přehled' })
  await waitFor(() => expect(within(sheet).getByRole('switch', { name: 'Počasí' })).toBeEnabled())
  return sheet
}
const sceneImg = () => screen.findByRole('img', { name: /^Scéna chaty/ })
const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

beforeEach(() => {
  localStorage.clear()
  vi.mocked(apiClient.patch).mockReset().mockImplementation(() => new Promise<never>(() => {}))
})
afterEach(() => {
  responses.clear()
})

describe('režim Scény chaty u přepínače Scéna chaty (#687)', () => {
  it('v Upravit Přehled je u zapnutého přepínače volba Animovaná / Statická bez „Skrytá“, u vypnutého žádná', async () => {
    setApi({ cabinScene: true })
    renderApp()

    const sheet = await openEditSheet()
    const group = within(sheet).getByRole('group', { name: 'Režim scény' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Animovaná', 'Statická'])
    expect(screen.queryByRole('button', { name: 'Skrytá' })).not.toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole('switch', { name: 'Scéna chaty' }))
    await waitFor(() => expect(within(sheet).queryByRole('group', { name: 'Režim scény' })).not.toBeInTheDocument())
  })
})

describe('přenos volby ze zařízení na server (#687)', () => {
  it('režim uložený v zařízení se jedním PATCH přenese na server a ze zařízení zmizí', async () => {
    localStorage.setItem(STORAGE_KEY, 'static')
    setApi({ cabinScene: true })
    patchSucceeds()
    renderApp({ migrate: true })

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/users/me', { dashboardPrefs: { sceneMode: 'static' } }))
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeNull())
    await settle()
    expect(apiClient.patch).toHaveBeenCalledTimes(1)
    expect(await sceneImg()).toHaveAttribute('data-motion', 'static')
  })

  it('uložená „Skrytá“ se převede na vypnutý přepínač Scéna chaty', async () => {
    localStorage.setItem(STORAGE_KEY, 'hidden')
    setApi(null)
    patchSucceeds()
    renderApp({ migrate: true })

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/users/me', { dashboardPrefs: { cabinScene: false } }))
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeNull())
    await settle()
    expect(apiClient.patch).toHaveBeenCalledTimes(1)
    expect(within(await openEditSheet()).getByRole('switch', { name: 'Scéna chaty' })).not.toBeChecked()
  })

  it('když server režim už má, platí server: nic se neodešle a volba ze zařízení zmizí', async () => {
    localStorage.setItem(STORAGE_KEY, 'static')
    setApi({ cabinScene: true, sceneMode: 'animated' })
    renderApp({ migrate: true })

    expect(await sceneImg()).toHaveAttribute('data-motion', 'animated')
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeNull())
    expect(apiClient.patch).not.toHaveBeenCalled()
  })

  it('když přenos selže, volba v zařízení zůstane na příští pokus, bez hlášky o chybě', async () => {
    localStorage.setItem(STORAGE_KEY, 'static')
    setApi({ cabinScene: true })
    vi.mocked(apiClient.patch).mockImplementation(() =>
      Promise.reject(Object.assign(new Error('Request failed with status code 500'), { response: { status: 500, data: { message: 'Chyba serveru' } } })))
    render(<Toast />)
    renderApp({ migrate: true })

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBe('static'))
    await settle()
    expect(apiClient.patch).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument()
  })
})
