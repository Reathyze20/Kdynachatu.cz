import { describe, it, expect } from 'vitest'
// `?raw` místo node:fs (není v typech tsconfig.app).
import variablesCssRaw from '@/styles/variables.css?raw'
import diaryCssRaw from '@/styles/diary.css?raw'

/**
 * Papír zápisníku v deníku (#650, DESIGN.md §1 „Žádné bílé“): stojí na papírovém tokenu karty, ne na skoro bílé
 * `--bg-page-diary`, a text na něm má kontrast ≥ 4,5 : 1. jsdom kaskádu nepočítá, proto se čte CSS a kontrast se
 * počítá z hodnot tokenů vzorcem WCAG.
 */

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

function decl(css: string, selector: string, prop: string): string | undefined {
  let value: string | undefined
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').map((s) => s.trim()).includes(selector)) continue
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':')
      if (i > 0 && d.slice(0, i).trim() === prop) value = d.slice(i + 1).trim()
    }
  }
  return value
}

type Rgb = [number, number, number]
const ROOT = ':root'

/** Hodnota tokenu z `:root` jako RGB: trojice `r g b`, `#hex` nebo `var(--jiný)`. */
function tokenRgb(name: string): Rgb {
  const value = decl(variablesCssRaw, ROOT, name)
  if (!value) throw new Error(`${name} v :root chybí`)
  const ref = /^var\((--[\w-]+)\)$/.exec(value)
  if (ref) return tokenRgb(ref[1])
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as Rgb
  const parts = value.split(/\s+/).map(Number)
  if (parts.length === 3 && parts.every(Number.isFinite)) return parts as Rgb
  throw new Error(`${name}: neznámý tvar „${value}“`)
}

const channel = (c: number) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('papír zápisníku v deníku (#650)', () => {
  it('stojí na papíru karty --sheet, skoro bílý token --bg-page-diary zmizel', () => {
    expect(decl(diaryCssRaw, '.notebook-paper', 'background-color')).toBe('rgb(var(--sheet))')
    expect(variablesCssRaw).not.toContain('--bg-page-diary')
    expect(diaryCssRaw).not.toContain('--bg-page-diary')
  })

  it('linky a okraj papíru jsou teplá linka --rule, ne studená šeď', () => {
    expect(decl(diaryCssRaw, '.notebook-paper', 'background-image')).toBe('linear-gradient(rgb(var(--rule)) 1px, transparent 1px)')
    expect(decl(diaryCssRaw, '.notebook-paper', 'border')).toBe('1px solid rgb(var(--rule))')
  })

  it.each([
    ['.notebook-body textarea', 'zápis', '--text-main'],
    ['.notebook-body textarea::placeholder', 'placeholder', '--text-muted'],
    ['.char-counter', 'počítadlo znaků', '--text-muted'],
  ])('%s (%s) bere %s s kontrastem ≥ 4,5 : 1 na papíru', (selector, _what, token) => {
    expect(decl(diaryCssRaw, selector, 'color')).toBe(`var(${token})`)
    expect(decl(diaryCssRaw, selector, 'opacity') ?? '1').toBe('1')
    expect(contrast(tokenRgb(token), tokenRgb('--sheet'))).toBeGreaterThanOrEqual(4.5)
  })
})
