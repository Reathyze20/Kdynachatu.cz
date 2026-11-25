import { describe, it, expect } from 'vitest'
// `?raw` deklaruje vite/client; vyhneme se tak node:fs (není v tsconfig.app typech).
import layoutCssRaw from '@/styles/layout.css?raw'
import dashboardCssRaw from '@/styles/dashboard.css?raw'
import navCssRaw from '@/styles/nav.css?raw'
import reservationsCssRaw from '@/features/reservations/Reservations.module.css?raw'

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

// Dva sloupce Přehledu (#1b díl 2 = A) od #172 dělá TwoColumnLayout: hlavní sloupec + boční panel
// (CSS kontrakt výše). Karty uvnitř sloupce jsou prioritní stack pod sebou a nenatahují se do výšky souseda.
describe('Přehled — karty v hlavním sloupci pod sebou (#172)', () => {
  it('stará mřížka karet .dashboard-grid už v CSS není', () => {
    const selectors = allRules(stripComments(dashboardCssRaw)).flatMap((r) => r.prelude.split(',').map((s) => s.trim()))
    expect(selectors.some((s) => /\.dashboard-grid\b/.test(s))).toBe(false)
  })

  it.each([375, 800, 1100, 1440, 1920])('na šířce %i px jsou karty hlavního sloupce v jednom sloupci', (width) => {
    const rules = rulesAt(dashboardCssRaw, '.dashboard-stack', width)
    expect(rules.some((r) => /flex-direction\s*:\s*column/.test(r.body))).toBe(true)
    expect(columnsAt(dashboardCssRaw, '.dashboard-stack', width)).toBe(1)
  })

  it.each([800, 1440])('na šířce %i px nemá stack pevné řádky, takže s málo kartami nevznikne prázdná mezera', (width) => {
    const flexibleRows = rulesAt(dashboardCssRaw, '.dashboard-stack', width)
      .filter((r) => /grid-template-rows\s*:[^;]*fr/.test(r.body))
    expect(flexibleRows).toEqual([])
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

/** Výsledné `flex-shrink` pro `selector` na dané šířce (z `flex-shrink` i zkratky `flex`, poslední vyhrává). */
function flexShrinkAt(css: string, selector: string, width: number): number {
  let shrink = 1
  for (const rule of rulesAt(css, selector, width)) {
    for (const decl of rule.body.split(';')) {
      const i = decl.indexOf(':')
      if (i < 0) continue
      const prop = decl.slice(0, i).trim()
      const value = decl.slice(i + 1).replace('!important', '').trim()
      if (prop === 'flex-shrink') shrink = Number(value)
      else if (prop === 'flex') {
        if (value === 'none') shrink = 0
        else if (value === 'auto' || value === 'initial') shrink = 1
        else {
          const numbers = value.split(/\s+/).filter((v) => /^\d+(\.\d+)?$/.test(v))
          shrink = numbers.length >= 2 ? Number(numbers[1]) : 1
        }
      }
    }
  }
  return shrink
}

// Hlavní sloupec Přehledu je flex sloupec s vlastním posuvníkem. Karty mají `overflow: hidden`, takže
// jejich minimální výška je 0: s výchozím `flex-shrink: 1` je flexbox při vyšším obsahu smrskne
// (karta „Visí na tobě“ jako 30px proužek na desktopu 1883 × 900), místo aby sloupec posouval.
describe('Přehled — karty se ve sloupci s posuvníkem nesmrskávají', () => {
  it.each([390, 1024, 1883])('na šířce %i px se hlavní sloupec posouvá', (width) => {
    const decls = declarationsAt(dashboardCssRaw, '.nordic-dashboard', width)
    expect(decls.get('display')).toBe('flex')
    expect(decls.get('flex-direction')).toBe('column')
    expect(decls.get('overflow-y')).toBe('auto')
  })

  it.each([390, 1024, 1883])('na šířce %i px mají přímé děti hlavního sloupce přirozenou výšku', (width) => {
    expect(flexShrinkAt(dashboardCssRaw, '.nordic-dashboard > *', width)).toBe(0)
  })
})

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

  it('obsah stránky odsazuje lištu stejnou proměnnou včetně bezpečné zóny', () => {
    const bottom = paddingAt(navCssRaw, '#page-container', 375).bottom
    expect(bottom).toContain(NAV_HEIGHT)
    expect(bottom).toMatch(/env\(safe-area-inset-bottom/)
  })

  it('odsazení obsahu od lišty je jen v nav.css, layout.css ho nepřebíjí ani neduplikuje', () => {
    expect(declarationsAt(layoutCssRaw, '#page-container', 375).has('padding-bottom')).toBe(false)
  })
})

// Měsíční mřížka (#505): `.calendarGridScroller` má `overflow: hidden`, takže jeho minimální výška je 0
// a ve vysokém okně s pevnou výškou stránky (1440 × 900) ho flexbox stlačil a šestý týden uřízl.
// Řádky mají výšku aspoň podle obsahu (číslo dne + pruh pobytu), karta se nestlačí pod obsah
// a když se nevejde, posouvá se stránka kalendáře – stejně jako hlavní sloupec Přehledu.
describe('Kalendář — měsíční mřížka se neořezává (#505)', () => {
  it.each([1024, 1440])('na šířce %i px je řádek mřížky aspoň tak vysoký jako jeho obsah', (width) => {
    expect(declarationsAt(reservationsCssRaw, '.calDays', width).get('grid-template-rows')).toMatch(/minmax\(\s*min-content/)
  })

  it.each([1024, 1440])('na šířce %i px se mřížka v kartě nestlačí', (width) => {
    expect(flexShrinkAt(reservationsCssRaw, '.calendarGridScroller', width)).toBe(0)
  })

  it.each([1024, 1440])('na šířce %i px karta kalendáře nemá nulovou minimální výšku', (width) => {
    expect(declarationsAt(reservationsCssRaw, '.calendarCard', width).get('min-height') ?? 'auto').not.toBe('0')
  })

  it.each([1024, 1440])('na šířce %i px se stránka kalendáře posouvá, když se mřížka nevejde', (width) => {
    expect(declarationsAt(reservationsCssRaw, '.page', width).get('overflow-y')).toBe('auto')
  })
})
