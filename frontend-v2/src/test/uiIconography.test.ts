import { describe, it, expect } from 'vitest'

/**
 * Ikonografie UI (#165) — rozhodnutí z redesignu Fáze 4: UI ikony jsou z `lucide-react`,
 * ne emoji ani unicode dingbaty (✓ ✕ ⚠ ✎ ★ ☰ ⚡ ✉ ❮ ❯ ⠿ …).
 *
 * Test projde zdrojáky UI a hlídá, aby se dingbaty nevrátily. Šipky v textu odkazů
 * („← Zpět“, „Vše →“), „3×“ v textu a rámečky v komentářích (─) se nehlídají; samotné
 * `×` / `←` / `→` jako jediný obsah prvku (zavírací tlačítko, šipka zpět) ano.
 */

// `?raw` deklaruje vite/client; vyhneme se tak node:fs (není v tsconfig.app typech).
const SOURCES = import.meta.glob<string>(
  ['../**/*.{ts,tsx}', '!../test/**', '!../**/*.test.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true },
)

/** Misc Symbols, Dingbats, Braille (⠿), bílé šipky (⇨), Misc Symbols & Arrows (⭐), emoji. */
const DINGBAT_RE = /[\u2600-\u27BF\u2800-\u28FF\u21D0-\u21FF\u2B00-\u2BFF\u{1F000}-\u{1FAFF}]/u

/** Znak jako jediný obsah JSX prvku = ikona (`>×</button>`, řádek jen s `←`). */
const GLYPH_ONLY_RE = /(^|>)\s*[\u00D7\u2190\u2192]\s*($|<)/

/** Soubory, kde jsou emoji záměrně obsahem, ne UI ikonou. */
const ALLOWED: Record<string, string> = {
  '../features/notes/MessageContextMenu.tsx': 'reakce na zprávy jsou feature emoji',
  '../components/shared/AnimalAvatar.tsx': 'legacy zvířecí avatary uložené jako emoji',
  '../lib/avatars.ts': 'legacy zvířecí avatary uložené jako emoji',
  '../lib/utils.ts': 'legacy zvířecí avatary uložené jako emoji',
  '../features/dashboard/nudges.ts': 'text zprávy, kterou si uživatel zkopíruje do WhatsAppu',
}

const isComment = (line: string) => /^\s*(\/\/|\/\*|\*)/.test(line)

describe('UI ikonografie', () => {
  it('najde zdrojáky UI (glob nemíří do prázdna)', () => {
    expect(Object.keys(SOURCES)).toContain('../components/layout/MobileHeader.tsx')
    expect(Object.keys(SOURCES)).not.toContain('../test/uiIconography.test.ts')
  })

  it('UI nepoužívá emoji ani unicode dingbaty místo lucide ikon', () => {
    const offenders: string[] = []
    for (const [path, source] of Object.entries(SOURCES)) {
      if (path in ALLOWED) continue
      source.split('\n').forEach((line, i) => {
        if (!isComment(line) && (DINGBAT_RE.test(line) || GLYPH_ONLY_RE.test(line))) {
          offenders.push(`${path.slice(3)}:${i + 1}  ${line.trim()}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})
