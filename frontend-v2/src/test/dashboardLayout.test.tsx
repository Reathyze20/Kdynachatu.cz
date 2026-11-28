import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '@/features/dashboard/DashboardPage'

// Fiktivní API: odpovědi nikdy nedorazí, Přehled zůstane ve stavu načítání (skeletony). Dorazí jen
// preference se zapnutou Nástěnkou, ta je od #685 volitelný blok (spec #677).
const { pending } = vi.hoisted(() => ({ pending: () => new Promise<never>(() => {}) }))
vi.mock('@/api/client', () => ({
  default: { get: vi.fn((url: string) => (url === '/users/me' ? Promise.resolve({ data: { dashboardPrefs: { noticeboard: true } } }) : pending())) },
}))
vi.mock('@/api/dashboard', () => ({ fetchWeather: vi.fn(pending) }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-1', cabinId: 'c-1', username: 'Eva' }, isAdmin: false }),
}))

describe('Přehled ve dvousloupcovém rozložení (#171, #172)', () => {
  it('karty jsou v hlavním sloupci a vzkaz v bočním panelu', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const layout = screen.getByTestId('two-column-layout')
    expect(within(layout).getByTestId('dashboard-page')).toContainElement(screen.getByTestId('dashboard-stack'))
    // #685: boční panel se vykreslí, až když má co ukázat (zapnutá Nástěnka z preferencí)
    expect(await screen.findByRole('complementary', { name: 'Kontext chaty' })).toContainElement(screen.getByTestId('dashboard-handover-widget'))
  })
})
