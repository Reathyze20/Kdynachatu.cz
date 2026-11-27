import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { InventoryItem, ShoppingItem } from '@/api/shopping'
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
const { auth } = vi.hoisted(() => ({ auth: { role: 'member' } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { userId: 'u-me', role: auth.role } }) }))

const { socketHandlers } = vi.hoisted(() => ({ socketHandlers: new Map<string, (data?: unknown) => void>() }))
vi.mock('@/hooks/useSocket', () => ({
  useSocket: () => ({ on: (event: string, h: (data?: unknown) => void) => socketHandlers.set(event, h), off: vi.fn(), socketGeneration: 0 }),
}))

const item = (overrides: Pick<ShoppingItem, 'id' | 'name'> & Partial<ShoppingItem>): ShoppingItem => ({
  status: 'pending',
  addedById: 'u-me',
  createdAt: '2027-01-01T00:00:00.000Z',
  isEssential: false,
  linkedInventoryId: null,
  ...overrides,
})

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
// Spy místo isInvalidated: aktivní dotaz se hned znovu načte a příznak smaže.
function invalidatedKeys(qc: QueryClient) {
  const spy = vi.spyOn(qc, 'invalidateQueries')
  return () => spy.mock.calls.map(([filters]) => filters?.queryKey)
}

function renderPage(items: ShoppingItem[]) {
  auth.role = 'member'
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
  it('shows the avatar of who promised to bring an item and keeps "Koupil(a)" for a bought one', async () => {
    renderPage([
      item({ id: 'i-home', name: 'Plyn', status: 'bring_from_home', purchasedBy: { id: 'u-jana', username: 'Jana' } }),
      item({ id: 'i-bought', name: 'Rohlíky', status: 'purchased', purchasedBy: { id: 'u-petr', username: 'Petr' } }),
    ])

    expect((await rowOf('Plyn')).getByTitle('Přiveze Jana')).toBeInTheDocument()
    expect((await rowOf('Rohlíky')).getByTitle('Koupil(a) Petr')).toBeInTheDocument()
  })

  it('marking an item "Přivezu z domova" sends the status and refreshes shopping, inventory and the dashboard', async () => {
    const invalidated = invalidatedKeys(renderPage([item({ id: 'i-3', name: 'Káva', linkedInventoryId: 'inv-1' })]))

    await userEvent.setup().click((await rowOf('Káva')).getByRole('button', { name: 'Přivezu z domova' }))

    expect(api.put).toHaveBeenCalledWith('/shopping-list/i-3/purchase', { status: 'bring_from_home' })
    await waitFor(() => expect(invalidated()).toEqual(expect.arrayContaining([SHOPPING_KEY, INVENTORY_KEY, DASHBOARD_SHOPPING_KEY])))
  })

  it.each(['shopping:item:added', 'shopping:item:updated', 'shopping:item:deleted', 'shopping:list:changed'])(
    'socket event %s refreshes the shopping lists and the dashboard warning',
    (event) => {
      const qc = newClient()
      const invalidated = invalidatedKeys(qc)
      renderHook(() => useRealtimeSync(), { wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> })

      act(() => socketHandlers.get(event)?.({ id: 'i-1' }))

      expect(invalidated()).toEqual(expect.arrayContaining([SHOPPING_KEY, DASHBOARD_SHOPPING_KEY]))
    },
  )
})

// #223: zásoby slovy Dostatek · Dochází · Došlo, „Chybí“ = Dochází + Došlo, akce ve vlastním sloupci.
const stock = (o: Pick<InventoryItem, 'id' | 'name'> & Partial<InventoryItem>): InventoryItem => ({ category: 'TRVANLIVÉ', status: 'OK', inCart: false, isEssential: false, ...o })
const pantry = [
  stock({ id: 's-ok', name: 'Sůl', location: 'Kumbál', updatedBy: { id: 'u-jana', username: 'Jana' } }),
  stock({ id: 's-low', name: 'Káva', status: 'LOW' }),
  stock({ id: 's-empty', name: 'Cukr', status: 'EMPTY' }),
  stock({ id: 's-cart', name: 'Čaj', status: 'EMPTY', inCart: true }),
  stock({ id: 's-drink', name: 'Pivo', category: 'NÁPOJE' }),
  stock({ id: 's-other', name: 'Svíčky', category: 'NEZNÁMÁ' }),
]

async function renderPantry(inventory = pantry, role = 'member') {
  auth.role = role
  api.get.mockImplementation((url: string) => Promise.resolve({ data: url === '/inventory' ? inventory : [] }))
  render(<QueryClientProvider client={newClient()}><MemoryRouter><ShoppingPage /></MemoryRouter></QueryClientProvider>)
  const user = userEvent.setup()
  await user.click(screen.getAllByRole('button', { name: /Zásoby na chatě/ })[0])
  await screen.findByText(inventory[0].name)
  return user
}

const stockRow = (name: string) => within(screen.getByText(name).closest<HTMLElement>('[data-testid="inventory-item-row"]')!)
const options = (select: HTMLElement) => within(select).getAllByRole('option').map((o) => o.textContent)

describe('shopping page: readable inventory states', () => {
  it('names the states in the row, the add form and the edit dialog opened by a tap, under readable category headings', async () => {
    const user = await renderPantry()

    expect(['Sůl', 'Káva', 'Cukr'].map((name) => stockRow(name).getByText(/Dostatek|Dochází|Došlo/).textContent)).toEqual(['Dostatek', 'Dochází', 'Došlo'])
    expect(screen.queryByText('Málo')).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Trvanlivé', 'Nápoje', 'Ostatní'])
    // Úprava a mazání se otevírají klepnutím na zásobu; jméno posledního upravovatele v řádku není, umístění ano.
    expect(screen.queryByRole('button', { name: /Upravit zásobu|Smazat zásobu/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Jana')).not.toBeInTheDocument()
    expect(stockRow('Sůl').getByText('Kumbál')).toBeInTheDocument()
    expect(options(screen.getByRole('combobox', { name: 'Stav' }))).toEqual(['Dostatek', 'Dochází', 'Došlo'])

    await user.click(screen.getByRole('button', { name: /Káva/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Upravit zásobu' })
    expect(options(within(dialog).getByRole('combobox', { name: 'Stav zásoby' }))).toEqual(['Dostatek', 'Dochází', 'Došlo'])
    expect(within(dialog).getByRole('button', { name: 'Smazat zásobu' })).toBeInTheDocument()
  })

  it('filters "Chybí · N" to Dochází and Došlo without category chips', async () => {
    const user = await renderPantry()

    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Chybí · 3', 'Vše'])
    await user.click(screen.getByRole('tab', { name: 'Chybí · 3' }))

    expect(['Káva', 'Cukr', 'Čaj', 'Sůl', 'Pivo', 'Svíčky'].map((name) => screen.queryByText(name) !== null)).toEqual([true, true, true, false, false, false])
  })

  it('shows "+" only for missing stock outside the list, "V nákupu" for stock in it, and "Vše do nákupu · N" for exactly those', async () => {
    const user = await renderPantry()
    const action = (name: string) => [!!stockRow(name).queryByRole('button', { name: 'Přidat do nákupu' }), !!stockRow(name).queryByRole('img', { name: 'V nákupu' })]

    expect(['Káva', 'Cukr', 'Čaj', 'Sůl'].map(action)).toEqual([[true, false], [true, false], [false, true], [false, false]])

    await user.click(screen.getByRole('button', { name: 'Vše do nákupu · 2' }))
    expect(await screen.findByRole('dialog', { name: 'Přidat 2 chybějících zásob do nákupu' })).toBeInTheDocument()
  })

  it('lets a guest see the stocks but not open the edit dialog or the add form; no "Vše do nákupu" when all is in the list', async () => {
    const user = await renderPantry([pantry[0], pantry[3]], 'guest')

    expect(stockRow('Čaj').getByText('Došlo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Přidat zásobu|Sůl|Vše do nákupu/ })).not.toBeInTheDocument()
    await user.click(screen.getByText('Sůl'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
