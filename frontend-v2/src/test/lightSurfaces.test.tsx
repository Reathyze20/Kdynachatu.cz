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
const PUBLIC_FILES = ['/styles/landing.css', '/styles/legal.css']

describe('Design tokeny povrchů z mocku (C1)', () => {
  const variables = fileRules('variables.css')
  const tokensIn = (selector: string) => variables.filter((r) => r.selectors.includes(selector))

  // Teplý papír (D4, #320, tabulka ve specu #319) místo zelenošedé z C4a.
  // Plný papír (D3, #339, spec #337): karta má dnešní barvu pozadí, vnořená pole --inset, linka karty 230 221 207.
  const LIGHT = {
    '--page': '246 240 230', '--sheet': '246 240 230', '--sheet-alt': '242 234 220', '--inset': '238 230 217',
    '--rule': '230 221 207', '--rule-soft': '230 221 207', '--under-top': '230 218 198', '--under-bottom': '220 205 181',
  }

  it.each(Object.entries(LIGHT))('světlý režim: %s = %s', (token, value) => {
    expect(lastDecl(tokensIn(':root'), token)).toBe(value)
  })

  it('výraznější stín --lift podle pickeru 08 (plný papír)', () => {
    expect(lastDecl(tokensIn(':root'), '--lift')).toBe('0 1px 2px rgb(0 0 0 / .06), 0 14px 32px -16px rgb(30 20 10 / .45)')
  })

  it('podklad pod kartami je varianta D: gradient --under-top → --under-bottom se září --glow vpravo nahoře', () => {
    const backdrop = lastDecl(tokensIn(':root'), '--bg-app-backdrop')
    // Světlo v rohu bere --glow, ne --sheet-alt, aby plochy na --sheet-alt (vybraný den) neměnily význam (#320).
    expect(backdrop).toMatch(/^radial-gradient\(1200px 700px at 85% -10%, rgb\(var\(--glow\)\), transparent 60%\)/)
    expect(backdrop).toMatch(/linear-gradient\(180deg, rgb\(var\(--under-top\)\), rgb\(var\(--under-bottom\)\)\)$/)
    expect(backdrop).not.toMatch(/--sheet-alt/)
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

  it('světlo v rohu pozadí --glow: světle 252 232 204', () => {
    expect(lastDecl(root, '--glow')).toBe('252 232 204')
  })

  it('hlavní a vedlejší text: světle --text-main / --text-muted', () => {
    expect(rgbOf(root, '--text-main')).toEqual([38, 33, 28])
    expect(rgbOf(root, '--text-muted')).toEqual([94, 82, 70])
  })

  it('legacy pozadí stránky --bg-app je stejné teplé jako --page', () => {
    expect(rgbOf(root, '--bg-app')).toEqual(rgbOf(root, '--page'))
  })

  it('stavové barvy: světle beze změny', () => {
    expect(lastDecl(root, '--ok')).toBe('47 107 82')
    expect(lastDecl(root, '--low')).toBe('138 75 6')
    expect(lastDecl(root, '--empty')).toBe('180 35 35')
  })
})

describe('Lehké pozadí po přihlášení (C5a)', () => {
  it('body nemá fotku ani tmavý závoj, pozadí je gradient z tokenů', () => {
    const body = rulesFor('base.css', 'body')
    expect(body.some((r) => usesPhoto(r.body))).toBe(false)
    expect(lastDecl(body, 'background')).toBe('var(--bg-app-backdrop)')
    expect(rulesFor('base.css', 'body::before')).toEqual([])
  })

  it('podklad jde přes celou výšku okna i u krátkých stránek a na mobilu ho nepřekryje plný obal appky (#339)', () => {
    expect(lastDecl(rulesFor('base.css', 'body').filter((r) => r.media === null), 'min-height')).toBe('100vh')
    const shell = ALL_RULES.filter((r) => r.selectors.includes('.app-container'))
    expect(shell.length).toBeGreaterThan(0)
    for (const prop of ['background', 'background-color']) expect(lastDecl(shell, prop), prop).toBeUndefined()
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

  // Na mobilu nese povrch menu horní a spodní lišta (D3, #339), na desktopu .app-sidebar výš.
  it.each(['.mobile-header', '.mobile-nav'])('mobil: %s má plný papír karty --sheet', (selector) => {
    const rules = rulesFor('nav.css', selector).filter((r) => r.media?.includes('max-width: 767px'))
    expect(rules.length).toBeGreaterThan(0)
    expect(lastDecl(rules, 'background')).toBe('rgb(var(--sheet))')
  })

  // Zubatá „silueta hor“ pod horní lištou působila jako natržený okraj (#438); lišty mají stejnou tenkou linku.
  it('mobil: horní lišta má dole linku --rule-soft jako spodní navigace nahoře, bez zubaté ozdoby', () => {
    const mobile = (selector: string) => rulesFor('nav.css', selector).filter((r) => r.media?.includes('max-width: 767px'))
    expect(lastDecl(mobile('.mobile-header'), 'border-bottom')).toBe('1px solid rgb(var(--rule-soft))')
    expect(lastDecl(mobile('.mobile-nav'), 'border-top')).toBe('1px solid rgb(var(--rule-soft))')
    expect(rulesFor('nav.css', '.mobile-header::after')).toHaveLength(0)
  })

  it('boční panel Kalendáře je papírová karta a plocha Zásob vnořené pole, ne studená bílá (#339)', () => {
    const panel = ALL_RULES.filter((r) => r.file.endsWith('/reservations/Reservations.module.css') && r.selectors.includes('.listContainer') && r.media === null)
    expect(lastDecl(panel, 'background')).toBe('rgb(var(--sheet))')
    expect(lastDecl(panel, 'border')).toBe('1px solid rgb(var(--rule-soft))')
    expect(lastDecl(panel, 'box-shadow')).toBe('var(--lift)')
    expect(lastDecl(rulesFor('shopping.css', '.shopping-page').filter((r) => r.media === null), 'background')).toBe('rgb(var(--inset))')
    // Mobil: kalendář je papírová karta, Zásoby leží přímo na podkladu.
    const mobile = (r: Rule) => r.media?.includes('max-width: 767px') ?? false
    const calendar = ALL_RULES.filter((r) => r.file.endsWith('/reservations/Reservations.module.css') && r.selectors.includes('.calendarCard') && mobile(r))
    expect(lastDecl(calendar, 'background')).toBe('rgb(var(--sheet))')
    expect(lastDecl(rulesFor('shopping.css', '.shopping-page').filter(mobile), 'background')).toBe('transparent')
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
  const tok = (rules: Rule[], name: string) => lastDecl(rules, name) ?? ''

  it.each(['--text-main', '--text-muted', '--brand-primary'])('světlý: %s na --sheet i --page', (token) => {
    const raw = tok(root, token)
    const color = hex(raw.startsWith('var(') ? tok(root, raw.slice(4, -1)) : raw)
    expect(contrast(color, triplet(tok(root, '--sheet')))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(color, triplet(tok(root, '--page')))).toBeGreaterThanOrEqual(4.5)
  })

  // Další dvojice z tabulky kontrastu v pickeru D4 (PR #318). Štítky Dochází/Došlo hlídá statusBadgeContrast.test.ts.
  it('světlý: vybraný den (--text-main na --sheet-alt) a zelený odkaz --ok na kartě', () => {
    expect(contrast(rgbOf(root, '--text-main'), rgbOf(root, '--sheet-alt'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(rgbOf(root, '--ok'), rgbOf(root, '--sheet'))).toBeGreaterThanOrEqual(4.5)
  })

  // Tabulka kontrastu ve specu #337 (plný papír, D3): karta = 246 240 230, vnořené pole = 238 230 217.
  it.each([
    ['hlavní text', '--text-main', '--sheet', 14.05],
    ['vedlejší text', '--text-muted', '--sheet', 6.65],
    ['akční zelená', '--brand-primary', '--sheet', 4.55],
    ['vedlejší text na vnořeném poli', '--text-muted', '--inset', 6.1],
  ])('světlý (spec #337): %s %s na %s ≥ %s : 1', (_name, text, surface, min) => {
    expect(contrast(rgbOf(root, text), rgbOf(root, surface))).toBeGreaterThanOrEqual(min)
  })

  // Text mimo karty (nadpis stránky, prázdný stav) leží na podkladu D; i na jeho tmavším konci musí být čitelný.
  it.each(['--under-top', '--under-bottom'])('světlý: hlavní i vedlejší text na podkladu %s', (surface) => {
    expect(contrast(rgbOf(root, '--text-main'), rgbOf(root, surface))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(rgbOf(root, '--text-muted'), rgbOf(root, surface))).toBeGreaterThanOrEqual(4.5)
  })
})

/**
 * Obrazovky s titulní fotkou (#341, spec #337 D4): fotka je za celou stránkou, takže text mimo karty
 * i poloprůhledné panely by ležely na fotce. Všechno s textem musí stát na plném papíře.
 */
describe('Obrazovky s fotkou: text jen na plném papíře (#341)', () => {
  const isMobile = (r: Rule) => r.media?.includes('max-width: 767px') ?? false
  /** Výsledná hodnota na mobilu: výchozí pravidla, pak mobilní (pořadí ve zdroji). */
  const onMobile = (file: string, selector: string, prop: string) =>
    lastDecl(rulesFor(file, selector).filter((r) => r.media === null || isMobile(r)), prop)
  const onDesktop = (file: string, selector: string, prop: string) =>
    lastDecl(rulesFor(file, selector).filter((r) => r.media === null), prop)

  it.each([
    ['shopping.css', '.detail-view-switcher-track'],
    ['shopping.css', '.shopping-master'],
    ['shopping.css', '.detail-placeholder'],
    ['notes.css', '.notes-sidebar'],
    ['notes.css', '.notes-chat-area-wrapper'],
    ['reconstruction.css', '.reconstruction-card'],
  ])('mobil: %s %s má plný papír --sheet', (file, selector) => {
    expect(onMobile(file, selector, 'background')).toBe('rgb(var(--sheet))')
  })

  it('Zásoby na mobilu: seznamy jsou papírová karta, ne průhledná plocha přes celou šířku', () => {
    expect(onMobile('shopping.css', '.shopping-master', 'border-radius')).toBe('var(--radius-xl)')
    expect(onMobile('shopping.css', '.shopping-master', 'box-shadow')).toBe('var(--lift)')
    // Zásoby na chatě: stejná papírová karta .detail-inner-container jako detail seznamu, mobil ji nepřebíjí
    for (const prop of ['background', 'border', 'box-shadow']) {
      expect(lastDecl(rulesFor('shopping.css', '.pantry-inner-container.detail-inner-container'), prop)).toBeUndefined()
    }
  })

  it('Chat: panel zpráv je plná papírová karta, hlavička bez skla', () => {
    expect(onDesktop('notes.css', '.notes-chat-area-wrapper', 'background')).toBe('rgb(var(--sheet))')
    expect(onDesktop('notes.css', '.notes-chat-area-wrapper', 'border')).toBe('1px solid rgb(var(--rule-soft))')
    expect(onDesktop('notes.css', '.notes-chat-area-wrapper', 'box-shadow')).toBe('var(--lift)')
    expect(onDesktop('notes.css', '.chat-header', 'background')).toBe('rgb(var(--sheet))')
  })

  it('Rekonstrukce: sloupce, hlavička a rozpočet bez skla z bílé s alfou', () => {
    expect(onDesktop('reconstruction.css', '.kanban-column', 'background')).toBe('rgb(var(--sheet))')
    expect(onDesktop('reconstruction.css', '.kanban-column', 'border')).toBe('1px solid rgb(var(--rule-soft))')
    const glass = fileRules('reconstruction.css')
      .filter((r) => /rgba\(255, 255, 255, 0\.[0-8]\d*\)/.test(lastDecl([r], 'background') ?? ''))
      .flatMap((r) => r.selectors)
      .filter((s) => /^\.(reconstruction-(card|header)|budget-container|kanban-column)\b/.test(s))
    expect(glass).toEqual([])
    expect(rulesFor('reconstruction.css', '.reconstruction-card::before')).toEqual([])
  })

  it.each(['col-navrzeno', 'col-schvaleno', 'col-probehlo'])('Rekonstrukce: nadpis a počet sloupce %s na papíře ≥ 4,5 : 1', (col) => {
    const root = fileRules('variables.css').filter((r) => r.selectors.includes(':root'))
    const colorOf = (value: string | undefined) => {
      const token = /^rgb\(var\((--[\w-]+)\)\)$/.exec(value ?? '')
      return token ? rgbOf(root, token[1]) : hex(value ?? '')
    }
    for (const part of ['.kanban-column-header', '.kanban-count']) {
      const color = colorOf(onDesktop('reconstruction.css', `.kanban-column.${col} ${part}`, 'color'))
      expect(contrast(color, rgbOf(root, '--sheet'))).toBeGreaterThanOrEqual(4.5)
    }
  })

  // Správa, Diagnostika a Superadmin: všechen text leží na kartách .admin-page-card (#341, třetí řez)
  it('Správa: karty .admin-page-card jsou plný papír na desktopu i na mobilu', () => {
    expect(onDesktop('admin.css', '.admin-page-card', 'background')).toBe('rgb(var(--sheet))')
    expect(onMobile('admin.css', '.admin-page-card', 'background')).toBe('rgb(var(--sheet))')
    expect(onDesktop('admin.css', '.admin-page-card', 'border')).toBe('1px solid rgb(var(--rule-soft))')
    expect(onDesktop('admin.css', '.admin-page-card', 'box-shadow')).toBe('var(--lift)')
  })

  it.each([
    ['admin.css', '.admin-shell-card'],
    ['admin.css', '.admin-overview-card'],
    ['superadmin.css', '.superadmin-overview-card'],
    ['superadmin.css', '.superadmin-handoff-card'],
  ])('Správa: %s %s nepřebíjí papír karty průsvitným pozadím', (file, selector) => {
    expect([undefined, 'rgb(var(--sheet))']).toContain(onDesktop(file, selector, 'background'))
    expect([undefined, 'rgb(var(--sheet))']).toContain(onMobile(file, selector, 'background'))
  })

  it.each(['.admin-kicker', '.admin-card-eyebrow', '.admin-card-counter', '.admin-user-self-badge', '.admin-support-steps strong'])(
    'Správa: zelený text %s na papíře i s nádechem pilulky ≥ 4,5 : 1',
    (selector) => {
      const root = fileRules('variables.css').filter((r) => r.selectors.includes(':root'))
      const value = onDesktop('admin.css', selector, 'color') ?? ''
      const token = /^(?:rgb\()?var\((--[\w-]+)(?:,[^)]*)?\)\)?$/.exec(value)
      const color = token ? rgbOf(root, token[1]) : hex(value)
      const paper = rgbOf(root, '--sheet')
      const tint = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(onDesktop('admin.css', selector, 'background') ?? '')
      const alpha = tint ? Number(tint[4]) : 0
      const surface = paper.map((p, i) => (tint ? Number(tint[i + 1]) : p) * alpha + p * (1 - alpha))
      expect(contrast(color, surface)).toBeGreaterThanOrEqual(4.5)
    },
  )
})
