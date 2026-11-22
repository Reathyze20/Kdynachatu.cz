import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ShoppingItem } from '@/api/shopping'
import { ShoppingPage } from '@/features/shopping/ShoppingPage'
import { DASHBOARD_SHOPPING_KEY, SHOPPING_KEY } from '@/features/shopping/hooks/useShoppingLists'
import { INVENTORY_KEY } from '@/features/shopping/hooks/useInventory'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'

// Seam celé stránky Zásoby a nákupy (#176): API klient a auth jsou namockované, zbytek je skutečný.
const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn((_url: string) => Promise.resolve({ data: [] as unknown })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { userId: 'u-me', role: 'member' } }) }))

const { socketHandlers } = vi.hoisted(() => ({ socketHandlers: new Map<string, (data?: unknown) => void>() }))
vi.mock('@/hooks/useSocket', () => ({
  useSocket: () => ({
    on: (event: string, handler: (data?: unknown) => void) => socketHandlers.set(event, handler),
    off: vi.fn(),
    socketGeneration: 0,
  }),
}))

const item = (overrides: Pick<ShoppingItem, 'id' | 'name'> & Partial<ShoppingItem>): ShoppingItem => ({
  status: 'pending',
  addedById: 'u-me',
  createdAt: '2027-01-01T00:00:00.000Z',
  isEssential: false,
  linkedInventoryId: null,
  ...overrides,
})

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

/** Spies on invalidations so the test sees them even when an active query refetches right away. */
function invalidatedKeys(qc: QueryClient) {
  const spy = vi.spyOn(qc, 'invalidateQueries')
  return () => spy.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey))
}

function renderPage(items: ShoppingItem[]) {
  api.get.mockImplementation((url: string) =>
    Promise.resolve({
      data: url === '/shopping-lists'
        ? [{ id: 'list-1', name: 'Víkend', createdById: 'u-me', isResolved: false, items }]
        : [],
    }),
  )
  const qc = newClient()
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ShoppingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return qc
}

async function rowOf(name: string) {
  const label = await screen.findByText(name)
  const row = label.closest<HTMLElement>('[data-testid="shopping-item-row"]')
  if (!row) throw new Error(`Řádek položky „${name}“ nenalezen`)
  return within(row)
}

// #206: štítek „Ze zásob“ patří položkám propojeným se zásobou, hvězdička jen důležitým.
describe('shopping page: item row tags', () => {
  it('shows "Ze zásob" for an item linked to the pantry without making it essential', async () => {
    renderPage([item({ id: 'i-1', name: 'Káva', linkedInventoryId: 'inv-1' })])

    const row = await rowOf('Káva')
    expect(row.getByText('Ze zásob')).toBeInTheDocument()
    expect(row.getByRole('button', { name: 'Označit jako důležité' })).toBeInTheDocument()
  })

  it('shows the star but no "Ze zásob" for an essential item added by hand', async () => {
    renderPage([item({ id: 'i-2', name: 'Chleba', isEssential: true })])

    const row = await rowOf('Chleba')
    expect(row.queryByText('Ze zásob')).not.toBeInTheDocument()
    expect(row.getByRole('button', { name: 'Zrušit důležitost' })).toBeInTheDocument()
  })
})

// #219: „Přivezu z domova“ je vyřešené – vidí se, kdo to slíbil, a změna obnoví nákupy, zásoby i Přehled.
describe('shopping page: bring from home is resolved', () => {
  const jana = { id: 'u-jana', username: 'Jana', animalIcon: null }
  const petr = { id: 'u-petr', username: 'Petr', animalIcon: null }

  it('shows the avatar of who promised to bring an item and keeps "Koupil(a)" for a bought one', async () => {
    renderPage([
      item({ id: 'i-home', name: 'Plyn', status: 'bring_from_home', purchasedBy: jana }),
      item({ id: 'i-bought', name: 'Rohlíky', status: 'purchased', purchasedBy: petr }),
    ])

    const home = await rowOf('Plyn')
    expect(home.getByTitle('Přiveze Jana')).toBeInTheDocument()
    const bought = await rowOf('Rohlíky')
    expect(bought.getByTitle('Koupil(a) Petr')).toBeInTheDocument()
  })

  it('marking an item "Přivezu z domova" sends the status and refreshes shopping, inventory and the dashboard', async () => {
    const qc = renderPage([item({ id: 'i-3', name: 'Káva', linkedInventoryId: 'inv-1' })])
    const invalidated = invalidatedKeys(qc)

    const row = await rowOf('Káva')
    await userEvent.setup().click(row.getByRole('button', { name: 'Přivezu z domova' }))

    expect(api.put).toHaveBeenCalledWith('/shopping-list/i-3/purchase', { status: 'bring_from_home' })
    await waitFor(() => {
      expect(invalidated()).toEqual(expect.arrayContaining(
        [SHOPPING_KEY, INVENTORY_KEY, DASHBOARD_SHOPPING_KEY].map((key) => JSON.stringify(key)),
      ))
    })
  })

  it.each(['shopping:item:added', 'shopping:item:updated', 'shopping:item:deleted', 'shopping:list:changed'])(
    'socket event %s refreshes the shopping lists and the dashboard warning',
    async (event) => {
      const qc = newClient()
      const invalidated = invalidatedKeys(qc)
      const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      renderHook(() => useRealtimeSync(), { wrapper })

      act(() => socketHandlers.get(event)?.({ id: 'i-1' }))

      expect(invalidated()).toEqual(expect.arrayContaining(
        [SHOPPING_KEY, DASHBOARD_SHOPPING_KEY].map((key) => JSON.stringify(key)),
      ))
    },
  )
})
