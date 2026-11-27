import { describe, it, expect } from 'vitest'

/**
 * Text ve stavové barvě (#661, DESIGN.md §2 Role barev): `--status-error` / `-success` / `-warning` jsou jen pro ikony
 * a rámečky. Jako text nemají kontrast 4,5 : 1 (na papíře 4,3 / 2,9 / 2,8 : 1, na svém `-light` ještě méně), proto
 * chybový text bere `--status-error-dark` a text úspěchu a varování `rgb(var(--ok))` / `rgb(var(--low))`.
 * Totéž hlídá u legacy aliasů `--color-danger` / `-success` / `-warning`, které na ně ukazují.
 */

const CSS = import.meta.glob<string>('../**/*.css', { query: '?raw', import: 'default', eager: true })
const TSX = import.meta.glob<string>(['../**/*.tsx', '!../test/**', '!../**/*.test.tsx'], { query: '?raw', import: 'default', eager: true })

const STATUS = String.raw`--(?:status-(?:error|success|warning)|color-(?:danger|success|warning))(?![\w-])`
const CSS_TEXT = new RegExp(String.raw`(?:^|[\s;{])color:\s*var\(${STATUS}`)
const TSX_TEXT = new RegExp(String.raw`text-\(${STATUS}\)|text-\[var\(${STATUS}\)\]|color:\s*['"\x60]var\(${STATUS}`, 'g')

/** Ikona v CSS: poslední část selektoru míří na svg, `<i>` nebo třídu s „icon“. */
const isIconSelector = (selector: string) => /(?:svg|icon[\w-]*|\bi)$/.test(selector.trim().split(/\s+/).pop() ?? '')

/** Mapy tónů, které barví jen ikonu vedle textu (DESIGN.md §2: ikona úspěchu a varování nenese význam sama). */
const ICON_TONE_MAPS: Record<string, string> = {
  '../components/shared/Toast.tsx': 'ikona toastu vedle textu zprávy',
  '../components/layout/AuthLayout.tsx': 'ikona AuthStatus nad nadpisem',
  '../features/weather/StayHourlyChart.tsx': 'ikona řady grafu vedle popisku',
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
    src.split('\n').forEach((line, i) => {
      if (!line.match(TSX_TEXT) || line.includes('aria-hidden') || file in ICON_TONE_MAPS) return
      found.push(`${file}:${i + 1}: ${line.trim()}`)
    })
  }
  return found
}

describe('stavová barva není barva textu (#661)', () => {
  it('CSS: text bere --status-error-dark, --ok nebo --low, --status-* jen ikony', () => {
    expect(cssViolations()).toEqual([])
  })

  it('TSX: text bere --status-error-dark, --ok nebo --low; --status-* jen na ikoně s aria-hidden', () => {
    expect(tsxViolations()).toEqual([])
  })

  it.each(Object.entries(ICON_TONE_MAPS))('výjimka %s (%s) pořád barví ikonu stavovou barvou', (file) => {
    expect(TSX[file]).toMatch(new RegExp(TSX_TEXT.source))
  })
})
