import { describe, it, expect } from 'vitest'
// `?raw` místo node:fs (není v typech tsconfig.app).
import variablesCssRaw from '@/styles/variables.css?raw'

/**
 * Žádné natvrdo `emerald-*` ani `teal-*` třídy (#429).
 *
 * Tailwind emerald a teal táhnou do tyrkysova a na teplém papíře vypadají mátově, vedle
 * značkové Jedle (#427) působí cize. Zelená jde přes tokeny: hlavní akce `bg-primary`,
 * hover `hover:bg-(--brand-primary-hover)`, vybraná/aktivní plocha `bg-accent`
 * (`--brand-primary-light`), zelený text `text-primary`.
 *
 * `green-*` se nehlídá: znamená stav úspěchu (`FeedbackField` „Díky, uloženo“), ne značku.
 */

const SOURCES = import.meta.glob<string>(
  ['../**/*.{ts,tsx,css}', '!../test/**', '!../**/*.test.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true },
)

/** `bg-emerald-50`, `hover:text-teal-700`, `ring-emerald-200/50`, `var(--color-teal-500)` … */
const EMERALD_OR_TEAL = /\b(emerald|teal)-\d+/

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
  const ref = /^var\((--[\w-]+)\)$|^rgb\(var\((--[\w-]+)\)\)$/.exec(v)
  if (ref) return color(decl(ref[1] ?? ref[2]))
  const mix = /^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*(.+)\)$/.exec(v)
  if (mix) return over(color(mix[1]), Number(mix[2]) / 100, color(mix[3]))
  const hex = /^#([0-9a-f]{6})$/i.exec(v)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as Rgb
  const parts = v.split(/\s+/).map(Number)
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) return parts as Rgb
  throw new Error(`Neumím převést „${v}“ na barvu`)
}
const token = (name: string) => color(decl(name))
/** Barva `a` s krytím `t` položená na `b` (stejně jako Tailwind `bg-primary/20`). */
const over = (a: Rgb, t: number, b: Rgb) => a.map((c, i) => c * t + b[i] * (1 - t)) as Rgb

const channel = (c: number) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('žádné emerald/teal třídy, zelená jde přes značkové tokeny (#429)', () => {
  it('najde TS, TSX i CSS (glob nemíří do prázdna)', () => {
    expect(Object.keys(SOURCES)).toContain('../features/reservations/ui/ReservationList.tsx')
    expect(Object.keys(SOURCES)).toContain('../styles/variables.css')
    expect(Object.keys(SOURCES)).toContain('../main.tsx')
  })

  it('zdroják neobsahuje emerald-* ani teal-*', () => {
    const offenders: string[] = []
    for (const [path, source] of Object.entries(SOURCES)) {
      source.split('\n').forEach((line, i) => {
        if (EMERALD_OR_TEAL.test(line)) offenders.push(`${path.slice(3)}:${i + 1}  ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
  })

  // Nové plochy: vybraná karta a štítek „Pevná“ na bg-accent, UV index na bg-inset (StayWeatherCard),
  // kroužek ikony bg-primary/20 na bg-accent.
  it('zelený text má kontrast ≥ 4,5 : 1 na podbarvení i na vnořeném poli', () => {
    const primary = token('--brand-primary')
    expect(contrast(primary, token('--brand-primary-light'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(primary, token('--inset'))).toBeGreaterThanOrEqual(4.5)
  })

  it('hlavní text na podbarvení má kontrast ≥ 4,5 : 1 a ikona na kroužku ≥ 3 : 1', () => {
    const accent = token('--brand-primary-light')
    expect(contrast(token('--text-main'), accent)).toBeGreaterThanOrEqual(4.5)
    const ring = over(token('--brand-primary'), 0.2, accent)
    expect(contrast(token('--brand-primary'), ring)).toBeGreaterThanOrEqual(3)
  })
})
