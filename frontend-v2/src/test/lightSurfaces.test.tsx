import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { AuthPage } from '@/features/auth/AuthPage'

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn(), logout: vi.fn(), user: null }),
}))

/**
 * Lehké pozadí a plné karty (#239, redesign C4a + C5a + G1).
 *
 * C5a: po přihlášení žádná fullscreen fotka (3G a kontrast), jen jemný gradient z tokenů mocku.
 * Fotka smí zůstat na přihlášení a veřejných stránkách. C4a: obsah na plných kartách, sklo
 * (`backdrop-filter`) jen jako akcent – modály, overlaye, toasty, lišty. jsdom neumí kaskádu
 * s obrázky ani blur, proto se hlídá CSS kontrakt přímo ve zdrojácích.
 */

// `?raw` místo node:fs (není v typech tsconfig.app); klíče jsou relativní k tomuto souboru.
const CSS = import.meta.glob<string>('../**/*.css', { query: '?raw', import: 'default', eager: true })
const TSX = import.meta.glob<string>(['../**/*.tsx', '!../test/**', '!../**/*.test.tsx'], { query: '?raw', import: 'default', eager: true })

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

interface Rule { file: string; media: string | null; selectors: string[]; body: string }

/** Všechna pravidla včetně vnořených v @media/@supports/@layer (`media` = podmínka, @layer se nepočítá). */
function rulesOf(file: string, css: string): Rule[] {
  const out: Rule[] = []
  const walk = (text: string, media: string | null) => {
    let [depth, start, preludeEnd] = [0, 0, 0]
    for (let i = 0; i < text.length; i++) {
      if (text[i] === ';' && depth === 0) {
        start = i + 1 // příkaz bez těla (`@import …;`, `@custom-variant …;`)
      } else if (text[i] === '{') {
        if (depth === 0) preludeEnd = i
        depth++
      } else if (text[i] === '}') {
        depth--
        if (depth === 0) {
          const prelude = text.slice(start, preludeEnd).trim()
          const body = text.slice(preludeEnd + 1, i)
          if (prelude.startsWith('@')) walk(body, prelude.startsWith('@layer') ? media : prelude)
          else out.push({ file, media, selectors: prelude.split(',').map((s) => s.trim()), body })
          start = i + 1
        }
      }
    }
  }
  walk(stripComments(css), null)
  return out
}

const ALL_RULES = Object.entries(CSS).flatMap(([file, css]) => rulesOf(file, css))
const fileRules = (name: string) => ALL_RULES.filter((r) => r.file.endsWith(`/styles/${name}`))
const rulesFor = (name: string, selector: string) => fileRules(name).filter((r) => r.selectors.includes(selector))

/** Poslední hodnota vlastnosti ve všech pravidlech pro selektor (bez @media rozlišení). */
function lastDecl(rules: Rule[], prop: string): string | undefined {
  let value: string | undefined
  for (const r of rules) {
    for (const decl of r.body.split(';')) {
      const i = decl.indexOf(':')
      if (i > 0 && decl.slice(0, i).trim() === prop) value = decl.slice(i + 1).replace('!important', '').trim()
    }
  }
  return value
}

const usesBlur = (body: string) => /(?:^|[;\s{])(?:-webkit-)?backdrop-filter\s*:(?!\s*none\b)\s*[^;]+/.test(body)
/** Fotka krajiny (proměnná, soubor, jakékoli JPEG). Jemná textura chatu (PNG, 7 % krytí) sem nepatří. */
const usesPhoto = (body: string) => /--bg-image|bg-hero|url\(\s*["']?[^"')]*\.jpe?g/i.test(body)

/** Veřejné stránky před přihlášením: fotka i sklo nad ní tu zůstávají. */
const PUBLIC_FILES = ['/styles/landing.css', '/styles/legal.css', '/styles/invite.css']

describe('Design tokeny povrchů z mocku (C1)', () => {
  const variables = fileRules('variables.css')
  const tokensIn = (selector: string) => variables.filter((r) => r.selectors.includes(selector))

  const LIGHT = { '--page': '244 247 245', '--sheet': '255 253 250', '--sheet-alt': '233 244 239', '--rule': '223 228 223', '--rule-soft': '233 237 232' }

  it.each(Object.entries(LIGHT))('světlý režim: %s = %s, tmavý (.dark) ho definuje taky', (token, value) => {
    expect(lastDecl(tokensIn(':root'), token)).toBe(value)
    expect(lastDecl(tokensIn('.dark'), token)).toBeTruthy()
  })

  it('jemný stín --lift (světlý i tmavý) a pozadí aplikace jsou tokeny', () => {
    expect(lastDecl(tokensIn(':root'), '--lift')).toMatch(/rgb\(16 40 28/)
    expect(lastDecl(tokensIn('.dark'), '--lift')).toBeTruthy()
    expect(lastDecl(tokensIn(':root'), '--bg-app-backdrop')).toMatch(/radial-gradient\([^;]*var\(--sheet-alt\)/)
  })
})

describe('Lehké pozadí po přihlášení (C5a)', () => {
  it('body nemá fotku ani tmavý závoj, pozadí je gradient z tokenů', () => {
    const body = rulesFor('base.css', 'body')
    expect(body.some((r) => usesPhoto(r.body))).toBe(false)
    expect(lastDecl(body, 'background')).toBe('var(--bg-app-backdrop)')
    expect(rulesFor('base.css', 'body::before')).toEqual([])
  })

  it('fotku v aplikaci nese jen třída .photo-backdrop (přihlášení), mimo veřejné stránky nikde jinde', () => {
    const offenders = ALL_RULES
      .filter((r) => !PUBLIC_FILES.some((f) => r.file.endsWith(f)))
      .filter((r) => usesPhoto(r.body))
      .flatMap((r) => r.selectors)
      .filter((s) => s !== '.photo-backdrop' && !s.startsWith(':root'))
    expect(offenders).toEqual([])
  })

  it('přihlašovací obrazovka fotku má', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { cabinSignupEnabled: false } } as Awaited<ReturnType<typeof apiClient.get>>)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter><AuthPage /></MemoryRouter></QueryClientProvider>)
    expect(screen.getByTestId('auth-page')).toHaveClass('photo-backdrop')
    vi.restoreAllMocks()
  })
})

describe('Plné obsahové karty, sklo jen jako akcent (C4a)', () => {
  const CONTENT_SURFACES: [string, string][] = [
    ['dashboard.css', '.glass-card'],
    ['dashboard.css', '.app-sidebar'],
    ['base.css', '.page-card'],
    ['notes.css', '.notes-sidebar'],
    ['shopping.css', '.detail-inner-container'],
    ['reconstruction.css', '.reconstruction-card'],
  ]

  // Výchozí (desktopová) pravidla; mobilní varianty bez rámečku od kraje ke kraji zůstávají.
  it.each(CONTENT_SURFACES)('%s %s: plný povrch --sheet, linka --rule-soft, stín --lift', (file, selector) => {
    const rules = rulesFor(file, selector).filter((r) => r.media === null)
    expect(rules.length).toBeGreaterThan(0)
    expect(lastDecl(rules, 'background')).toBe('rgb(var(--sheet))')
    expect(lastDecl(rules, 'border')).toBe('1px solid rgb(var(--rule-soft))')
    expect(lastDecl(rules, 'box-shadow')).toBe('var(--lift)')
  })

  it('levý panel Zásob je plný a karty nesimulují sklo rozmazanou fotkou v pseudoelementech', () => {
    expect(lastDecl(rulesFor('shopping.css', '.shopping-master').filter((r) => r.media === null), 'background')).toBe('rgb(var(--sheet))')
    expect(ALL_RULES.filter((r) => r.selectors.some((s) => /^\.(glass-card|app-sidebar)::(before|after)$/.test(s)))).toEqual([])
  })

  // Akcenty povolené pravidlem C4a: modály a overlaye, toasty, lišty; plus přihlášení nad fotkou.
  const ALLOWED_BLUR = new Set([
    '.modal-unified-overlay', '.dialog-overlay', '.lb-overlay', '.zen-overlay',
    '.toast', '.toast-success', '.toast-error', '.toast-info',
    '.chat-header', '.date-separator-label',
    '.login-container', '.register-container',
  ])

  it('backdrop-filter jen na akcentech (modály, overlaye, toasty, lišty) a veřejných stránkách', () => {
    const offenders = ALL_RULES
      .filter((r) => !PUBLIC_FILES.some((f) => r.file.endsWith(f)))
      .filter((r) => usesBlur(r.body))
      .flatMap((r) => r.selectors)
      .filter((s) => !ALLOWED_BLUR.has(s))
    expect(offenders).toEqual([])
  })

  it('komponenty nepoužívají Tailwind backdrop-blur na obsahu', () => {
    const offenders = Object.entries(TSX).filter(([, src]) => /\bbackdrop-blur/.test(src)).map(([file]) => file)
    expect(offenders).toEqual([])
  })
})

/** WCAG kontrast dvou barev [r, g, b]. */
function contrast(a: number[], b: number[]): number {
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  const lum = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const triplet = (t: string) => t.split(/\s+/).map(Number)

describe('Kontrast textu na kartách a pozadí ≥ 4,5:1 (G1)', () => {
  const root = fileRules('variables.css').filter((r) => r.selectors.includes(':root'))
  const dark = fileRules('variables.css').filter((r) => r.selectors.includes('.dark'))
  const bridgeDark = fileRules('shadcn-tokens.css').filter((r) => r.selectors.includes('.dark'))
  const tok = (rules: Rule[], name: string) => lastDecl(rules, name) ?? ''

  it.each(['--text-main', '--text-muted', '--brand-primary'])('světlý: %s na --sheet i --page', (token) => {
    const raw = tok(root, token)
    const color = hex(raw.startsWith('var(') ? tok(root, raw.slice(4, -1)) : raw)
    expect(contrast(color, triplet(tok(root, '--sheet')))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(color, triplet(tok(root, '--page')))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['--foreground', '--muted-foreground'])('tmavý: %s na tmavém --sheet i --page', (token) => {
    const color = hex(tok(bridgeDark, token))
    expect(contrast(color, triplet(tok(dark, '--sheet')))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(color, triplet(tok(dark, '--page')))).toBeGreaterThanOrEqual(4.5)
  })
})
