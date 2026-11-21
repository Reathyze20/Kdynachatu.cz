import { describe, it, expect } from 'vitest'
// `?raw` deklaruje vite/client; vyhneme se tak node:fs (není v tsconfig.app typech).
import layoutCssRaw from '@/styles/layout.css?raw'
import dashboardCssRaw from '@/styles/dashboard.css?raw'
import navCssRaw from '@/styles/nav.css?raw'
import zenModeCssRaw from '@/features/dashboard/ZenMode.css?raw'

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

const SIDES = ['top', 'right', 'bottom', 'left'] as const
type Side = (typeof SIDES)[number]

/** Poslední hodnota vlastnosti pro `selector` na dané šířce (bez `!important`). */
function declarationsAt(css: string, selector: string, width: number): Map<string, string> {
  const result = new Map<string, string>()
  for (const rule of rulesAt(css, selector, width)) {
    for (const decl of rule.body.split(';')) {
      const i = decl.indexOf(':')
      if (i < 0) continue
      result.set(decl.slice(0, i).trim(), decl.slice(i + 1).replace('!important', '').trim())
    }
  }
  return result
}

/** Součet px literálů v hodnotě, `env(…)` se nepočítá: `calc(6px + env(safe-area-inset-bottom, 0px))` → 6. */
const sumPxIgnoringEnv = (value: string) =>
  [...value.replace(/env\([^)]*\)/g, '').matchAll(/(\d+(?:\.\d+)?)px/g)].reduce((sum, m) => sum + Number(m[1]), 0)

/** Výsledné odsazení (hodnoty jako v CSS) podle `padding` a `padding-*` (poslední vyhrává). */
function paddingAt(css: string, selector: string, width: number): Record<Side, string> {
  const padding: Record<Side, string> = { top: '0', right: '0', bottom: '0', left: '0' }
  for (const [prop, value] of declarationsAt(css, selector, width)) {
    if (prop === 'padding') {
      const [t, r = t, b = t, l = r] = value.split(/\s+(?![^(]*\))/)
      Object.assign(padding, { top: t, right: r, bottom: b, left: l })
    } else {
      const side = SIDES.find((s) => prop === `padding-${s}`)
      if (side) padding[side] = value
    }
  }
  return padding
}

describe('Spodní mobilní lišta — zvýraznění aktivní záložky (#192)', () => {
  it.each([360, 375, 768])('na šířce %i px má lišta odstup od všech okrajů, takže zvýraznění nesahá na hranu', (width) => {
    const padding = paddingAt(navCssRaw, '.mobile-nav', width)
    for (const side of SIDES) {
      expect(sumPxIgnoringEnv(padding[side]), side).toBeGreaterThanOrEqual(6)
    }
  })

  it('bezpečná zóna dole zůstává v odsazení lišty', () => {
    expect(paddingAt(navCssRaw, '.mobile-nav', 375).bottom).toMatch(/env\(safe-area-inset-bottom/)
  })

  it('záložky mají dotykovou plochu aspoň 44 px a mezi sebou mezeru', () => {
    expect(sumPxIgnoringEnv(declarationsAt(navCssRaw, '.mobile-nav-link', 375).get('min-height') ?? '')).toBeGreaterThanOrEqual(44)
    expect(sumPxIgnoringEnv(declarationsAt(navCssRaw, '.mobile-nav', 375).get('gap') ?? '')).toBeGreaterThan(0)
  })

  it('na desktopu zůstává lišta skrytá', () => {
    expect(declarationsAt(navCssRaw, '.mobile-nav', 1024).get('display')).toBe('none')
  })
})

describe('Výška spodní mobilní lišty — jeden zdroj pravdy (#196)', () => {
  const NAV_HEIGHT = 'var(--mobile-nav-height)'

  it('nav.css definuje výšku lišty jednou proměnnou na mobilu a lišta z ní vychází', () => {
    const height = declarationsAt(navCssRaw, ':root', 375).get('--mobile-nav-height') ?? ''
    // Lišta po #194: 6 px odsazení nahoře i dole + 1 px rámeček + záložka asi 53 px = asi 66 px.
    expect(sumPxIgnoringEnv(height)).toBeGreaterThanOrEqual(66)
    const minHeight = declarationsAt(navCssRaw, '.mobile-nav', 375).get('min-height') ?? ''
    expect(minHeight).toContain(NAV_HEIGHT)
    expect(minHeight).toMatch(/env\(safe-area-inset-bottom/)
  })

  it('na desktopu proměnná výšky lišty není potřeba', () => {
    expect(declarationsAt(navCssRaw, ':root', 1024).has('--mobile-nav-height')).toBe(false)
  })

  it.each([360, 375, 768])('na šířce %i px je přepínač zen módu nad lištou s odstupem včetně bezpečné zóny', (width) => {
    const bottom = declarationsAt(zenModeCssRaw, '.zen-mode-toggle', width).get('bottom') ?? ''
    expect(bottom).toContain(NAV_HEIGHT)
    expect(bottom).toMatch(/env\(safe-area-inset-bottom/)
    expect(sumPxIgnoringEnv(bottom.replace(NAV_HEIGHT, ''))).toBeGreaterThanOrEqual(8)
  })

  it('obsah stránky odsazuje lištu stejnou proměnnou včetně bezpečné zóny', () => {
    const bottom = paddingAt(navCssRaw, '#page-container', 375).bottom
    expect(bottom).toContain(NAV_HEIGHT)
    expect(bottom).toMatch(/env\(safe-area-inset-bottom/)
  })

  it('na desktopu zůstává přepínač zen módu na původním místě', () => {
    expect(declarationsAt(zenModeCssRaw, '.zen-mode-toggle', 1024).get('bottom')).toBe('var(--space-xl, 24px)')
    expect(declarationsAt(zenModeCssRaw, '.zen-mode-toggle', 1024).get('left')).toBe('var(--space-xl, 24px)')
  })
})
