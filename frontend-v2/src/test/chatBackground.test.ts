import { describe, it, expect } from 'vitest'
// `?raw` deklaruje vite/client; vyhneme se tak node:fs (není v tsconfig.app typech).
import notesCssRaw from '@/styles/notes.css?raw'

/**
 * Pozadí chatu (#247): textura se zobrazuje s krytím ~7 %, takže musí být lehká
 * kvůli 3G (pravidlo C5a). Velikost souboru měříme z base64 `?inline` importu.
 */

const MAX_BACKGROUND_BYTES = 50 * 1024

// Jen chat-bg*, ať test zbytečně neinlinuje ostatní velké obrázky z public/.
const chatBackgroundImages = import.meta.glob<string>('../../public/chat-bg*.{png,jpg,jpeg,webp,avif}', {
  query: '?inline',
  import: 'default',
  eager: true,
})

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

function chatBackgroundUrl(): string | undefined {
  const css = stripComments(notesCssRaw)
  const rule = /\.notes-chat-area-wrapper::before\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  return /url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(rule)?.[1]
}

/** Velikost v bajtech z data URL (`data:<mime>;base64,<data>`). */
function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return (base64.length * 3) / 4 - padding
}

describe('pozadí chatu', () => {
  it('odkazuje na existující obrázek v public/ do 50 kB', () => {
    const url = chatBackgroundUrl()
    expect(url, 'notes.css: .notes-chat-area-wrapper::before bez background-image').toBeDefined()

    const image = chatBackgroundImages[`../../public${url}`]
    expect(image, `soubor ${url} v public/ neexistuje`).toBeDefined()
    expect(dataUrlBytes(image)).toBeLessThanOrEqual(MAX_BACKGROUND_BYTES)
  })

  it('žádná varianta chat-bg* v public/ nepřesahuje 50 kB', () => {
    for (const [path, image] of Object.entries(chatBackgroundImages)) {
      expect(dataUrlBytes(image), path).toBeLessThanOrEqual(MAX_BACKGROUND_BYTES)
    }
  })
})
