import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Reservation } from '@/api/reservations'
import { ReservationsPage } from '@/features/reservations/ReservationsPage'

// #460: stránka rezervací podle DESIGN.md – PageHeader s jediným h1, akce nad rezervací
// v kebab menu, mazání jen po potvrzení, prázdný měsíc přes EmptyState.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2030, 5, 1))
  vi.clearAllMocks()
})
afterEach(() => {
  vi.useRealTimers()
  auth.user = { userId: 'u-me', role: 'member' }
})

const mine: Reservation = { id: 'r-mine', userId: 'u-me', username: 'Já', from: '2030-06-10', to: '2030-06-12', purpose: 'Víkend' }
const foreign: Reservation = { id: 'r-petr', userId: 'u-petr', username: 'Petr', from: '2030-06-20', to: '2030-06-22', purpose: 'Rybaření' }

const { api, auth } = vi.hoisted(() => ({
  api: { get: vi.fn((_url: string): Promise<unknown> => Promise.resolve({ data: null })), delete: vi.fn((_url: string) => Promise.resolve({ data: {} })) },
  auth: { user: { userId: 'u-me', role: 'member' } },
}))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: auth.user, isAdmin: auth.user.role === 'admin' }) }))

function renderPage(reservations: Reservation[] | 'pending' = [mine, foreign]) {
  api.get.mockImplementation((url: string) =>
    url !== '/reservations' ? Promise.resolve({ data: null })
      : reservations === 'pending' ? new Promise(() => {})
        : Promise.resolve({ data: { reservations, availabilities: [] } }))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={qc}><MemoryRouter><ReservationsPage /></MemoryRouter></QueryClientProvider>)
  return userEvent.setup()
}

async function findPanel() {
  await screen.findByTestId('reservations-sidebar')
  return screen.getByRole('complementary', { name: 'Rezervace' })
}
const menuOf = (panel: HTMLElement, purpose: string) =>
  within(within(panel).getByText(purpose).closest('li') as HTMLElement).queryByRole('button', { name: /^Akce s rezervací/ })

describe('reservations page per DESIGN.md (#460)', () => {
  it('keeps the single h1 while the reservations load', () => {
    renderPage('pending')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('the header holds the single h1 and the primary action', async () => {
    renderPage()
    await findPanel()

    const [h1, ...rest] = screen.getAllByRole('heading', { level: 1 })
    expect(rest).toHaveLength(0)
    expect(h1).toHaveTextContent('Rezervace')
    expect(within(h1.closest('header') as HTMLElement).getByRole('button', { name: 'Nová rezervace' })).toBeInTheDocument()
  })

  it.each([
    ['member', 'Víkend', true],
    ['member', 'Rybaření', false],
    ['admin', 'Rybaření', true],
  ] as const)('a %s sees the kebab menu on "%s" without hover: %s', async (role, purpose, visible) => {
    auth.user = { userId: 'u-me', role }
    renderPage()
    expect(menuOf(await findPanel(), purpose) !== null).toBe(visible)
  })

  it('Upravit in the menu opens the edit form', async () => {
    const user = renderPage()
    await user.click(menuOf(await findPanel(), 'Víkend') as HTMLElement)
    await user.click(await screen.findByRole('menuitem', { name: 'Upravit' }))

    expect(await screen.findByRole('dialog', { name: 'Upravit rezervaci' })).toBeInTheDocument()
  })

  it('Smazat deletes only after the confirmation dialog', async () => {
    const user = renderPage()
    await user.click(menuOf(await findPanel(), 'Víkend') as HTMLElement)
    await user.click(await screen.findByRole('menuitem', { name: 'Smazat' }))

    const dialog = await screen.findByRole('dialog', { name: 'Smazat rezervaci' })
    expect(api.delete).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Smazat' }))

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/reservations/r-mine'))
  })

  it('an empty month says so through EmptyState', async () => {
    renderPage([])
    expect(within(await findPanel()).getByText('V tomto měsíci nejsou naplánované žádné pobyty.')).toBeInTheDocument()
  })
})
