import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '@/features/dashboard/DashboardPage'

// Fiktivní API: odpovědi nikdy nedorazí, Přehled zůstane ve stavu načítání (skeletony).
const { pending } = vi.hoisted(() => ({ pending: () => new Promise<never>(() => {}) }))
vi.mock('@/api/client', () => ({ default: { get: vi.fn(pending) } }))
vi.mock('@/api/dashboard', () => ({ fetchWeather: vi.fn(pending) }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-1', cabinId: 'c-1', username: 'Eva' }, isAdmin: false }),
}))

describe('Přehled ve dvousloupcovém rozložení (#171)', () => {
  it('karty jsou v hlavním sloupci a prázdný boční panel se nevykreslí', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const layout = screen.getByTestId('two-column-layout')
    expect(within(layout).getByTestId('dashboard-page')).toContainElement(screen.getByTestId('dashboard-grid'))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })
})
