import { describe, it, expect } from 'vitest'

/**
 * Text ve stavové barvě (#661, DESIGN.md §2 Role barev): `--status-error` / `-success` / `-warning` jsou jen pro ikony
 * a rámečky. Jako text nemají kontrast 4,5 : 1 (na papíře 4,3 / 2,9 / 2,8 : 1, na svém `-light` ještě méně), proto
 * chybový text bere `--status-error-dark` a text úspěchu a varování `rgb(var(--ok))` / `rgb(var(--low))`.
 * Totéž hlídá u legacy aliasů `--color-danger` / `-success` / `-warning` a u utility `text-destructive` (= `--status-error`).
 */

const CSS = import.meta.glob<string>('../**/*.css', { query: '?raw', import: 'default', eager: true })
const TSX = import.meta.glob<string>(['../**/*.tsx', '!../test/**', '!../**/*.test.tsx'], { query: '?raw', import: 'default', eager: true })

const STATUS = String.raw`--(?:status-(?:error|success|warning)|color-(?:danger|success|warning))(?![\w-])`
const CSS_TEXT = new RegExp(String.raw`(?:^|[\s;{])color:[^;]*var\(${STATUS}`)
const TSX_TEXT = new RegExp(
  String.raw`text-\(${STATUS}\)|text-\[(?:color:)?var\(${STATUS}\)\]|['"\x60]var\(${STATUS}|\btext-destructive(?![\w-])`,
  'g',
)

/** Ikona v CSS: selektor končí na `svg`, `<i>` nebo třídu `…-icon`. */
const isIconSelector = (selector: string) => /(?:^|[\s>+~])(?:svg|i)$|-icon$/.test(selector.trim())

/** Geometrie inline SVG (`stroke=`, `fill=`) je ikona, ne text. */
const SVG_ATTRIBUTE = /^\s*(?:stroke|fill)=/

/** Povolené řádky: mapy tónů, které barví jen ikonu vedle textu, a místo, které drží existující test. */
const EXCEPTIONS: { file: string; line: RegExp; reason: string }[] = [
  { file: '../components/shared/Toast.tsx', line: /^\s*\w+: 'text-\(--status-/, reason: 'ICON_COLOURS: ikona toastu vedle textu zprávy' },
  { file: '../components/layout/AuthLayout.tsx', line: /^\s*\w+: 'text-\(--status-/, reason: 'STATUS_TONE: ikona AuthStatus nad nadpisem' },
  { file: '../features/weather/StayHourlyChart.tsx', line: /tone: "text-\(--status-warning\)"/, reason: 'tón ikony řady grafu, popisek je inkoust' },
  // inviteRevokeConfirm.test.tsx drží třídu `text-destructive` u obrysového tlačítka (4,3 : 1 na papíru); rozhodne uživatel
  { file: '../features/admin/AdminPage.tsx', line: /^\s*className="text-destructive"$/, reason: 'tlačítko Zrušit pozvánku, třídu drží test' },
]

/** Stavová třída leží v otevíracím tagu s `aria-hidden` (dekorativní ikona). */
function inHiddenTag(line: string, index: number): boolean {
  const start = line.lastIndexOf('<', index)
  const end = line.indexOf('>', index)
  return start >= 0 && line.slice(start, end < 0 ? undefined : end).includes('aria-hidden')
}

function cssViolations(): string[] {
  const found: string[] = []
  for (const [file, raw] of Object.entries(CSS)) {
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!CSS_TEXT.test(m[2])) continue
      for (const selector of m[1].split(',')) {
        if (!isIconSelector(selector)) found.push(`${file}: ${selector.trim()}`)
      }
    }
  }
  return found
}

function tsxViolations(): string[] {
  const found: string[] = []
  for (const [file, src] of Object.entries(TSX)) {
    src.split(/\r?\n/).forEach((line, i) => {
      if (SVG_ATTRIBUTE.test(line) || EXCEPTIONS.some((e) => e.file === file && e.line.test(line))) return
      for (const m of line.matchAll(TSX_TEXT)) {
        if (!inHiddenTag(line, m.index)) {
          found.push(`${file}:${i + 1}: ${line.trim()}`)
          break
        }
      }
    })
  }
  return found
}

describe('stavová barva není barva textu (#661)', () => {
  it('načetl CSS i TSX zdrojáky', () => {
    expect(Object.keys(CSS).length).toBeGreaterThan(10)
    expect(Object.keys(TSX).length).toBeGreaterThan(10)
  })

  it('CSS: text bere --status-error-dark, --ok nebo --low, --status-* jen ikony', () => {
    expect(cssViolations()).toEqual([])
  })

  it('TSX: text bere --status-error-dark, --ok nebo --low; --status-* jen na ikoně s aria-hidden', () => {
    expect(tsxViolations()).toEqual([])
  })

  it.each(EXCEPTIONS.map((e) => [e.file, e.reason, e.line] as const))('výjimka %s (%s) pořád platí', (file, _reason, line) => {
    expect(TSX[file]?.split(/\r?\n/).some((l) => line.test(l))).toBe(true)
  })
})
