import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ProfileDrawer } from '@/components/layout/ProfileDrawer'
import { Toast } from '@/components/shared/Toast'
import apiClient from '@/api/client'
import type { DashboardReservationsData } from '@/api/dashboard'

// „Upravit Přehled“ a sekce „Přehled“ v Můj profil (#686, spec #677). Fiktivní účet a chata, žádná data rodiny.
const { responses } = vi.hoisted(() => ({ responses: new Map<string, unknown>() }))
vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn((url: string) => (responses.has(url) ? Promise.resolve({ data: responses.get(url) }) : new Promise<never>(() => {}))),
    put: vi.fn(() => new Promise<never>(() => {})),
    post: vi.fn(() => new Promise<never>(() => {})),
    delete: vi.fn(() => new Promise<never>(() => {})),
    patch: vi.fn(() => new Promise<never>(() => {})),
  },
}))
vi.mock('@/api/dashboard', () => ({ fetchWeather: vi.fn(() => Promise.resolve(null)) }))
const { auth } = vi.hoisted(() => ({ auth: { isGuest: false } }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { userId: 'u-eva', cabinId: 'c-1', username: 'Eva', role: auth.isGuest ? 'guest' : 'user', animalIcon: null, isSuperAdmin: false },
    isAdmin: false, isSuperAdmin: false, isGuest: auth.isGuest, token: 'token',
    logout: vi.fn(), login: vi.fn(), updateAnimalIcon: vi.fn(),
  }),
}))

const EMPTY: DashboardReservationsData = {
  activeReservation: null, upcomingReservations: [], myNextReservation: null, departingToday: false, departingReservationId: null,
  nextFreeWeekend: null, lastStay: null, stats: { myNightsThisYear: 0, totalStaysThisMonth: 0 },
}
const TOGGLE_ORDER = ['Počasí', 'Scéna chaty', 'Od minule', 'Potom a volno', 'Předpověď na pobyt', 'Akce v kraji', 'Nástěnka']
const NOTE_TEXT = 'Přehled je jednodušší. Co chceš vidět, si zapneš v Upravit Přehled.'

function setApi(dashboardPrefs: Record<string, boolean> | null) {
  responses.set('/users/me', { id: 'u-eva', username: 'Eva', email: 'eva@example.test', color: '#5d9b62', animalIcon: null, role: 'user', isEmailVerified: true, dashboardPrefs })
  responses.set('/cabin', { id: 'c-1', name: 'Chata U Lesa', weatherLocation: null, departureChecklist: [] })
  responses.set('/dashboard/reservations', EMPTY)
  responses.set('/dashboard/shopping', { pendingShoppingItems: [], totalPendingShoppingCount: 0, totalItemsCount: 0, essentialWarning: null })
  responses.set('/dashboard/notes', { latestNotes: [], pinnedHandoverNote: null, handoverNoteAuthor: null, handoverNoteUpdatedAt: null })
}

/** PATCH /users/me uloží preference jako server: sloučí změnu s uloženými. */
function patchSucceeds() {
  vi.mocked(apiClient.patch).mockImplementation((_url: string, body?: unknown) => {
    const me = responses.get('/users/me') as { dashboardPrefs: Record<string, boolean> | null }
    const dashboardPrefs = { ...me.dashboardPrefs, ...(body as { dashboardPrefs: Record<string, boolean> }).dashboardPrefs }
    responses.set('/users/me', { ...me, dashboardPrefs })
    return Promise.resolve({ data: { message: 'ok', user: { email: null, color: '#5d9b62', animalIcon: null, dashboardPrefs } } })
  })
}

function renderOverview({ withProfile = false } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardPage />
        {withProfile && <ProfileDrawer isOpen onClose={vi.fn()} />}
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function openEditSheet() {
  fireEvent.click(await screen.findByRole('button', { name: 'Upravit Přehled' }))
  const sheet = await screen.findByRole('dialog', { name: 'Upravit Přehled' })
  // Přepnout jde, až dorazí uložené preference
  await waitFor(() => expect(within(sheet).getByRole('switch', { name: 'Počasí' })).toBeEnabled())
  return sheet
}
const sceneShown = () => screen.queryByRole('img', { name: /^Scéna chaty/ })

beforeEach(() => {
  localStorage.clear()
  vi.mocked(apiClient.patch).mockReset().mockImplementation(() => new Promise<never>(() => {}))
})
afterEach(() => {
  responses.clear()
  auth.isGuest = false
})

describe('Upravit Přehled (#686)', () => {
  it('odkaz otevře sheet s přepínači v pevném pořadí a odkazem „Napsat vzkaz“', async () => {
    setApi(null)
    renderOverview()

    const sheet = await openEditSheet()
    const toggles = within(sheet).getAllByRole('switch')
    expect(toggles.map((t) => t.closest('label')?.textContent)).toEqual(TOGGLE_ORDER)
    // Výchozí stav: zapnuté je jen Počasí
    expect(toggles.map((t) => (t as HTMLInputElement).checked)).toEqual([true, false, false, false, false, false, false])
    expect(within(sheet).getByRole('button', { name: 'Napsat vzkaz' })).toBeInTheDocument()
  })

  it('zapnutý blok se na Přehledu objeví hned, ještě než server odpoví, a uloží se přes PATCH /users/me', async () => {
    setApi(null)
    renderOverview()
    await screen.findByRole('region', { name: 'Chata zatím čeká' })
    expect(sceneShown()).not.toBeInTheDocument()

    const sheet = await openEditSheet()
    fireEvent.click(within(sheet).getByRole('switch', { name: 'Scéna chaty' }))

    // PATCH v tomhle testu nikdy neodpoví: změna se ukáže bez čekání na server
    await waitFor(() => expect(within(sheet).getByRole('switch', { name: 'Scéna chaty' })).toBeChecked())
    expect(await screen.findByRole('img', { name: /^Scéna chaty/ })).toBeInTheDocument()
    expect(apiClient.patch).toHaveBeenCalledWith('/users/me', { dashboardPrefs: { cabinScene: true } })
  })

  it('vypnuté Počasí z Přehledu zmizí a po uložení zůstane vypnuté', async () => {
    setApi(null)
    patchSucceeds()
    renderOverview()
    const sheet = await openEditSheet()
    fireEvent.click(within(sheet).getByRole('switch', { name: 'Počasí' }))

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/users/me', { dashboardPrefs: { weather: false } }))
    // Po uložení se stav srovná se serverem a přepínač zůstane vypnutý
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(within(sheet).getByRole('switch', { name: 'Počasí' })).not.toBeChecked()
  })

  it('když server změnu odmítne, přepínač i Přehled se vrátí a ukáže se toast', async () => {
    setApi(null)
    let reject: (err: Error) => void = () => {}
    vi.mocked(apiClient.patch).mockImplementation(() => new Promise((_resolve, rej) => { reject = rej }))
    render(<Toast />)
    renderOverview()
    const sheet = await openEditSheet()
    fireEvent.click(within(sheet).getByRole('switch', { name: 'Scéna chaty' }))
    expect(await screen.findByRole('img', { name: /^Scéna chaty/ })).toBeInTheDocument()

    reject(Object.assign(new Error('Request failed with status code 500'), { response: { status: 500, data: { message: 'Chyba serveru' } } }))

    expect(await screen.findByTestId('toast')).toHaveTextContent('Nastavení Přehledu se nepodařilo uložit')
    await waitFor(() => expect(within(sheet).getByRole('switch', { name: 'Scéna chaty' })).not.toBeChecked())
    expect(sceneShown()).not.toBeInTheDocument()
  })

  it('„Napsat vzkaz“ otevře nástěnku, i když karta Nástěnka zapnutá není', async () => {
    setApi(null)
    renderOverview()
    const sheet = await openEditSheet()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Napsat vzkaz' }))

    const noteSheet = await screen.findByRole('dialog', { name: 'Vzkaz' })
    expect(within(noteSheet).getByRole('textbox', { name: 'Vzkaz' })).toHaveValue('')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Upravit Přehled' })).not.toBeInTheDocument())
  })
})

describe('jednorázová poznámka o jednodušším Přehledu (#686)', () => {
  it('ukáže se, dokud ji uživatel nezavře; zavření se uloží do preferencí', async () => {
    setApi({ cabinScene: true })
    renderOverview()

    expect(await screen.findByText(NOTE_TEXT)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zavřít poznámku' }))

    await waitFor(() => expect(screen.queryByText(NOTE_TEXT)).not.toBeInTheDocument())
    expect(apiClient.patch).toHaveBeenCalledWith('/users/me', { dashboardPrefs: { simplifiedNoteDismissed: true } })
  })

  it('kdo ji už zavřel, ten ji neuvidí', async () => {
    setApi({ simplifiedNoteDismissed: true })
    renderOverview()

    await screen.findByRole('button', { name: 'Upravit Přehled' })
    expect(screen.queryByText(NOTE_TEXT)).not.toBeInTheDocument()
  })
})

describe('Přehled v Můj profil (#686)', () => {
  it('profil má stejné přepínače a se sheetem na Přehledu ukazuje stejný stav', async () => {
    setApi(null)
    renderOverview({ withProfile: true })

    const section = await screen.findByRole('group', { name: 'Přehled' })
    const toggles = within(section).getAllByRole('switch')
    expect(toggles.map((t) => t.closest('label')?.textContent)).toEqual(TOGGLE_ORDER)
    await waitFor(() => expect(within(section).getByRole('switch', { name: 'Počasí' })).toBeEnabled())
    fireEvent.click(within(section).getByRole('switch', { name: 'Nástěnka' }))

    expect(await screen.findByTestId('dashboard-handover-widget')).toBeInTheDocument()
    const sheet = await openEditSheet()
    expect(within(sheet).getByRole('switch', { name: 'Nástěnka' })).toBeChecked()
    fireEvent.click(within(sheet).getByRole('switch', { name: 'Nástěnka' }))
    await waitFor(() => expect(within(section).getByRole('switch', { name: 'Nástěnka' })).not.toBeChecked())
  })
})

describe('host (#686)', () => {
  it('nevidí odkaz Upravit Přehled, poznámku ani sekci Přehled v profilu', async () => {
    auth.isGuest = true
    setApi(null)
    renderOverview({ withProfile: true })

    await screen.findByRole('region', { name: 'Chata zatím čeká' })
    await screen.findByText('Můj profil')
    expect(screen.queryByRole('button', { name: 'Upravit Přehled' })).not.toBeInTheDocument()
    expect(screen.queryByText(NOTE_TEXT)).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Přehled' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Počasí' })).not.toBeInTheDocument()
  })
})
