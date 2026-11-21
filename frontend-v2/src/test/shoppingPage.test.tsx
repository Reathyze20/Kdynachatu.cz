import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ShoppingPage } from '@/features/shopping/ShoppingPage'

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

const item = (overrides: Record<string, unknown>) => ({
  status: 'pending',
  addedById: 'u-me',
  createdAt: '2027-01-01T00:00:00.000Z',
  isEssential: false,
  linkedInventoryId: null,
  ...overrides,
})

function renderPage(items: unknown[]) {
  api.get.mockImplementation((url: string) =>
    Promise.resolve({
      data: url === '/shopping-lists'
        ? [{ id: 'list-1', name: 'Víkend', createdById: 'u-me', isResolved: false, items }]
        : [],
    }),
  )
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ShoppingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
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
