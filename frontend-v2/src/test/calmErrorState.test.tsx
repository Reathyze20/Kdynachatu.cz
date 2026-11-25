import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { FeatureErrorFallback } from '@/components/shared/FeatureErrorFallback'
import apiClient from '@/api/client'

// Klidný chybový stav (#512). Fiktivní API, žádná reálná data chaty.
const { responses } = vi.hoisted(() => ({ responses: new Map<string, unknown>() }))
vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn((url: string) => {
      if (!responses.has(url)) return new Promise<never>(() => {})
      const value = responses.get(url)
      return value instanceof Error ? Promise.reject(value) : Promise.resolve({ data: value })
    }),
    put: vi.fn(() => new Promise<never>(() => {})),
    post: vi.fn(() => new Promise<never>(() => {})),
    delete: vi.fn(() => new Promise<never>(() => {})),
  },
}))
vi.mock('@/api/dashboard', () => ({ fetchWeather: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-eva', cabinId: 'c-1', username: 'Eva' }, isAdmin: false, isGuest: false }),
}))
vi.mock('@/lib/errorReporting', () => ({ reportError: vi.fn() }))

const RESERVATIONS = {
  activeReservation: null, upcomingReservations: [], myNextReservation: null, departingToday: false,
  departingReservationId: null, nextFreeWeekend: null, lastStay: null, stats: { myNightsThisYear: 0, totalStaysThisMonth: 0 },
}
const NOTES = { latestNotes: [], pinnedHandoverNote: null, handoverNoteAuthor: null, handoverNoteUpdatedAt: null }

function apiDown(status = 503) {
  return Object.assign(new Error('Request failed'), { requestId: 'req-42', status })
}

function renderOverview() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  responses.clear()
  vi.mocked(apiClient.get).mockClear()
})

describe('FeatureErrorFallback: klidná chybová karta (#512)', () => {
  it('řekne, co se stalo, a nabídne jedno „Zkusit znovu“ bez vtipných citátů', async () => {
    const onRetry = vi.fn()
    render(<FeatureErrorFallback title="Zásoby se nepodařilo načíst" error={apiDown()} resetErrorBoundary={onRetry} />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Zásoby se nepodařilo načíst')
    expect(alert).toHaveTextContent('Zkus to znovu.')
    expect(alert).not.toHaveTextContent(/[„"].+["“]/)
    expect(alert).not.toHaveTextContent(/Programátor|šotek|sušenek|WiFi|dovolenou/)

    const retry = screen.getAllByRole('button', { name: 'Zkusit znovu' })
    expect(retry).toHaveLength(1)
    await userEvent.click(retry[0])
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('technické údaje pro podporu jsou ve výchozím stavu sbalené pod „Podrobnosti pro podporu“', async () => {
    render(<FeatureErrorFallback title="Zásoby se nepodařilo načíst" error={apiDown()} resetErrorBoundary={() => {}} />)

    const summary = screen.getByText('Podrobnosti pro podporu')
    const details = summary.closest('details')
    expect(details).not.toBeNull()
    expect(details).not.toHaveAttribute('open')
    expect(screen.getByText('req-42')).not.toBeVisible()

    await userEvent.click(summary)
    expect(details).toHaveAttribute('open')
    expect(screen.getByText('req-42')).toBeVisible()
  })
})

describe('Přehled: výpadek více sekcí (#512)', () => {
  it('ukáže jednu souhrnnou hlášku s jedním „Zkusit znovu“, které znovu načte všechny sekce', async () => {
    responses.set('/cabin', apiDown())
    responses.set('/dashboard/reservations', apiDown())
    responses.set('/dashboard/shopping', apiDown(429))
    responses.set('/dashboard/notes', apiDown())
    renderOverview()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Část přehledu se nepodařilo načíst')
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1))
    expect(screen.getAllByRole('button', { name: 'Zkusit znovu' })).toHaveLength(1)
    expect(screen.queryByText(/Nepodařilo se načíst nastavení chaty/)).not.toBeInTheDocument()
    expect(screen.queryByText('Rezervace se nepodařilo načíst')).not.toBeInTheDocument()
    expect(screen.queryByText('Nástěnku se nepodařilo načíst')).not.toBeInTheDocument()

    responses.set('/cabin', { id: 'c-1', name: 'Chata U Lesa', weatherLocation: null, departureChecklist: [] })
    responses.set('/dashboard/reservations', RESERVATIONS)
    responses.set('/dashboard/shopping', { pendingShoppingItems: [], totalPendingShoppingCount: 0, totalItemsCount: 0, essentialWarning: null })
    responses.set('/dashboard/notes', NOTES)
    vi.mocked(apiClient.get).mockClear()
    await userEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' }))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    const refetched = vi.mocked(apiClient.get).mock.calls.map(([url]) => url)
    expect(refetched).toEqual(expect.arrayContaining(['/cabin', '/dashboard/reservations', '/dashboard/shopping', '/dashboard/notes']))
  })

  it('jedna spadlá sekce má dál vlastní kartu na svém místě', async () => {
    responses.set('/cabin', { id: 'c-1', name: 'Chata U Lesa', weatherLocation: null, departureChecklist: [] })
    responses.set('/dashboard/reservations', RESERVATIONS)
    responses.set('/dashboard/shopping', { pendingShoppingItems: [], totalPendingShoppingCount: 0, totalItemsCount: 0, essentialWarning: null })
    responses.set('/dashboard/notes', apiDown())
    renderOverview()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Nástěnku se nepodařilo načíst')
    expect(screen.getByTestId('dashboard-handover-widget')).toContainElement(alert)
    expect(screen.queryByText('Část přehledu se nepodařilo načíst')).not.toBeInTheDocument()
  })
})
