import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DepartureBanner } from '@/features/dashboard/DepartureBanner'
import { DASHBOARD_RESERVATIONS_KEY, RESERVATIONS_KEY } from '@/features/reservations/hooks/useReservations'

const { api } = vi.hoisted(() => ({
  api: {
    patch: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

function renderBanner() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  qc.setQueryData(RESERVATIONS_KEY, { reservations: [], availabilities: [] })
  qc.setQueryData(DASHBOARD_RESERVATIONS_KEY, { departingToday: true, departingReservationId: 'r-1' })
  const onRefresh = vi.fn()
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DepartureBanner reservationId="r-1" departureChecklist={['Zavřít okna']} onRefresh={onRefresh} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { qc, onRefresh }
}

function fillAndSubmit(note: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Vyplnit protokol' }))
  fireEvent.click(screen.getByRole('checkbox', { name: /Zavřít okna/ }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: note } })
  fireEvent.click(screen.getByRole('button', { name: 'Odeslat a uzavřít pobyt' }))
}

describe('DepartureBanner: one handover flow with CheckoutSection', () => {
  beforeEach(() => {
    sessionStorage.clear()
    api.patch.mockReset().mockResolvedValue({ data: { isCheckoutCompleted: true } })
    api.post.mockReset().mockResolvedValue({ data: {} })
  })

  it('completes the checkout with the note as structured state, then still posts the chat message', async () => {
    const { qc, onRefresh } = renderBanner()

    fillAndSubmit('  Dřevo je pod plachtou  ')

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.patch).toHaveBeenCalledWith('/reservations/r-1/checkout', {
      checkoutState: { note: 'Dřevo je pod plachtou' },
    })
    expect(api.patch.mock.invocationCallOrder[0]).toBeLessThan(api.post.mock.invocationCallOrder[0])
    const [url, body] = api.post.mock.calls[0] as unknown as [string, { message: string }]
    expect(url).toBe('/channels/messages')
    expect(body.message).toContain('- [x] Zavřít okna')
    expect(body.message).toContain('**Vzkaz:** Dřevo je pod plachtou')

    // Gate se přepočítá: dashboard i kalendář jsou neplatné, banner zmizí.
    await waitFor(() => {
      expect(qc.getQueryState(DASHBOARD_RESERVATIONS_KEY)?.isInvalidated).toBe(true)
      expect(qc.getQueryState(RESERVATIONS_KEY)?.isInvalidated).toBe(true)
    })
    expect(onRefresh).toHaveBeenCalled()
    expect(screen.queryByText('Dnes odjíždíte!')).toBeNull()
  })

  it('without a note it completes the checkout without touching the structured state', async () => {
    renderBanner()

    fillAndSubmit('   ')

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.patch).toHaveBeenCalledWith('/reservations/r-1/checkout', undefined)
  })

  it('when the checkout fails, no chat message is sent and the error stays in the modal', async () => {
    api.patch.mockRejectedValue(new Error('boom'))
    renderBanner()

    fillAndSubmit('Vzkaz')

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(api.post).not.toHaveBeenCalled()
    expect(screen.getByText('Dnes odjíždíte!')).toBeTruthy()
  })
})
