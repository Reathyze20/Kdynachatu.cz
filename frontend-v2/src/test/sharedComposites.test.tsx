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
 * Kompozity `shared/` (#454, DESIGN.md §6 a §7). Testuje se přes veřejné props to, co vidí uživatel a čtečka.
 * Třída se ověřuje jen tam, kde je sama pravidlem (papír karty, cíl 48 px řádku), protože jsdom layout nepočítá.
 */

beforeAll(() => {
  // jsdom nemá rozhraní, která Radix Popper a Menu volají (kebab menu hlavičky).
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  Element.prototype.scrollIntoView ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
})

const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('PageHeader', () => {
  it('titulek je právě jedno h1, podtitulek je pod ním', () => {
    inRouter(<PageHeader title="Galerie" subtitle="Fotky z chaty" />)
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Galerie')
    expect(screen.getByText('Fotky z chaty')).toBeInTheDocument()
  })

  it('backTo vykreslí odkaz „Zpět“ na danou stránku', () => {
    inRouter(<PageHeader title="Album" backTo="/galerie" />)
    expect(screen.getByRole('link', { name: 'Zpět' })).toHaveAttribute('href', '/galerie')
  })

  it('bez backTo, akcí a podtitulku je to jen titulek', () => {
    inRouter(<PageHeader title="Galerie" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('primární akce je jedno tlačítko s viditelným textem a spustí se klepnutím', async () => {
    const onClick = vi.fn()
    inRouter(<PageHeader title="Galerie" primaryAction={{ label: 'Nové album', icon: Plus, onClick }} />)
    const button = screen.getByRole('button', { name: 'Nové album' })
    expect(button.className).toContain('bg-primary')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('primární akce s `to` je odkaz se vzhledem tlačítka', () => {
    inRouter(<PageHeader title="Rezervace" primaryAction={{ label: 'Nová rezervace', icon: Plus, to: '/rezervace/nova' }} />)
    expect(screen.getByRole('link', { name: 'Nová rezervace' })).toHaveAttribute('href', '/rezervace/nova')
  })

  it('vedle nejvýš jedné primární akce je vidět jen kebab menu, sekundární akce jsou schované v něm', () => {
    inRouter(
      <PageHeader
        title="Album"
        primaryAction={{ label: 'Nahrát fotky', icon: Plus, onClick: vi.fn() }}
        secondaryActions={[
          { label: 'Přejmenovat', icon: Pencil, onSelect: vi.fn() },
          { label: 'Smazat album', icon: Trash2, variant: 'danger', onSelect: vi.fn() },
        ]}
      />,
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Nahrát fotky', 'Další akce'])
    expect(screen.queryByText('Přejmenovat')).not.toBeInTheDocument()
  })

  it('sekundární akce se vyberou z kebab menu, mazání je oddělené od ostatních', async () => {
    const onRename = vi.fn()
    inRouter(
      <PageHeader
        title="Album"
        secondaryActions={[
          { label: 'Přejmenovat', icon: Pencil, onSelect: onRename },
          { label: 'Smazat album', icon: Trash2, variant: 'danger', onSelect: vi.fn() },
        ]}
      />,
    )
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

  it('bez sekundárních akcí kebab menu není', () => {
    inRouter(<PageHeader title="Galerie" primaryAction={{ label: 'Nové album', onClick: vi.fn() }} secondaryActions={[]} />)
    expect(screen.queryByRole('button', { name: 'Další akce' })).not.toBeInTheDocument()
  })
})

describe('EmptyState', () => {
  it('ukáže jednu větu a skrytou ikonu, bez akce nemá tlačítko', () => {
    const { container } = render(<EmptyState icon={Images} message="Zatím tu nejsou žádná alba." />)
    expect(screen.getByText('Zatím tu nejsou žádná alba.')).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('volitelná akce je tlačítko, které se spustí klepnutím', async () => {
    const onClick = vi.fn()
    render(<EmptyState icon={Images} message="Zatím tu nejsou žádná alba." action={{ label: 'Nové album', icon: Plus, onClick }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Nové album' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('akce s `to` je odkaz', () => {
    inRouter(<EmptyState icon={Images} message="Zatím tu nejsou žádná alba." action={{ label: 'Do galerie', to: '/galerie' }} />)
    expect(screen.getByRole('link', { name: 'Do galerie' })).toHaveAttribute('href', '/galerie')
  })
})

describe('Card', () => {
  it('je papírová karta (bg-sheet, border-rule-soft, shadow-lift) s obsahem', () => {
    render(<Card data-testid="card">Na chatě teď</Card>)
    const card = screen.getByTestId('card')
    expect(card).toHaveTextContent('Na chatě teď')
    expect(card).toHaveClass('bg-sheet', 'border-rule-soft', 'shadow-lift')
  })

  it('`as` změní prvek (sekce s nadpisem), flush odebere vnitřní odsazení pro seznam řádků', () => {
    render(
      <>
        <Card as="section" aria-label="Seznam">
          <h2>Seznam</h2>
        </Card>
        <Card flush data-testid="flush" />
      </>,
    )
    expect(screen.getByRole('region', { name: 'Seznam' }).tagName).toBe('SECTION')
    expect(screen.getByTestId('flush').className).not.toMatch(/(^|\s)p-\d/)
  })
})

describe('ListRow', () => {
  it('má dotykovou výšku 48 px přes token --touch-target-min', () => {
    render(<ListRow data-testid="row">Mléko</ListRow>)
    expect(screen.getByTestId('row')).toHaveClass('min-h-(--touch-target-min)')
  })

  it('vykreslí obsah a akci v jejich slotech, akce je za obsahem', () => {
    render(
      <ul>
        <ListRow as="li" action={<button type="button">Odebrat</button>}>
          Mléko
        </ListRow>
      </ul>,
    )
    const row = screen.getByRole('listitem')
    expect(row).toHaveTextContent('MlékoOdebrat')
    expect(within(row).getByRole('button', { name: 'Odebrat' })).toBeInTheDocument()
  })
})
