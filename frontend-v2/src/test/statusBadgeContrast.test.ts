import { describe, it, expect } from 'vitest'
// `?raw` místo node:fs (není v typech tsconfig.app).
import variablesCssRaw from '@/styles/variables.css?raw'
import shoppingCssRaw from '@/styles/shopping.css?raw'

/**
 * Stavové štítky Dostatek · Málo · Došlo (#269, pravidla G1 a C1).
 *
 * Text v barvě stavu leží na podbarvení ze stejné barvy. Barvy jsou jen v tokenech
 * `variables.css` a kontrast textu vůči podbarvení musí být ≥ 4,5 : 1 ve světlém
 * režimu (appka jiný nemá, #458). jsdom kaskádu nepočítá, proto se kontrast počítá z tokenů vzorcem WCAG.
 */

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Těla pravidel, jejichž seznam selektorů obsahuje `selector` (stačí ploché i vnořené pravidlo). */
function bodiesFor(css: string, selector: string): string[] {
  return [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1].split(',').map((s) => s.trim()).includes(selector))
    .map((m) => m[2])
}

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

function triple(bodies: string[], prop: string): Rgb {
  const value = decl(bodies, prop)
  const parts = value?.split(/\s+/).map(Number)
  if (!parts || parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`${prop} musí být RGB trojice, je „${value}“`)
  }
  return parts as Rgb
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
const mix = (fg: Rgb, bg: Rgb, share: number) => fg.map((c, i) => c * share + bg[i] * (1 - share)) as Rgb

const VARIABLES = stripComments(variablesCssRaw)
const STATES = ['ok', 'low', 'empty'] as const

describe('Stavové štítky: kontrast ≥ 4,5 : 1 z design tokenů (#269)', () => {
  for (const theme of [':root'] as const) {
    describe('světlý režim', () => {
      const themeBodies = bodiesFor(VARIABLES, theme)

      for (const state of STATES) {
        it(`--${state} na svém podbarvení --${state}-bg`, () => {
          const text = triple(themeBodies, `--${state}`)
          const sheet = triple(themeBodies, '--sheet')
          // Podbarvení je neprůhledné (color-mix s plochou karty), aby kontrast nezávisel na hoveru řádku.
          const bg = decl(themeBodies, `--${state}-bg`)
          const m = bg?.match(new RegExp(`^color-mix\\(in srgb,\\s*rgb\\(var\\(--${state}\\)\\)\\s+(\\d+(?:\\.\\d+)?)%,\\s*rgb\\(var\\(--sheet\\)\\)\\)$`))
          expect(m, `--${state}-bg v ${theme}: ${bg}`).toBeTruthy()
          const ratio = contrast(text, mix(text, sheet, Number(m![1]) / 100))
          expect(ratio).toBeGreaterThanOrEqual(4.5)
        })
      }
    })
  }

  it('štítky v Zásobách berou barvy jen z tokenů (C1)', () => {
    for (const [cls, state] of [['.badge-full', 'ok'], ['.badge-low', 'low'], ['.badge-empty', 'empty']] as const) {
      const bodies = bodiesFor(shoppingCssRaw, cls)
      expect(decl(bodies, 'background'), cls).toBe(`var(--${state}-bg)`)
      expect(decl(bodies, 'color'), cls).toBe(`rgb(var(--${state}))`)
    }
  })
})
