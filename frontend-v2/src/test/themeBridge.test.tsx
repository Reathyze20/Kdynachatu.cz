import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
// `?raw` deklaruje vite/client; vyhneme se tak node:fs (není v tsconfig.app typech).
import bridgeCssRaw from '@/styles/shadcn-tokens.css?raw'
import legacyCssRaw from '@/styles/variables.css?raw'

/**
 * Theme bridge (#164) — shadcn/ui ↔ Tailwind v4 token most.
 *
 * Primitiva v `components/ui/*` odkazují na sémantické tokeny (`--primary`,
 * `--background`, `--border` …), které vznikají jen díky tomuto mostu.
 * Tyto testy hlídají, že most zůstane kompletní (light i dark) a aditivní.
 */

// Komentáře odstraníme, ať parser nenarazí na tokeny zmíněné v popisu.
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const bridgeCss = stripComments(bridgeCssRaw)
const legacyCss = stripComments(legacyCssRaw)

/** Názvy všech custom properties deklarovaných v CSS (`--foo: …`). */
function declaredProps(css: string): Set<string> {
  return new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
}

// Sémantické tokeny, které shadcn primitiva potřebují.
const SEMANTIC_TOKENS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
] as const

/** Vrátí tělo prvního CSS bloku pro daný selektor (bez vnořených bloků). */
function block(css: string, selector: string): string {
  const start = css.indexOf(selector)
  expect(start, `blok "${selector}" chybí`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('theme bridge — sémantické tokeny (light i dark)', () => {
  const root = block(bridgeCss, ':root')
  const dark = block(bridgeCss, '.dark')

  for (const token of SEMANTIC_TOKENS) {
    it(`definuje --${token} pro light i dark`, () => {
      expect(root).toMatch(new RegExp(`--${token}\\s*:`))
      expect(dark).toMatch(new RegExp(`--${token}\\s*:`))
    })
  }

  it('light tokeny jsou navázané na paletu „Moderní Les" z variables.css', () => {
    expect(root).toMatch(/--primary\s*:\s*var\(--brand-primary\)/)
    expect(root).toMatch(/--background\s*:\s*var\(--bg-app\)/)
    expect(root).toMatch(/--foreground\s*:\s*var\(--text-main\)/)
    expect(root).toMatch(/--ring\s*:\s*var\(--brand-primary\)/)
  })
})

describe('theme bridge — Tailwind utility most (@theme inline)', () => {
  const theme = block(bridgeCss, '@theme inline')

  for (const token of SEMANTIC_TOKENS) {
    it(`mapuje --color-${token} → var(--${token})`, () => {
      expect(theme).toMatch(
        new RegExp(`--color-${token}\\s*:\\s*var\\(--${token}\\)`),
      )
    })
  }

  it('používá @theme inline — utility čtou var(--primary), ne legacy --color-*', () => {
    // Bez `inline` by .bg-primary četla var(--color-primary), kterou ve
    // variables.css přebíjí legacy alias (--color-primary, --color-border, …).
    expect(bridgeCss).toMatch(/@theme\s+inline/)
  })

  it('je aditivní — :root ani .dark nepředefinují žádnou proměnnou z variables.css', () => {
    // @theme inline blok se záměrně nepočítá: jeho --color-* jdou do @layer theme,
    // kde je nevrstvené aliasy z variables.css přebijí.
    const legacy = declaredProps(legacyCss)
    const emitted = declaredProps(block(bridgeCss, ':root') + block(bridgeCss, '.dark'))
    const overlap = [...emitted].filter((p) => legacy.has(p))
    expect(overlap).toEqual([])
  })
})

describe('theme bridge — primitiva používají tokenové utility', () => {
  it('Button (default) používá bg-primary / text-primary-foreground', () => {
    const { container } = render(<Button>Akce</Button>)
    const btn = container.querySelector('button')!
    expect(btn.className).toContain('bg-primary')
    expect(btn.className).toContain('text-primary-foreground')
  })

  it('Button (outline) používá border-input / bg-background', () => {
    const { container } = render(<Button variant="outline">Akce</Button>)
    const btn = container.querySelector('button')!
    expect(btn.className).toContain('border-input')
    expect(btn.className).toContain('bg-background')
  })

  it('Badge (destructive) používá bg-destructive / text-destructive-foreground', () => {
    const { container } = render(<Badge variant="destructive">Chyba</Badge>)
    const el = container.firstElementChild!
    expect(el.className).toContain('bg-destructive')
    expect(el.className).toContain('text-destructive-foreground')
  })
})
