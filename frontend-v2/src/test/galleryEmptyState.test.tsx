import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FolderGrid } from '@/features/gallery/FolderGrid'

// #195: tlačítko v prázdné galerii mělo jen barvy z `.btn-primary`, bez základní třídy
// `.btn` (flex, padding, zaoblení). Výšku ≥ 44 px dává `.btn-lg` (jsdom layout nepočítá,
// proto test hlídá třídy design systému a absenci inline stylu).

function renderEmpty(isGuest: boolean, onNewFolder = vi.fn()) {
  render(
    <FolderGrid
      folders={[]}
      searchQuery=""
      sortValue="date-desc"
      isGuest={isGuest}
      onSelect={vi.fn()}
      onNewFolder={onNewFolder}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onSearchChange={vi.fn()}
      onSortChange={vi.fn()}
    />,
  )
  return onNewFolder
}

describe('FolderGrid – prázdný stav', () => {
  it('tlačítko „Vytvořit první album“ používá třídy primárního tlačítka bez inline stylu', () => {
    const onNewFolder = renderEmpty(false)
    const button = screen.getByTestId('gallery-empty-create-folder-button')

    expect(button).toHaveTextContent('Vytvořit první album')
    expect(button).toHaveClass('btn', 'btn-primary', 'btn-lg')
    expect(button).not.toHaveAttribute('style')
    expect(button.querySelector('svg')).not.toBeNull()

    fireEvent.click(button)
    expect(onNewFolder).toHaveBeenCalledTimes(1)
  })

  it('host tlačítko nevidí', () => {
    renderEmpty(true)
    expect(screen.getByText('Zatím nemáš žádná alba')).toBeInTheDocument()
    expect(screen.queryByTestId('gallery-empty-create-folder-button')).toBeNull()
    expect(screen.queryByText('Vytvořit první album')).toBeNull()
  })
})
