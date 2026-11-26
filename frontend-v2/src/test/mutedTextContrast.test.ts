import { describe, it, expect } from 'vitest'
// `?raw` místo node:fs (není v typech tsconfig.app).
import variablesCssRaw from '@/styles/variables.css?raw'
import cabinSettingsCssRaw from '@/styles/cabin-settings.css?raw'
import notesCssRaw from '@/styles/notes.css?raw'
import reconstructionCssRaw from '@/styles/reconstruction.css?raw'
import reservationsModuleCssRaw from '@/features/reservations/Reservations.module.css?raw'

/**
 * Drobný šedý text má kontrast ≥ 4,5 : 1 (WCAG AA, pravidlo G1, #257).
 *
 * Tlumený text jde přes sémantický token `--text-muted`, ne přes lokální hex nebo
 * poloprůhlednou černou. jsdom kaskádu nepočítá, proto se kontrast počítá z hodnot tokenů
 * vzorcem WCAG a u míst z ticketu se hlídá, že token berou.
 */

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Těla pravidel, jejichž seznam selektorů obsahuje přesně `selector` (příkazy typu `@custom-variant …;` před pravidlem se odříznou). */
function bodiesFor(css: string, selector: string): string[] {
  return [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1].split(';').pop()!.split(',').map((s) => s.trim()).includes(selector))
    .map((m) => m[2])
}

/** Poslední deklarace vlastnosti v daných tělech pravidel. */
function decl(bodies: string[], prop: string): string | undefined {
  let value: string | undefined
  for (const body of bodies) {
    for (const d of body.split(';')) {
      const i = d.indexOf(':')
      if (i > 0 && d.slice(0, i).trim() === prop) value = d.slice(i + 1).trim()
    }
  }
  return value
}

type Rgb = [number, number, number]

const ROOT = bodiesFor(variablesCssRaw, ':root')

/** Barvy `rgba(r, g, b, a)` z hodnoty (třeba z gradientu) složené na plochu `bg`. */
const rgbaOver = (value: string | undefined, bg: Rgb): Rgb[] =>
  [...(value ?? '').matchAll(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/g)].map(
    ([, r, g, b, a]) => [Number(r), Number(g), Number(b)].map((c, i) => c * Number(a) + bg[i] * (1 - Number(a))) as Rgb,
  )

/** Barva tokenu jako RGB: hex, `var(--x[, fallback])` (dohledá se ve stejném režimu) nebo trojice `R G B`. */
function color(bodies: string[], value: string | undefined): Rgb {
  const v = value?.trim() ?? ''
  const ref = /^var\((--[\w-]+)(?:,[^)]*)?\)$/.exec(v)
  if (ref) return color(bodies, decl(bodies, ref[1]))
  const hex = /^#([0-9a-f]{6})$/i.exec(v)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as Rgb
  const parts = v.split(/\s+/).map(Number)
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) return parts as Rgb
  throw new Error(`Neumím převést „${v}“ na barvu`)
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

const token = (bodies: string[], name: string) => color(bodies, decl(bodies, name))

describe('Token tlumeného textu --text-muted má kontrast ≥ 4,5 : 1 (#257)', () => {
  // Skutečná pozadí míst z ticketu ve světlém režimu: karty, stránka, plochy redesignu,
  // bublina cizí zprávy v Chatu a podklad hotového úkolu v Rekonstrukci.
  const lightSurfaces: [string, Rgb][] = [
    ['--bg-card', token(ROOT, '--bg-card')],
    ['--bg-app', token(ROOT, '--bg-app')],
    ['--bg-hover', token(ROOT, '--bg-hover')],
    ['--sheet', token(ROOT, '--sheet')],
    ['--page', token(ROOT, '--page')],
    ['bublina cizí zprávy', color(ROOT, decl(bodiesFor(notesCssRaw, '.message-other .message-bubble'), 'background-color'))],
    ...rgbaOver(decl(bodiesFor(reconstructionCssRaw, '.kanban-item.task-done'), 'background'), token(ROOT, '--sheet'))
      .map((bg, i): [string, Rgb] => [`podklad hotového úkolu (stop ${i + 1})`, bg]),
  ]

  it.each(lightSurfaces)('světlý režim: --text-muted na %s', (_name, bg) => {
    expect(contrast(token(ROOT, '--text-muted'), bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('podklad hotového úkolu se z CSS opravdu načetl', () => {
    expect(lightSurfaces.filter(([name]) => name.startsWith('podklad hotového úkolu')).length).toBeGreaterThan(0)
  })
})

describe('Místa z ticketu berou barvu z tokenu, ne z lokálního hex (#257)', () => {
  it.each(['.cs-hint', '.cs-counter'])('Nastavení chaty: nápověda pod polem %s', (selector) => {
    expect(decl(bodiesFor(cabinSettingsCssRaw, selector), 'color')).toBe('var(--text-muted)')
  })

  it.each(['.message-time', '.message-edited-label'])('Chat: %s v cizí zprávě', (selector) => {
    expect(decl(bodiesFor(notesCssRaw, selector), 'color')).toBe('var(--text-muted)')
  })

  it.each(['.message-mine .message-time', '.message-mine .message-edited-label'])(
    'Chat: %s ve vlastní (zelené) bublině je plná barva textu na primární barvě',
    (selector) => {
      const value = decl(bodiesFor(notesCssRaw, selector), 'color')
      expect(value).toBe('var(--text-on-primary)')
      const bubble = color(ROOT, decl(bodiesFor(notesCssRaw, '.message-mine .message-bubble'), 'background-color'))
      expect(contrast(token(ROOT, '--text-on-primary'), bubble)).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('Rezervace: nadpis „Poznámka k měsíci“ (.sectionHeading)', () => {
    expect(decl(bodiesFor(reservationsModuleCssRaw, '.sectionHeading'), 'color')).toBe('var(--text-muted)')
  })

  it('Rekonstrukce: hotový úkol má tlumený název a není zprůhledněný (opacity by kontrast zase srazila)', () => {
    expect(decl(bodiesFor(reconstructionCssRaw, '.task-done .kanban-item-title'), 'color')).toBe('var(--text-muted)')
    const opacity = decl(bodiesFor(reconstructionCssRaw, '.kanban-item.task-done'), 'opacity')
    expect(opacity === undefined || Number(opacity) >= 1).toBe(true)
  })
})
