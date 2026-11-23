import { describe, it, expect } from 'vitest'

/**
 * Žádné barevné proužky vlevo (#355). Barevný levý okraj karty, pole nebo citace je
 * „AI známý trik“ a uživatel ho nechce. Tón (varování, info, výběr) nese ikona, štítek
 * nebo jemné pozadí z tokenů, ne proužek.
 *
 * jsdom kaskádu nepočítá, proto se hlídá CSS a třídy/inline styly v TSX přímo.
 * Neviditelný okraj (`none`, `0`, `transparent`) proužek není a projde.
 * Nehlídá se: holé `border-l` s barvou celého okraje, `box-shadow: inset …` a `::before`
 * proužky; na ty myslí pravidlo ve skillu CabinSaaS Architect.
 */

const CSS = import.meta.glob<string>('../**/*.css', { query: '?raw', import: 'default', eager: true })
const TSX = import.meta.glob<string>(['../**/*.tsx', '!../test/**', '!../**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** Pravidla, kde levý okraj není dekorativní proužek; klíč `soubor|selektor`. */
const ALLOWED: Record<string, string> = {}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const LEFT_BORDER_PROP = /^border-(left|inline-start)(-(width|color|style))?$/
const INVISIBLE_VALUE = /^(none|0(px)?)$|transparent/

/** Tailwind levý okraj s barvou nebo šířkou (`border-l-4`, `md:border-s-amber-400`); `border-l-transparent` je neviditelný. */
const TW_LEFT_BORDER = /\bborder-[ls]-(?!(transparent|0)\b)[\w[\]/#.%-]+/
/** Inline styl levého okraje (`borderLeft`, `borderLeftColor`, `borderInlineStart…`). */
const INLINE_LEFT_BORDER = /\bborder(Left|InlineStart)\w*\s*:/

describe('žádné barevné proužky vlevo', () => {
  it('najde CSS i TSX (glob nemíří do prázdna)', () => {
    expect(Object.keys(CSS)).toContain('../styles/dashboard.css')
    expect(Object.keys(TSX)).toContain('../features/dashboard/DashboardPage.tsx')
  })

  it('CSS nekreslí viditelný levý okraj', () => {
    const offenders: string[] = []
    for (const [path, raw] of Object.entries(CSS)) {
      for (const m of stripComments(raw).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selectors = m[1].split(',').map((s) => s.trim())
        if (selectors.every((s) => `${path}|${s}` in ALLOWED)) continue
        for (const decl of m[2].split(';')) {
          const i = decl.indexOf(':')
          if (i < 0) continue
          const prop = decl.slice(0, i).trim()
          const value = decl.slice(i + 1).replace('!important', '').trim()
          if (LEFT_BORDER_PROP.test(prop) && !INVISIBLE_VALUE.test(value)) {
            offenders.push(`${path.slice(3)}  ${selectors.join(', ')} { ${prop}: ${value} }`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('TSX nepoužívá levý okraj přes Tailwind ani inline styl', () => {
    const offenders: string[] = []
    for (const [path, source] of Object.entries(TSX)) {
      source.split('\n').forEach((line, i) => {
        if (TW_LEFT_BORDER.test(line) || INLINE_LEFT_BORDER.test(line)) {
          offenders.push(`${path.slice(3)}:${i + 1}  ${line.trim()}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})
