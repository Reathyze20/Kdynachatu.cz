import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Images } from 'lucide-react'
import type { DiaryFolder } from '@/api/diary'
import { EmptyState } from '@/components/shared/EmptyState'
import { DiaryFolders } from '@/features/diary/DiaryFolders'
import { FolderGrid } from '@/features/gallery/FolderGrid'
import type { GalleryFolder } from '@/api/gallery'
import dormouseNotebook from '@/features/dashboard/scene/dormouse-notebook.png'
import dormouseCamera from '@/features/dashboard/scene/dormouse-camera.png'

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { userId: 'u-me', username: 'jana', role: 'user' } }) }))

// Plch z PixelLabu v prázdných stavech (#655, spec #652): dekorativní obrázek místo ikony, ostře 1× (56 px).

describe('EmptyState s obrázkem plcha', () => {
  it('vykreslí dekorativní obrázek 56 px ostře a žádnou ikonu', () => {
    const { container } = render(<EmptyState image={dormouseNotebook} message="Zatím tu nejsou žádné pobyty." />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', dormouseNotebook)
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('width', '56')
    expect(img).toHaveClass('[image-rendering:pixelated]')
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.getByText('Zatím tu nejsou žádné pobyty.')).toBeInTheDocument()
  })

  it('bez obrázku vykreslí skrytou ikonu jako dřív a žádný obrázek', () => {
    const { container } = render(<EmptyState icon={Images} message="Zatím tu nejsou žádná alba." />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('Deník pobytů: prázdný stav', () => {
  const noop = () => {}

  it('prázdný deník ukáže plcha u zápisníku, text a tlačítko Nový pobyt', () => {
    const { container } = render(<DiaryFolders folders={[]} onOpen={noop} onRename={noop} onDelete={noop} onNewFolder={noop} />)
    expect(container.querySelector('img')).toHaveAttribute('src', dormouseNotebook)
    expect(screen.getByText('Zatím tu nejsou žádné pobyty.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nový pobyt' })).toBeInTheDocument()
  })

  it('prázdný výsledek filtru má dál ikonu, ne plcha', () => {
    const old: DiaryFolder = { id: 'stary', name: 'Pobyt stary', startDate: '2001-07-12', endDate: '2001-07-14', createdAt: '2001-01-01T10:00:00.000Z', createdBy: 'jana' }
    const { container } = render(<DiaryFolders folders={[old]} onOpen={noop} onRename={noop} onDelete={noop} onNewFolder={noop} />)
    fireEvent.click(screen.getByRole('button', { name: 'Letos' }))
    const empty = screen.getByText('Letos tu zatím žádný pobyt není.').parentElement!
    expect(container.querySelector('img')).toBeNull()
    expect(empty.querySelector(':scope > svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('Galerie: žádná alba', () => {
  const noop = () => {}
  const renderGrid = (folders: GalleryFolder[], searchQuery = '') =>
    render(
      <FolderGrid
        folders={folders}
        searchQuery={searchQuery}
        sortValue="date-desc"
        onSelect={noop}
        onNewFolder={noop}
        onRename={noop}
        onDelete={noop}
        onSearchChange={noop}
        onSortChange={noop}
      />,
    )

  it('ukáže plcha s fotoaparátem místo ikony složky, text a tlačítko zůstávají', () => {
    const { container } = renderGrid([])
    const empty = screen.getByText('Zatím nemáš žádná alba').parentElement!
    expect(empty.querySelector('img')).toHaveAttribute('src', dormouseCamera)
    expect(empty.querySelector('img')).toHaveAttribute('alt', '')
    expect(empty.querySelector(':scope > svg')).toBeNull()
    expect(container.querySelectorAll('img')).toHaveLength(1)
    expect(screen.getByTestId('gallery-empty-create-folder-button')).toHaveTextContent('Vytvořit první album')
  })

  it('hledání bez výsledku má dál ikonu, ne plcha', () => {
    const album: GalleryFolder = { id: 'a1', name: 'Léto', createdAt: '2025-07-12T10:00:00.000Z', photoCount: 0 }
    const { container } = renderGrid([album], 'zima')
    const empty = screen.getByText('Žádné album neodpovídá hledání').parentElement!
    expect(empty.querySelector(':scope > svg')).not.toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })
})
