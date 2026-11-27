import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

function renderPage(items: ShoppingItem[], { role = 'member', listCreatedById = 'u-me' } = {}) {
  auth.role = role
  api.get.mockImplementation((url: string) =>
    Promise.resolve({
      data: url === '/shopping-lists'
        ? [{ id: 'list-1', name: 'Víkend', createdById: listCreatedById, isResolved: false, items }]
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
    expect(row.queryByRole('img', { name: 'Důležité' })).not.toBeInTheDocument()
  })

  it('shows the star but no "Ze zásob" for an essential item added by hand', async () => {
    renderPage([item({ id: 'i-2', name: 'Chleba', isEssential: true })])

    const row = await rowOf('Chleba')
    expect(row.queryByText('Ze zásob')).not.toBeInTheDocument()
    expect(row.getByRole('img', { name: 'Důležité' })).toBeInTheDocument()
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

    const user = userEvent.setup()
    await user.click((await rowOf('Káva')).getByRole('button', { name: 'Akce s položkou Káva' }))
    await user.click(screen.getByRole('menuitem', { name: 'Přivezu z domova' }))

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

// #221: řádek položky – ovladač stavu se třemi podobami, ★, „Ze zásob“, avatar a menu položky.
describe('shopping page: item row with a three-state control', () => {
  beforeEach(() => { api.put.mockClear(); api.patch.mockClear(); api.delete.mockClear() })
  const status = (row: Awaited<ReturnType<typeof rowOf>>) => row.getByRole('button', { name: /–/ })
  const openMenu = async (name: string) => {
    const user = userEvent.setup()
    await user.click((await rowOf(name)).getByRole('button', { name: `Akce s položkou ${name}` }))
    return { user, items: within(screen.getByRole('menu')).getAllByRole('menuitem').map((el) => el.textContent) }
  }

  it('names the state and the action; a tap buys a Koupit item and returns a resolved one to Koupit', async () => {
    renderPage([
      item({ id: 'i-buy', name: 'Mléko' }),
      item({ id: 'i-bought', name: 'Rohlíky', status: 'purchased' }),
      item({ id: 'i-home', name: 'Plyn', status: 'bring_from_home' }),
    ])
    const user = userEvent.setup()

    expect(status(await rowOf('Mléko'))).toHaveAccessibleName('Koupit – označit jako koupené')
    expect(status(await rowOf('Rohlíky'))).toHaveAccessibleName('Koupeno – vrátit na Koupit')
    expect(status(await rowOf('Plyn'))).toHaveAccessibleName('Přivezu z domova – vrátit na Koupit')

    await user.click(status(await rowOf('Mléko')))
    await user.click(status(await rowOf('Rohlíky')))
    await user.click((await rowOf('Plyn')).getByText('Plyn'))

    expect(api.put.mock.calls).toEqual([
      ['/shopping-list/i-buy/purchase', { status: 'purchased' }],
      ['/shopping-list/i-bought/purchase', { status: 'pending' }],
      ['/shopping-list/i-home/purchase', { status: 'pending' }],
    ])
  })

  it('offers "Přivezu z domova" for Koupit and "Zrušit, nepřivezu" for a promised item in the item menu', async () => {
    renderPage([item({ id: 'i-buy', name: 'Mléko' }), item({ id: 'i-home', name: 'Plyn', status: 'bring_from_home' })])

    const buy = await openMenu('Mléko')
    expect(buy.items).toEqual(['Přivezu z domova', 'Označit jako důležité', 'Smazat'])
    await buy.user.click(screen.getByRole('menuitem', { name: 'Přivezu z domova' }))

    const home = await openMenu('Plyn')
    expect(home.items).toEqual(['Zrušit, nepřivezu', 'Označit jako důležité', 'Smazat'])
    await home.user.click(screen.getByRole('menuitem', { name: 'Zrušit, nepřivezu' }))

    expect(api.put.mock.calls).toEqual([
      ['/shopping-list/i-buy/purchase', { status: 'bring_from_home' }],
      ['/shopping-list/i-home/purchase', { status: 'pending' }],
    ])
  })

  it('shows the star before the name of an important item and lets a member, not a guest, change it', async () => {
    renderPage([item({ id: 'i-star', name: 'Chleba', isEssential: true })])
    const member = await openMenu('Chleba')
    await member.user.click(screen.getByRole('menuitem', { name: 'Zrušit důležitost' }))
    expect(api.patch).toHaveBeenCalledWith('/shopping-list/i-star/toggle-essential')
  })

  it('lets a guest see the star but not change it', async () => {
    renderPage([item({ id: 'i-star', name: 'Chleba', isEssential: true, addedById: 'u-other' })], { role: 'guest', listCreatedById: 'u-other' })

    const row = await rowOf('Chleba')
    const star = row.getByRole('img', { name: 'Důležité' })
    expect(star.compareDocumentPosition(row.getByText('Chleba')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect((await openMenu('Chleba')).items).toEqual(['Přivezu z domova'])
  })

  it.each([
    ['who added it', { addedById: 'u-me' }, {}, true],
    ['the list founder', { addedById: 'u-other' }, { listCreatedById: 'u-me' }, true],
    ['an admin', { addedById: 'u-other' }, { listCreatedById: 'u-other', role: 'admin' }, true],
    ['another member', { addedById: 'u-other' }, { listCreatedById: 'u-other' }, false],
  ])('offers "Smazat" to %s', async (_who, own, opts, canDelete) => {
    renderPage([item({ id: 'i-del', name: 'Sýr', ...own })], opts)

    const menu = await openMenu('Sýr')
    expect(menu.items.includes('Smazat')).toBe(canDelete)
    if (canDelete) {
      await menu.user.click(screen.getByRole('menuitem', { name: 'Smazat' }))
      expect(api.delete).toHaveBeenCalledWith('/shopping-list/i-del')
    }
  })

  it('tags only a linked item "Ze zásob" with its meaning and shows who arranged it only once resolved', async () => {
    renderPage([
      item({ id: 'i-linked', name: 'Káva', linkedInventoryId: 'inv-1', purchasedBy: { id: 'u-jana', username: 'Jana' } }),
      item({ id: 'i-home', name: 'Plyn', status: 'bring_from_home', purchasedBy: { id: 'u-jana', username: 'Jana' } }),
    ])

    const coffee = await rowOf('Káva')
    expect(coffee.getByTitle('Po vyřešení se doplní zásoba')).toHaveTextContent('Ze zásob')
    expect(coffee.queryByRole('img', { name: /Jana/ })).not.toBeInTheDocument()
    const gas = await rowOf('Plyn')
    expect(gas.queryByText('Ze zásob')).not.toBeInTheDocument()
    expect(gas.getByRole('img', { name: 'Přiveze Jana' })).toBeInTheDocument()
  })

  it('sorts pending items first (star, then by addition) and resolved ones last, counting resolved in the progress', async () => {
    const at = (day: number) => `2027-01-0${day}T00:00:00.000Z`
    renderPage([
      item({ id: 'bought-old', name: 'Sůl', status: 'purchased', createdAt: at(1) }),
      item({ id: 'pending-old', name: 'Mouka', createdAt: at(2) }),
      item({ id: 'home-new', name: 'Plyn', status: 'bring_from_home', createdAt: at(3) }),
      item({ id: 'star-new', name: 'Káva', isEssential: true, createdAt: at(4) }),
      item({ id: 'pending-new', name: 'Mléko', createdAt: at(5) }),
    ])

    await rowOf('Sůl')
    expect(screen.getAllByTestId('shopping-item-row').map((row) => row.getAttribute('data-item-id')))
      .toEqual(['star-new', 'pending-old', 'pending-new', 'bought-old', 'home-new'])
    expect(within(screen.getByTestId('shopping-list-detail')).getByText('2/5')).toBeInTheDocument()
  })
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
  it('names the states in the row, the add form and the edit dialog opened from the item menu, under readable category headings', async () => {
    const user = await renderPantry()

    expect(['Sůl', 'Káva', 'Cukr'].map((name) => stockRow(name).getByText(/Dostatek|Dochází|Došlo/).textContent)).toEqual(['Dostatek', 'Dochází', 'Došlo'])
    expect(screen.queryByText('Málo')).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Trvanlivé', 'Nápoje', 'Ostatní'])
    // Úprava a mazání jsou v menu ⋮ zásoby (#676); jméno posledního upravovatele v řádku není, umístění ano.
    expect(screen.queryByRole('button', { name: /Upravit zásobu|Smazat zásobu/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Jana')).not.toBeInTheDocument()
    expect(stockRow('Sůl').getByText('Kumbál')).toBeInTheDocument()
    expect(options(screen.getByRole('combobox', { name: 'Stav' }))).toEqual(['Dostatek', 'Dochází', 'Došlo'])

    await user.click(stockRow('Káva').getByRole('button', { name: 'Akce se zásobou Káva' }))
    await user.click(screen.getByRole('menuitem', { name: 'Upravit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Upravit zásobu' })
    expect(options(within(dialog).getByRole('combobox', { name: 'Stav zásoby' }))).toEqual(['Dostatek', 'Dochází', 'Došlo'])
    // Smazání je jen v menu ⋮ (#676), ne v dialogu úpravy.
    expect(within(dialog).queryByRole('button', { name: /Smazat/ })).not.toBeInTheDocument()
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

  it('lets a guest see the stocks but not the item menu, the edit dialog or the add form; no "Vše do nákupu" when all is in the list', async () => {
    const user = await renderPantry([pantry[0], pantry[3]], 'guest')

    expect(stockRow('Čaj').getByText('Došlo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Přidat zásobu|Akce se zásobou|Vše do nákupu/ })).not.toBeInTheDocument()
    await user.click(screen.getByText('Sůl'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

// #676: úprava a mazání zásoby jen v menu ⋮ (DESIGN.md §7), mazání s potvrzením, klepnutí na řádek nic neotevírá.
describe('shopping page: stock item menu', () => {
  beforeEach(() => { api.delete.mockClear() })

  it('opens nothing on a tap on the row and offers Upravit and Smazat in the menu of each stock', async () => {
    const user = await renderPantry()

    await user.click(screen.getByText('Káva'))
    await user.click(screen.getByText('Kumbál'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Akce se zásobou / })).toHaveLength(pantry.length)
    // Menu je navíc, sloupec „+“ / „V nákupu“ zůstává.
    expect(stockRow('Čaj').getByRole('img', { name: 'V nákupu' })).toBeInTheDocument()
    expect(stockRow('Káva').getByRole('button', { name: 'Přidat do nákupu' })).toBeInTheDocument()

    await user.click(stockRow('Čaj').getByRole('button', { name: 'Akce se zásobou Čaj' }))
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Upravit', 'Smazat'])
  })

  it('deletes a stock only after confirmation, keeping focus off <body> on cancel and after the delete', async () => {
    const inventory = [...pantry]
    api.delete.mockImplementationOnce(() => {
      inventory.splice(inventory.findIndex((s) => s.id === 's-low'), 1)
      return Promise.resolve({ data: {} })
    })
    const user = await renderPantry(inventory)
    const askDelete = async () => {
      await user.click(stockRow('Káva').getByRole('button', { name: 'Akce se zásobou Káva' }))
      await user.click(screen.getByRole('menuitem', { name: 'Smazat' }))
      const dialog = await screen.findByRole('dialog', { name: 'Smazat zásobu' })
      // Modal přesouvá fokus dovnitř až po 50 ms; člověk neklikne dřív, test na to počká
      await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement))
      return dialog
    }

    await user.click(within(await askDelete()).getByRole('button', { name: 'Zrušit' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.delete).not.toHaveBeenCalled()
    await waitFor(() => expect(stockRow('Káva').getByRole('button', { name: 'Akce se zásobou Káva' })).toHaveFocus())

    await user.click(within(await askDelete()).getByRole('button', { name: 'Smazat' }))
    expect(api.delete).toHaveBeenCalledWith('/inventory/s-low')
    await waitFor(() => expect(screen.queryByText('Káva')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(stockRow('Cukr').getByRole('button', { name: 'Akce se zásobou Cukr' })).toHaveFocus())
  })
})
