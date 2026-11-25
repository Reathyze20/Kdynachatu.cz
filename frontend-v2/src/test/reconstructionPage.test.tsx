/**
 * #521 – stránka Rekonstrukce podle DESIGN.md: hlavička `PageHeader` s jediným `h1`,
 * souhrn nápadů, firem a úkolů a rozpočet formátovaný přes lib/format.ts.
 */
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reconstructionApi, type RecCategory, type RecItem } from '@/api/reconstruction'
import { ReconstructionPage } from '@/features/reconstruction/ReconstructionPage'

vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { userId: 'user-1' }, isGuest: false }) }))

const item = (id: string, category: RecCategory, extra: Partial<RecItem> = {}): RecItem => ({
  id, category, title: `Položka ${id}`, description: null, votes: [], createdAt: '2026-04-18T10:00:00.000Z', ...extra,
})

function renderPage(load: () => Promise<RecItem[]>) {
  vi.spyOn(reconstructionApi, 'getAll').mockImplementation(load)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReconstructionPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('stránka Rekonstrukce podle DESIGN.md (#521)', () => {
  it('má hlavičku stránky s jediným h1 a podtitulkem', async () => {
    renderPage(async () => [])
    expect(await screen.findByRole('heading', { level: 1, name: 'Rekonstrukce a plány' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByText('Nápady, firmy a úkoly na jedno místo')).toBeInTheDocument()
  })

  it('souhrn ukazuje počet nápadů, firem a úkolů', async () => {
    renderPage(async () => [
      item('a', 'idea'), item('b', 'idea'), item('c', 'company'), item('d', 'task'), item('e', 'task'), item('f', 'task'),
    ])
    const summary = await screen.findByTestId('reconstruction-summary')
    expect(within(summary).getAllByRole('term').map((term) => term.textContent)).toEqual(['Nápady', 'Firmy', 'Úkoly'])
    expect(within(summary).getAllByRole('definition').map((value) => value.textContent)).toEqual(['2', '1', '3'])
  })

  it('rozpočet ukazuje částky a procenta z lib/format a průběh hotových úkolů', async () => {
    renderPage(async () => [
      item('t1', 'task', { cost: 30000, status: 'done' }),
      item('t2', 'task', { cost: 90000, status: 'pending' }),
    ])
    const budget = await screen.findByRole('region', { name: 'Celkový rozpočet' })
    // Intl dává nezlomitelné mezery, Testing Library je při porovnání sjednotí na obyčejné.
    expect(within(budget).getByText('120 000 Kč')).toBeInTheDocument()
    expect(budget).toHaveTextContent('Hotovo: 30 000 Kč (25 %)')
    expect(budget).toHaveTextContent('Zbývá: 90 000 Kč')
    const progress = within(budget).getByRole('progressbar', { name: 'Hotovo z rozpočtu' })
    expect(progress).toHaveAttribute('value', '30000')
    expect(progress).toHaveAttribute('max', '120000')
  })

  it('bez nákladů u úkolů rozpočet neukazuje', async () => {
    renderPage(async () => [item('t1', 'task')])
    await screen.findByTestId('reconstruction-summary')
    expect(screen.queryByRole('region', { name: 'Celkový rozpočet' })).not.toBeInTheDocument()
  })

  it('když se data nenačtou, hlavička zůstane a chyba nabídne nový pokus', async () => {
    renderPage(() => Promise.reject(new Error('down')))
    expect(await screen.findByText('Rekonstrukce se nepodařilo načíst')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Rekonstrukce a plány' })).toBeInTheDocument()
    expect(screen.queryByTestId('reconstruction-summary')).not.toBeInTheDocument()
  })
})
