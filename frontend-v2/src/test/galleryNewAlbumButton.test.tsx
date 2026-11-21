import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FolderGrid } from '@/features/gallery/FolderGrid'
import type { GalleryFolder } from '@/api/gallery'
// `?raw` deklaruje vite/client; vyhneme se tak node:fs (není v tsconfig.app typech).
import galleryCssRaw from '@/styles/gallery.css?raw'

// #199: „Nové album“ v liště galerie bylo kvůli vlastnímu `border-radius: var(--radius-full)`
// oválné, zatímco „Vytvořit první album“ má standardní zaoblení `.btn`. Tvar má dávat
// základní třída `.btn`; lišta si drží jen výšku (36 px desktop / 44 px mobil).
// jsdom CSS nenačítá, proto test hlídá třídy a pravidla přímo v gallery.css.

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

interface CssRule { selector: string; body: string; media: string | null }

/** Pravidla včetně vnořených v @media; jednoduchý parser na počítání závorek. */
function allRules(css: string, media: string | null = null): CssRule[] {
  const rules: CssRule[] = []
  let depth = 0
  let start = 0
  let preludeEnd = 0
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      if (depth === 0) preludeEnd = i
      depth++
    } else if (css[i] === '}') {
      depth--
      if (depth === 0) {
        const prelude = css.slice(start, preludeEnd).trim()
        const body = css.slice(preludeEnd + 1, i)
        if (prelude.startsWith('@')) rules.push(...allRules(body, prelude))
        else rules.push({ selector: prelude, body, media })
        start = i + 1
      }
    }
  }
  return rules
}

const newAlbumRules = allRules(stripComments(galleryCssRaw)).filter((r) =>
  r.selector.split(',').some((s) => /\.gallery-new-album-btn(?![\w-])/.test(s)),
)

const folder: GalleryFolder = { id: 'f1', name: 'Léto', photoCount: 3, createdAt: '2026-07-01T10:00:00.000Z' }

function renderWithFolder(isGuest: boolean, onNewFolder = vi.fn()) {
  render(
    <FolderGrid
      folders={[folder]}
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

describe('FolderGrid – tlačítko „Nové album“ v liště', () => {
  it('používá základní třídu `.btn` jako ostatní primární tlačítka', () => {
    const onNewFolder = renderWithFolder(false)
    const button = screen.getByTestId('gallery-create-folder-button')

    expect(button).toHaveTextContent('Nové album')
    expect(button).toHaveClass('btn', 'btn-primary', 'gallery-new-album-btn')
    expect(button).not.toHaveAttribute('style')

    fireEvent.click(button)
    expect(onNewFolder).toHaveBeenCalledTimes(1)
  })

  it('host tlačítko nevidí', () => {
    renderWithFolder(true)
    expect(screen.queryByTestId('gallery-create-folder-button')).toBeNull()
  })

  it('gallery.css nepřebíjí zaoblení `.btn` vlastním border-radius', () => {
    expect(newAlbumRules.length).toBeGreaterThan(0)
    for (const rule of newAlbumRules) {
      expect(rule.body, rule.selector).not.toMatch(/border-radius\s*:/)
    }
  })

  it('výška v liště zůstává 36 px na desktopu a 44 px na mobilu', () => {
    const desktop = newAlbumRules.filter((r) => r.media === null)
    const mobile = newAlbumRules.filter((r) => r.media !== null && /max-width/.test(r.media))

    expect(desktop.some((r) => /(?:^|[;\s])height\s*:\s*36px/.test(r.body))).toBe(true)
    expect(mobile.some((r) => /(?:^|[;\s])height\s*:\s*44px/.test(r.body))).toBe(true)
  })
})
