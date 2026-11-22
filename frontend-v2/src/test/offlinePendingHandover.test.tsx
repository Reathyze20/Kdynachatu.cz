import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { InternalAxiosRequestConfig } from 'axios'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Reservation } from '@/api/reservations'
import { DepartureBanner } from '@/features/dashboard/DepartureBanner'
import { CheckoutSection } from '@/features/reservations/ui/CheckoutSection'
import { RESERVATIONS_KEY } from '@/features/reservations/hooks/useReservations'
import { enqueueMutation, flushQueue, getQueueLength } from '@/lib/offlineQueue'
import skeletonCssRaw from '@/styles/skeleton.css?raw'

// Pravidlo E4 (#276): předávka odeslaná bez signálu má štítek „Čeká na odeslání“,
// po odeslání fronty štítek zmizí. Fiktivní data, žádná reálná chata.
const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), request: vi.fn() } }))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

/** Napodobí interceptor v api/client.ts bez signálu: request jde do fronty a odmítne se. */
function failOfflineIntoQueue(method: string) {
  return async (url: string, data?: unknown) => {
    enqueueMutation({ method, url, data, headers: {} } as InternalAxiosRequestConfig)
    throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK', queuedOffline: true })
  }
}

async function reconnectAndFlush() {
  api.request.mockResolvedValue({ data: {} })
  await act(() => flushQueue())
}

const TODAY = '2026-12-10'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`))
  localStorage.clear()
  sessionStorage.clear()
  api.get.mockReset().mockResolvedValue({ data: {} })
  api.patch.mockReset().mockImplementation(failOfflineIntoQueue('patch'))
  api.post.mockReset().mockImplementation(failOfflineIntoQueue('post'))
  api.request.mockReset()
})
afterEach(() => vi.useRealTimers())

function renderWithClient(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  qc.setQueryData(RESERVATIONS_KEY, { reservations: [], availabilities: [] })
  render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('Předávka bez signálu: štítek „Čeká na odeslání“', () => {
  it('na Přehledu: předávka i zpráva jdou do fronty, karta má štítek a po odeslání zmizí', async () => {
    renderWithClient(<DepartureBanner reservationId="r-1" departureChecklist={['Zavřít okna']} onRefresh={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Vyplnit protokol' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Zavřít okna/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Odeslat a uzavřít pobyt' }))

    expect(await screen.findByText('Čeká na odeslání')).toBeTruthy()
    expect(screen.getByText('Předávka je vyplněná')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Vyplnit protokol' })).toBeNull()
    // Pořadí ve frontě: předávka, pak zpráva do chatu
    expect(getQueueLength()).toBe(2)

    await reconnectAndFlush()

    expect(api.request.mock.calls.map(([c]) => `${c.method} ${c.url}`)).toEqual([
      'patch /reservations/r-1/checkout',
      'post /channels/messages',
    ])
    await waitFor(() => expect(screen.queryByText('Čeká na odeslání')).toBeNull())
  })

  it('v detailu pobytu: potvrzení bez signálu ukáže štítek místo chyby a po odeslání zmizí', async () => {
    const reservation: Reservation = {
      id: 'r-2', userId: 'u-eva', username: 'Eva', from: '2026-12-08', to: TODAY,
      purpose: 'Víkend', status: 'primary', isCheckoutCompleted: false,
    }
    renderWithClient(<CheckoutSection reservation={reservation} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Potvrdit odjezd' }))

    expect(await screen.findByText('Čeká na odeslání')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()

    await reconnectAndFlush()

    await waitFor(() => expect(screen.queryByText('Čeká na odeslání')).toBeNull())
  })

  it('štítek bere barvy z tokenů s ověřeným kontrastem ve světlém i tmavém režimu', () => {
    const rule = skeletonCssRaw.match(/\.pending-sync-badge\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toContain('background: var(--low-bg)')
    expect(rule).toContain('color: rgb(var(--low))')
  })
})
