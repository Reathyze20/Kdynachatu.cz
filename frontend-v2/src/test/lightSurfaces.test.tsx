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

  // Teplý papír (D4, #320, tabulka ve specu #319) místo zelenošedé z C4a.
  const LIGHT = { '--page': '246 240 230', '--sheet': '255 252 246', '--sheet-alt': '242 234 220', '--rule': '230 221 207', '--rule-soft': '238 231 220' }

  it.each(Object.entries(LIGHT))('světlý režim: %s = %s, tmavý (.dark) ho definuje taky', (token, value) => {
    expect(lastDecl(tokensIn(':root'), token)).toBe(value)
    expect(lastDecl(tokensIn('.dark'), token)).toBeTruthy()
  })

  it('jemný stín --lift (světlý i tmavý) a pozadí aplikace jsou tokeny', () => {
    expect(lastDecl(tokensIn(':root'), '--lift')).toMatch(/rgb\(16 40 28/)
    expect(lastDecl(tokensIn('.dark'), '--lift')).toBeTruthy()
    // Světlo v rohu bere --glow, ne --sheet-alt, aby plochy na --sheet-alt (vybraný den) neměnily význam (#320).
    expect(lastDecl(tokensIn(':root'), '--bg-app-backdrop')).toMatch(/radial-gradient\([^;]*var\(--glow\)/)
    expect(lastDecl(tokensIn(':root'), '--bg-app-backdrop')).not.toMatch(/--sheet-alt/)
  })
})

/** Barva tokenu jako [r, g, b]: hex, RGB trojice nebo `var(--x)` dohledaná ve stejných pravidlech. */
function rgbOf(rules: Rule[], name: string): number[] {
  const value = lastDecl(rules, name) ?? ''
  const ref = /^var\((--[\w-]+)\)$/.exec(value)
  if (ref) return rgbOf(rules, ref[1])
  if (/^#[0-9a-f]{6}$/i.test(value)) return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16))
  const parts = value.split(/\s+/).map(Number)
  if (parts.length === 3 && parts.every(Number.isFinite)) return parts
  throw new Error(`${name}: neumím převést „${value}“ na barvu`)
}

describe('Teplý papír (D4, #320): hodnoty tokenů podle specu #319', () => {
  const root = fileRules('variables.css').filter((r) => r.selectors.includes(':root'))
  const dark = fileRules('variables.css').filter((r) => r.selectors.includes('.dark'))
  const bridgeDark = fileRules('shadcn-tokens.css').filter((r) => r.selectors.includes('.dark'))

  it.each([
    ['--page', '24 20 17'], ['--sheet', '37 32 27'], ['--sheet-alt', '47 40 33'],
    ['--rule', '66 57 48'], ['--rule-soft', '52 45 38'],
  ])('tmavý režim: %s = %s', (token, value) => {
    expect(lastDecl(dark, token)).toBe(value)
  })

  it('světlo v rohu pozadí --glow: světle 252 232 204, tmavě 58 42 28', () => {
    expect(lastDecl(root, '--glow')).toBe('252 232 204')
    expect(lastDecl(dark, '--glow')).toBe('58 42 28')
  })

  it('hlavní a vedlejší text: světle --text-main / --text-muted, tmavě --foreground / --muted-foreground mostu shadcn', () => {
    expect(rgbOf(root, '--text-main')).toEqual([38, 33, 28])
    expect(rgbOf(root, '--text-muted')).toEqual([94, 82, 70])
    expect(rgbOf(bridgeDark, '--foreground')).toEqual([242, 236, 227])
    expect(rgbOf(bridgeDark, '--muted-foreground')).toEqual([190, 177, 162])
  })

  it('legacy pozadí stránky --bg-app je stejné teplé jako --page', () => {
    expect(rgbOf(root, '--bg-app')).toEqual(rgbOf(root, '--page'))
  })

  it('stavové barvy: světle beze změny, tmavě je --ok (zelený odkaz i Dostatek) 110 191 144', () => {
    expect(lastDecl(root, '--ok')).toBe('47 107 82')
    expect(lastDecl(root, '--low')).toBe('138 75 6')
    expect(lastDecl(root, '--empty')).toBe('180 35 35')
    expect(lastDecl(dark, '--ok')).toBe('110 191 144')
    expect(lastDecl(dark, '--low')).toBe('234 179 8')
    expect(lastDecl(dark, '--empty')).toBe('248 113 113')
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
    '.modal-unified-overlay', '.dialog-overlay', '.lb-overlay',
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

  // Další dvojice z tabulky kontrastu v pickeru D4 (PR #318). Štítky Dochází/Došlo hlídá statusBadgeContrast.test.ts.
  it('světlý: vybraný den (--text-main na --sheet-alt) a zelený odkaz --ok na kartě', () => {
    expect(contrast(rgbOf(root, '--text-main'), rgbOf(root, '--sheet-alt'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(rgbOf(root, '--ok'), rgbOf(root, '--sheet'))).toBeGreaterThanOrEqual(4.5)
  })

  it('tmavý: vybraný den (--foreground na --sheet-alt) a zelený odkaz --ok na kartě', () => {
    expect(contrast(rgbOf(bridgeDark, '--foreground'), rgbOf(dark, '--sheet-alt'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(rgbOf(dark, '--ok'), rgbOf(dark, '--sheet'))).toBeGreaterThanOrEqual(4.5)
  })
})
