import { describe, it, expect } from 'vitest'
// `?raw` deklaruje vite/client; vyhneme se tak node:fs (není v tsconfig.app typech).
import layoutCssRaw from '@/styles/layout.css?raw'
import dashboardCssRaw from '@/styles/dashboard.css?raw'
import navCssRaw from '@/styles/nav.css?raw'

/**
 * CSS kontrakt desktop rámu #1b (#171). jsdom neumí media queries ani layout,
 * proto hlídáme pravidla přímo v CSS.
 */

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

interface CssBlock { prelude: string; body: string }

/** Top-level bloky (pravidla i @media) s vnořeným tělem; jednoduchý parser na počítání závorek. */
function topLevelBlocks(css: string): CssBlock[] {
  const blocks: CssBlock[] = []
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
        blocks.push({ prelude: css.slice(start, preludeEnd).trim(), body: css.slice(preludeEnd + 1, i) })
        start = i + 1
      }
    }
  }
  return blocks
}

/** Počet stop v `grid-template-columns` (podporuje `minmax(…)`). */
function columnCount(declarations: string): number {
  const value = /grid-template-columns\s*:\s*([^;]+);/.exec(declarations)?.[1].trim()
  if (!value) return 1
  return value.replace(/\([^)]*\)/g, '()').split(/\s+/).length
}

/** Všechna pravidla včetně těch vnořených v @media (selektor + tělo). */
function allRules(css: string): CssBlock[] {
  return topLevelBlocks(css).flatMap((b) => (b.prelude.startsWith('@') ? allRules(b.body) : [b]))
}

/** Platí `@media` pro vysoký viewport dané šířky? Jiné podmínky než min/max-width = neplatí. */
function mediaAppliesAt(prelude: string, width: number): boolean {
  const conditions = [...prelude.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim())
  return conditions.every((c) => {
    const m = /^(min|max)-width:\s*(\d+)px$/.exec(c)
    if (!m) return false
    return m[1] === 'min' ? width >= Number(m[2]) : width <= Number(m[2])
  })
}

/** Pravidla pro `selector` platná na dané šířce, v pořadí souboru (poslední vyhrává). */
function rulesAt(css: string, selector: string, width: number): CssBlock[] {
  const walk = (blocks: CssBlock[]): CssBlock[] => blocks.flatMap((b) => {
    if (b.prelude.startsWith('@media')) return mediaAppliesAt(b.prelude, width) ? walk(topLevelBlocks(b.body)) : []
    if (b.prelude.startsWith('@')) return []
    return b.prelude.split(',').some((s) => s.trim() === selector) ? [b] : []
  })
  return walk(topLevelBlocks(stripComments(css)))
}

/** Počet sloupců, který pro `selector` vyjde na dané šířce. */
function columnsAt(css: string, selector: string, width: number): number {
  const last = rulesAt(css, selector, width).filter((r) => /grid-template-columns/.test(r.body)).at(-1)
  return last ? columnCount(last.body) : 1
}

describe('TwoColumnLayout — CSS (#171)', () => {
  it.each([375, 768, 900])('na šířce %i px jeden sloupec: hlavní a boční panel pod sebou', (width) => {
    expect(columnsAt(layoutCssRaw, '.two-column-layout--with-aside', width)).toBe(1)
  })

  it.each([1024, 1440])('na šířce %i px dva sloupce, když je boční panel', (width) => {
    expect(columnsAt(layoutCssRaw, '.two-column-layout--with-aside', width)).toBe(2)
  })

  it('bez bočního panelu zůstane jeden sloupec i na širokém desktopu', () => {
    expect(columnsAt(layoutCssRaw, '.two-column-layout', 1440)).toBe(1)
  })
})

describe('Přehled — dva sloupce, ne tři (rozhodnutí #1b díl 2 = A, #171)', () => {
  it('mřížka karet Přehledu nemá na žádné šířce víc než dva sloupce', () => {
    const rules = allRules(stripComments(dashboardCssRaw))
      .filter((r) => r.prelude.split(',').some((s) => s.trim() === '.dashboard-grid'))
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) expect(columnCount(rule.body)).toBeLessThanOrEqual(2)
  })

  it.each([800, 1100, 1440, 1920])('na šířce %i px má mřížka karet dva sloupce', (width) => {
    expect(columnsAt(dashboardCssRaw, '.dashboard-grid', width)).toBe(2)
  })

  it.each([800, 1440])('na šířce %i px nemá mřížka pevné řádky, takže s málo kartami nevznikne prázdná mezera', (width) => {
    const flexibleRows = rulesAt(dashboardCssRaw, '.dashboard-grid', width)
      .filter((r) => /grid-template-rows\s*:[^;]*fr/.test(r.body))
    expect(flexibleRows).toEqual([])
  })

  it('na mobilu má mřížka karet jeden sloupec', () => {
    expect(columnsAt(dashboardCssRaw, '.dashboard-grid', 375)).toBe(1)
  })
})

describe('Stará horní navigace je pryč (#171)', () => {
  it('nav.css nemá pravidla pro odkazy sekcí v horní liště (nahradil je DesktopSidebar)', () => {
    const selectors = allRules(stripComments(navCssRaw)).flatMap((r) => r.prelude.split(',').map((s) => s.trim()))
    expect(selectors.some((s) => /\.app-nav\b/.test(s))).toBe(false)
    expect(selectors.some((s) => /\.nav-left-group\b/.test(s))).toBe(false)
  })
})
