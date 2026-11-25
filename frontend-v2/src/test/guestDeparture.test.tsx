import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DepartureBanner } from '@/features/dashboard/DepartureBanner'
import { showToast } from '@/lib/toast'

const { api } = vi.hoisted(() => ({ api: { patch: vi.fn(), post: vi.fn() } }))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

// Host chat nemá (#484): jeho odjezd se uloží jen do rezervace a protokol do chatu nejde.
describe('odjezd hosta (#484)', () => {
  it('předávka hosta se uloží bez zprávy do chatu a skončí úspěchem', async () => {
    api.patch.mockResolvedValue({ data: { isCheckoutCompleted: true } })
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DepartureBanner reservationId="r-1" departureChecklist={['Zavřít okna']} onRefresh={vi.fn()} postToChat={false} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Vyplnit protokol' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Zavřít okna/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Odeslat a uzavřít pobyt' }))

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Odjezdový protokol byl uložen.', 'success'))
    expect(api.patch).toHaveBeenCalledWith('/reservations/r-1/checkout', undefined)
    expect(api.post).not.toHaveBeenCalled()
  })
})
