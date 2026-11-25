import { describe, it, expect } from 'vitest'
import variablesCssRaw from '@/styles/variables.css?raw'
import buttonsCssRaw from '@/styles/buttons.css?raw'
import navCssRaw from '@/styles/nav.css?raw'
import shadcnTokensCssRaw from '@/styles/shadcn-tokens.css?raw'
import buttonTsxRaw from '@/components/ui/button.tsx?raw'

/**
 * Text 16/14 px (G3) a dotykové cíle 48/56 px (B2), revize pravidel 2026-11-22 (#270).
 * jsdom layout ani kaskádu nepočítá, proto se hlídají tokeny a CSS přímo.
 */

const CSS = import.meta.glob<string>('../**/*.css', { query: '?raw', import: 'default', eager: true })
const TSX = import.meta.glob<string>(['../**/*.tsx', '!../test/**', '!../**/*.test.tsx'], { query: '?raw', import: 'default', eager: true })

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Hodnota vlastnosti v posledním pravidle s přesně tímto selektorem (i uvnitř @media, bez `!important`). */
function declaration(css: string, selector: string, prop: string): string | undefined {
  let value: string | undefined
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').some((s) => s.trim() === selector)) continue
    for (const decl of m[2].split(';')) {
      const i = decl.indexOf(':')
      if (i >= 0 && decl.slice(0, i).trim() === prop) value = decl.slice(i + 1).replace('!important', '').trim()
    }
  }
  return value
}

/** Velikost v px pro `Npx` a `Nrem` (1rem = 16 px), jinak undefined (var, em, %, clamp…). */
function toPx(value: string): number | undefined {
  const m = /^(\d*\.?\d+)(px|rem)$/.exec(value.replace('!important', '').trim())
  if (!m) return undefined
  return m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1])
}

const token = (name: string) => declaration(variablesCssRaw, ':root', name) ?? ''

/** Deklarace `font-size` pod 14 px; výjimka je jen glyf ikony označený komentářem `G3 výjimka`. */
function smallFontSizes(css: string): number {
  const withoutPlainComments = css.replace(/\/\*(?!\s*G3 výjimka)[\s\S]*?\*\//g, '')
  return [...withoutPlainComments.matchAll(/font-size\s*:\s*([^;}]+);?[ \t]*(\/\*\s*G3 výjimka)?/g)]
    .filter((m) => !m[2] && (toPx(m[1]) ?? 14) < 14).length
}

/** Písmo pod 14 px v TSX: Tailwind `text-[11px]` a inline `fontSize: '0.75rem'` nebo `fontSize: 12`. */
function smallTsxFontSizes(tsx: string): number {
  return [...tsx.matchAll(/text-\[([\d.]+(?:px|rem))\]|fontSize:\s*(?:['"]([\d.]+(?:px|rem))['"]|(\d+)\b(?!\.))/g)]
    .filter((m) => (toPx(m[1] ?? m[2] ?? `${m[3]}px`) ?? 14) < 14).length
}

/** Počet výskytů pro každý soubor, jen soubory s nenulovým počtem. */
const countPerFile = (files: Record<string, string>, count: (source: string) => number) =>
  Object.fromEntries(Object.entries(files).map(([file, src]) => [file, count(src)] as const).filter(([, n]) => n > 0))

/**
 * Zbývající dluh G3: počet `font-size` pod 14 px v souborech, které ještě nikdo nepřevedl na tokeny.
 * Smí jen klesat. Když soubor převedeš, sniž číslo (nebo řádek smaž); nový soubor sem nepatří.
 */
const G3_DEBT: Record<string, number> = {
  '../features/reservations/Reservations.module.css': 27,
  '../styles/admin.css': 31,
  '../styles/cabin-settings.css': 8,
  '../styles/diary.css': 3,
  '../styles/gallery.css': 12,
  '../styles/invite.css': 6,
  '../styles/landing.css': 18,
  '../styles/legal.css': 3,
  '../styles/notes.css': 25,
  '../styles/reconstruction.css': 7,
  '../styles/reservations.css': 38,
  '../styles/shopping.css': 39,
  '../styles/superadmin.css': 3,
}

/** Totéž pro TSX (Tailwind a inline styly). */
const G3_DEBT_TSX: Record<string, number> = {
  '../components/layout/ProfileDrawer.tsx': 3,
  '../components/shared/FeatureErrorFallback.tsx': 5,
  '../components/shared/GlobalFallback.tsx': 6,
  '../features/gallery/UploadModal.tsx': 1,
  '../features/landing/LandingPage.tsx': 3,
  '../features/reservations/ui/BookingForm.tsx': 2,
  '../features/reservations/ui/CheckoutSection.tsx': 3,
  '../features/reservations/ui/ReservationDetail.tsx': 10,
  '../features/shopping/AddToCartModal.tsx': 1,
  '../features/shopping/BulkAddToCartModal.tsx': 1,
}

describe('G3 · běžný text 16 px, vedlejší 14 px, nic menšího (#270)', () => {
  it('tokeny: běžný text 16 px, vedlejší 14 px a nejmenší token má aspoň 14 px', () => {
    expect(toPx(token('--font-size-base'))).toBe(16)
    expect(toPx(token('--font-size-sm'))).toBe(14)
    expect(token('--font-size-xs')).toBe('var(--font-size-sm)')
  })

  it('Tailwind text-xs vychází z tokenu, takže ani utilita nedá méně než 14 px', () => {
    const theme = /@theme[^{]*\{([^}]*)\}/.exec(stripComments(shadcnTokensCssRaw))?.[1] ?? ''
    expect(theme).toMatch(/--text-xs\s*:\s*var\(--font-size-xs\)/)
  })

  // Typová škála DESIGN.md §3 (#451): role → [velikost, řez, prostrkání]
  const TYPE_SCALE: Record<string, [string, string, string?]> = {
    'page-title': ['var(--font-size-2xl)', '700'],
    'card-title': ['var(--font-size-base)', '600'],
    body: ['var(--font-size-base)', '400'],
    label: ['var(--font-size-sm)', '500'],
    meta: ['var(--font-size-sm)', '400'],
    eyebrow: ['var(--font-size-sm)', '700', '0.06em'],
  }

  it.each(Object.entries(TYPE_SCALE))('typová škála: utilita text-%s má velikost a řez z DESIGN.md §3', (role, [size, weight, tracking]) => {
    const theme = /@theme[^{]*\{([^}]*)\}/.exec(stripComments(shadcnTokensCssRaw))?.[1] ?? ''
    const themeVar = (name: string) => new RegExp(String.raw`(?:^|;)\s*${name}\s*:\s*([^;]+);`).exec(theme)?.[1].trim()
    expect(themeVar(`--text-${role}`)).toBe(size)
    expect(themeVar(`--text-${role}--font-weight`)).toBe(weight)
    expect(themeVar(`--text-${role}--line-height`)).toBeDefined()
    expect(themeVar(`--text-${role}--letter-spacing`)).toBe(tracking)
  })

  it('písmo pod 14 px zbývá jen v souborech se zapsaným dluhem a dluh neroste', () => {
    expect(countPerFile(CSS, smallFontSizes)).toEqual(G3_DEBT)
    expect(countPerFile(TSX, smallTsxFontSizes)).toEqual(G3_DEBT_TSX)
  })
})

describe('B2 · dotykové cíle 48 px, hlavní akce 56 px (#270)', () => {
  it('tokeny: 48 px běžný cíl, 56 px hlavní akce, rozestup 8 px', () => {
    expect(token('--touch-target-min')).toBe('48px')
    expect(token('--touch-target-primary')).toBe('56px')
    expect(token('--touch-target-gap')).toBe('8px')
  })

  it.each(['.btn', '.btn-icon', '.button-primary', '.button-secondary', '.button-danger', '.gallery-btn'])(
    'sdílené tlačítko %s má výšku aspoň 48 px z tokenu',
    (selector) => {
      expect(declaration(buttonsCssRaw, selector, 'min-height')).toBe('var(--touch-target-min)')
    },
  )

  it('ikonové tlačítko je čtvercové, aspoň 48 × 48 px', () => {
    expect(declaration(buttonsCssRaw, '.btn-icon', 'min-width')).toBe('var(--touch-target-min)')
  })

  it('hlavní akce obrazovky (.btn-lg) je 56 px vysoká a plně kulatá', () => {
    expect(declaration(buttonsCssRaw, '.btn-lg', 'min-height')).toBe('var(--touch-target-primary)')
    expect(declaration(buttonsCssRaw, '.btn-lg', 'border-radius')).toBe('var(--radius-full)')
  })

  it.each(['.mobile-nav-link', '.app-sidebar-brand', '.app-sidebar-link', '.app-sidebar-profile-menu .nav-dropdown-item'])(
    'položka navigace %s má výšku z tokenu',
    (selector) => {
      // Fallback v px smí zůstat: test spodní lišty v layoutCss.test.ts čte literál v px.
      expect(declaration(navCssRaw, selector, 'min-height')).toMatch(/^var\(--touch-target-min(, 48px)?\)$/)
    },
  )

  it('shadcn Button nemá velikost pod 48 px a velká varianta je hlavní akce 56 px', () => {
    expect(buttonTsxRaw).not.toMatch(/\b(h|size)-(9|10|11)\b/)
    expect(buttonTsxRaw).toMatch(/lg: "[^"]*min-h-\(--touch-target-primary\)[^"]*rounded-full/)
  })
})
