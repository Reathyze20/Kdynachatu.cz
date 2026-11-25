import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Images, Pencil, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card } from '@/components/shared/Card'
import { ListRow } from '@/components/shared/ListRow'

/**
 * Kompozity `shared/` (#454, DESIGN.md §6 a §7) přes veřejné props: co vidí uživatel a čtečka.
 * Třída se ověřuje jen tam, kde je sama pravidlem (papír karty, cíl 48 px řádku), jsdom layout nepočítá.
 */

beforeAll(() => {
  // jsdom nemá rozhraní, která Radix Popper a Menu volají (kebab menu hlavičky).
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
  Element.prototype.scrollIntoView ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
})

const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)
const menuActions = (onRename = vi.fn()) => [
  { label: 'Přejmenovat', icon: Pencil, onSelect: onRename },
  { label: 'Smazat album', icon: Trash2, variant: 'danger' as const, onSelect: vi.fn() },
]

describe('PageHeader', () => {
  it('titulek je právě jedno h1, podtitulek je pod ním, bez backTo a akcí nic dalšího', () => {
    inRouter(<PageHeader title="Galerie" subtitle="Fotky z chaty" />)
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Galerie')
    expect(screen.getByText('Fotky z chaty')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('backTo vykreslí odkaz „Zpět“ na danou stránku', () => {
    inRouter(<PageHeader title="Album" backTo="/galerie" />)
    expect(screen.getByRole('link', { name: 'Zpět' })).toHaveAttribute('href', '/galerie')
  })

  it('primární akce je tlačítko s viditelným textem, s `to` odkaz; bez sekundárních akcí není kebab menu', async () => {
    const onClick = vi.fn()
    inRouter(
      <>
        <PageHeader title="Galerie" primaryAction={{ label: 'Nové album', icon: Plus, onClick }} secondaryActions={[]} />
        <PageHeader title="Rezervace" primaryAction={{ label: 'Nová rezervace', icon: Plus, to: '/rezervace/nova' }} />
      </>,
    )
    const button = screen.getByRole('button', { name: 'Nové album' })
    expect(button.className).toContain('bg-primary')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: 'Nová rezervace' })).toHaveAttribute('href', '/rezervace/nova')
    expect(screen.queryByRole('button', { name: 'Další akce' })).not.toBeInTheDocument()
  })

  it('vedle nejvýš jedné primární akce je vidět jen kebab menu, sekundární akce jsou schované v něm', () => {
    inRouter(<PageHeader title="Album" primaryAction={{ label: 'Nahrát fotky', onClick: vi.fn() }} secondaryActions={menuActions()} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Nahrát fotky', 'Další akce'])
    expect(screen.queryByText('Přejmenovat')).not.toBeInTheDocument()
  })

  it('sekundární akce se vyberou z kebab menu, mazání je oddělené od ostatních', async () => {
    const onRename = vi.fn()
    inRouter(<PageHeader title="Album" secondaryActions={menuActions(onRename)} />)
    const trigger = screen.getByRole('button', { name: 'Další akce' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    trigger.focus()
    await userEvent.keyboard('{Enter}')

    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Přejmenovat', 'Smazat album'])
    expect(within(menu).getByRole('separator')).toBeInTheDocument()
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Přejmenovat' }))
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('EmptyState', () => {
  it('ukáže jednu větu a skrytou ikonu, bez akce nemá tlačítko', () => {
    const { container } = render(<EmptyState icon={Images} message="Zatím tu nejsou žádná alba." />)
    expect(screen.getByText('Zatím tu nejsou žádná alba.')).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('volitelná akce je tlačítko, které se spustí klepnutím, s `to` odkaz', async () => {
    const onClick = vi.fn()
    inRouter(
      <>
        <EmptyState icon={Images} message="Zatím tu nejsou žádná alba." action={{ label: 'Nové album', icon: Plus, onClick }} />
        <EmptyState icon={Images} message="Žádné fotky." action={{ label: 'Do galerie', to: '/galerie' }} />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Nové album' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: 'Do galerie' })).toHaveAttribute('href', '/galerie')
  })
})

describe('Card a ListRow', () => {
  it('Card je papírová karta (bg-sheet, border-rule-soft, shadow-lift), `as` mění prvek, flush je bez odsazení', () => {
    render(
      <>
        <Card as="section" aria-label="Na chatě teď">Obsah</Card>
        <Card flush data-testid="flush" />
      </>,
    )
    const card = screen.getByRole('region', { name: 'Na chatě teď' })
    expect(card).toHaveTextContent('Obsah')
    expect(card).toHaveClass('bg-sheet', 'border-rule-soft', 'shadow-lift')
    expect(screen.getByTestId('flush').className).not.toMatch(/(^|\s)p-\d/)
  })

  it('ListRow má výšku 48 px přes token --touch-target-min, obsah a za ním akci', () => {
    render(
      <ul>
        <ListRow as="li" action={<button type="button">Odebrat</button>}>Mléko</ListRow>
      </ul>,
    )
    const row = screen.getByRole('listitem')
    expect(row).toHaveClass('min-h-(--touch-target-min)')
    expect(row).toHaveTextContent('MlékoOdebrat')
    expect(within(row).getByRole('button', { name: 'Odebrat' })).toBeInTheDocument()
  })
})
