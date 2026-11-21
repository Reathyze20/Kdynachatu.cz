import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DASHBOARD_RESERVATIONS_KEY, RESERVATIONS_KEY, useDeleteReservation } from '@/features/reservations/hooks/useReservations'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'

const { api, socketHandlers } = vi.hoisted(() => ({
  api: { delete: vi.fn(() => Promise.resolve({ data: { message: 'Smazáno.' } })) },
  socketHandlers: new Map<string, (data?: unknown) => void>(),
}))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { userId: 'u-me' } }) }))
vi.mock('@/hooks/useSocket', () => ({
  useSocket: () => ({
    on: (event: string, handler: (data?: unknown) => void) => socketHandlers.set(event, handler),
    off: vi.fn(),
    socketGeneration: 0,
  }),
}))

// Kalendář i dashboard mají v cache načtená data; po změně musí být oba neplatné.
function seededClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  qc.setQueryData(RESERVATIONS_KEY, { reservations: [], availabilities: [] })
  qc.setQueryData(DASHBOARD_RESERVATIONS_KEY, { activeReservation: null })
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return { qc, wrapper }
}

const isStale = (qc: QueryClient, key: readonly unknown[]) => qc.getQueryState(key)?.isInvalidated

describe('reservation flows: calendar and dashboard share one source of truth', () => {
  it('deleting a reservation calls DELETE /reservations/:id and refreshes calendar and dashboard', async () => {
    const { qc, wrapper } = seededClient()
    const { result } = renderHook(() => useDeleteReservation(), { wrapper })

    await act(() => result.current.mutateAsync('r-1'))

    expect(api.delete).toHaveBeenCalledWith('/reservations/r-1')
    await waitFor(() => {
      expect(isStale(qc, RESERVATIONS_KEY)).toBe(true)
      expect(isStale(qc, DASHBOARD_RESERVATIONS_KEY)).toBe(true)
    })
  })

  it.each(['reservation:created', 'reservation:updated', 'reservation:deleted'])(
    'socket event %s refreshes calendar and dashboard',
    async (event) => {
      const { qc, wrapper } = seededClient()
      renderHook(() => useRealtimeSync(), { wrapper })

      act(() => socketHandlers.get(event)?.({ id: 'r-1' }))

      await waitFor(() => {
        expect(isStale(qc, RESERVATIONS_KEY)).toBe(true)
        expect(isStale(qc, DASHBOARD_RESERVATIONS_KEY)).toBe(true)
      })
    },
  )
})
