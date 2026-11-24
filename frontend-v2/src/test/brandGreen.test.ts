import { describe, it, expect } from 'vitest'
// `?raw` místo node:fs (není v typech tsconfig.app).
import variablesCssRaw from '@/styles/variables.css?raw'

/**
 * Značková zelená ladí s teplým papírem (#427, picker docs/design/10-zelena-atomy.html).
 *
 * Dřív šalvějová #3d7861 s mátovým podbarvením #e8f4ef táhla do tyrkysova a na sépiové fotce
 * chaty působila cize. Teď Jedle #3e5c47, hover tmavší odstín téže zelené a podbarvení jako
 * 10 % zelené vmíchané do papíru. jsdom kaskádu ani `color-mix` nepočítá, proto se hodnoty
 * čtou z `:root` ve variables.css a míchají tady.
 */

type Rgb = [number, number, number]

const css = variablesCssRaw.replace(/\/\*[\s\S]*?\*\//g, '')
const ROOT = [...css.matchAll(/(^|})\s*:root\s*\{([^{}]*)\}/g)].map((m) => m[2]).join(';')

function decl(name: string): string {
  let value: string | undefined
  for (const d of ROOT.split(';')) {
    const i = d.indexOf(':')
    if (i > 0 && d.slice(0, i).trim() === name) value = d.slice(i + 1).trim()
  }
  if (value === undefined) throw new Error(`Token ${name} v :root chybí`)
  return value
}

/** Barva tokenu: hex, trojice `R G B`, `var(--x)`, `rgb(var(--x))` nebo `color-mix(in srgb, A N%, B)`. */
function color(value: string): Rgb {
  const v = value.trim()
  const ref = /^(?:rgb\()?var\((--[\w-]+)\)\)?$/.exec(v)
  if (ref) return color(decl(ref[1]))
  const mix = /^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*(.+)\)$/.exec(v)
  if (mix) {
    const [a, t, b] = [color(mix[1]), Number(mix[2]) / 100, color(mix[3])]
    return a.map((c, i) => c * t + b[i] * (1 - t)) as Rgb
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(v)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as Rgb
  const parts = v.split(/\s+/).map(Number)
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) return parts as Rgb
  throw new Error(`Neumím převést „${v}“ na barvu`)
}
const token = (name: string) => color(decl(name))

const channel = (c: number) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Odstín v HSL ve stupních. */
function hue([r, g, b]: Rgb): number {
  const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)]
  if (max === min) return 0
  const d = max - min
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

const WHITE: Rgb = [255, 255, 255]

describe('Značková zelená ladí s teplým papírem (#427)', () => {
  it('je Jedle #3e5c47 a hover je tmavší odstín téže zelené, ne skoro černá', () => {
    expect(token('--brand-primary')).toEqual([62, 92, 71])
    expect(token('--brand-primary-hover')).toEqual([47, 70, 54])
  })

  it('netáhne k tyrkysové: odstín zelené i hoveru je pod 145°', () => {
    // Šalvějová #3d7861 měla 156°, máta #e8f4ef 155°.
    expect(hue(token('--brand-primary'))).toBeLessThan(145)
    expect(hue(token('--brand-primary-hover'))).toBeLessThan(145)
  })

  it('podbarvení je 10 % zelené vmíchané do papíru, ne máta', () => {
    expect(decl('--brand-primary-light')).toBe('color-mix(in srgb, var(--brand-primary) 10%, rgb(var(--page)))')
  })

  it('zelený text má kontrast ≥ 4,5 : 1 na papíře i na vlastním podbarvení', () => {
    expect(contrast(token('--brand-primary'), token('--page'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('--brand-primary'), token('--brand-primary-light'))).toBeGreaterThanOrEqual(4.5)
  })

  it('bílý text na tlačítku i na hoveru má kontrast ≥ 4,5 : 1', () => {
    expect(contrast(WHITE, token('--brand-primary'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(WHITE, token('--brand-primary-hover'))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['--raw-color-5', '--raw-off-white', '--bg-card-hover', '--bg-hover'])(
    'plocha %s je teplá (červená složka ≥ zelené), ne mátová',
    (name) => {
      const [r, g] = token(name)
      expect(r).toBeGreaterThanOrEqual(g)
    },
  )
})
