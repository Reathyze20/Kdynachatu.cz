import { afterAll, describe, it, expect } from 'vitest'
import { assertRule, evaluateRule, SOURCES, type Allowlist } from './designGuard'
import { DESIGN_RULES, TOKEN_FILES } from './designRules'
import allowlistRaw from './designAllowlist.json?raw'

/**
 * Guard tokenů, barev (#450), písma a ikon (#451) z DESIGN.md. Stávající porušení jsou v designAllowlist.json
 * („pravidlo → důvod → soubory“), který se smí jen zmenšovat. Prázdný allowlist = Krok 6 v #69.
 */

const ALLOWLIST = JSON.parse(allowlistRaw) as Record<string, Allowlist>
const rule = (name: string) => DESIGN_RULES.find((r) => r.name === name)!
const hits = (name: string, snippet: string) => evaluateRule(rule(name), { 'example.tsx': snippet }).violations
const LUCIDE = "import { Check, X } from 'lucide-react'\n"

const EXAMPLES: Record<string, { bad: string[]; good: string[] }> = {
  rawColour: {
    bad: ['color: #fff;', 'border: 1px solid #3E5C47;', 'fill="#ffffff80"', 'box-shadow: 0 1px rgba(0, 0, 0, .1);', 'color: rgb(255 0 0);'],
    good: ['color: rgb(var(--sheet) / .96);', "replace(/'/g, '&#039;')", 'href="#main"', 'color: var(--text-main);'],
  },
  rawPalette: { bad: ['color: var(--raw-color-2);'], good: ['color: var(--brand-primary);'] },
  legacyColorAlias: {
    bad: ['color: var(--color-primary);', 'className="text-(--color-text-muted)"'],
    good: ['color: var(--text-muted);', 'className="bg-primary text-primary-foreground"'],
  },
  coldPalette: {
    bad: ['className="bg-slate-50"', 'className="text-emerald-700"', 'className="rounded bg-white p-4"', 'className="bg-white/80"'],
    good: ['className="bg-sheet border-rule-soft"', 'className="text-white"'],
  },
  breakpoint: {
    bad: ['@media (max-width: 768px) {', '@media (min-width: 769px) {', 'className="sm:grid-cols-2"', 'className="max-xl:hidden"', 'className="min-[900px]:flex"', 'className="hover:sm:flex"'],
    good: [
      '@media (min-width: 768px) {', '@media (min-width: 1024px) {', '@media (max-width: 767.98px ) {', "matchMedia('(max-width: 1023px)')",
      'className="md:flex lg:grid max-md:hidden"', 'size: { sm: "h-8" }', 'className="@max-[280px]:hidden"', '.a { max-width: 1200px; }',
    ],
  },
  fontWeight: {
    bad: [
      'font-weight: 800;', 'font-weight:900}', 'font-weight: 300;', 'fontWeight: 800', "fontWeight: '900'",
      'className="font-extrabold"', 'className="font-black"', 'className="font-light"', 'className="font-[800]"',
    ],
    good: [
      'font-weight: 700;', 'font-weight: 400;', 'font-weight: bold;', 'font-weight: var(--w);', 'fontWeight: 600',
      'className="font-bold font-semibold font-medium font-normal"', 'className="font-[500]"',
    ],
  },
  diaryFont: { bad: ['font-family: var(--font-diary);', "fontFamily: 'Kalam, cursive'"], good: ['font-family: var(--font-family);'] },
  localFormatter: {
    bad: [
      "d.toLocaleDateString('cs-CZ')", "d.toLocaleTimeString('cs-CZ', { hour: '2-digit' })", "cost.toLocaleString('cs-CZ')",
      "new Intl.DateTimeFormat('cs-CZ')", 'Intl.NumberFormat("cs-CZ")', "const M = ['ledna'", 'const M = ["Leden"', "'Září'", "'prosinci'",
    ],
    good: [
      "formatDate(d)", "monthName(2, 'genitive')", '<p>Poslední aktualizace: 12. dubna 2026</p>', "'ledovec'", "a.localeCompare(b, 'cs')",
    ],
  },
  inlineSvg: { bad: ['<svg viewBox="0 0 24 24"><path d="M1 1" /></svg>'], good: [`${LUCIDE}<Check size={16} />`] },
  iconSize: {
    bad: [
      `${LUCIDE}<Check size={18} />`, "import { Check as Ok } from 'lucide-react'\n<Ok size={14} aria-hidden />",
      `${LUCIDE}<X className="h-3.5 w-3.5" />`, `${LUCIDE}<X className="size-8" />`, `${LUCIDE}<X className="w-[18px]" />`,
      `${LUCIDE}<X size={compact ? 14 : 16} />`, `${LUCIDE}const Icon = item.icon\n<Icon size={28} />`, `${LUCIDE}<item.icon size={18} />`,
    ],
    good: [
      `${LUCIDE}<Check size={16} />\n<X size={20} onClick={() => a > b} />`, `${LUCIDE}<X className="h-4 w-4 md:size-6" />`, `${LUCIDE}<X />`,
      `${LUCIDE}<AnimalAvatar size={48} />`, '<Icon size={48} />', `${LUCIDE}<X data-size="18" />`, `${LUCIDE}<X className="min-h-12 rounded-lg" strokeWidth={2.5} />`,
    ],
  },
  legacyButton: {
    bad: [
      'className="btn"', 'className="mt-2 btn-primary"', "className='btn-secondary'", 'className={`btn-sm ${x}`}', "cn('btn-danger', a)",
      "className={'btn-' + variant}", 'className={`btn-${variant}`}', "querySelector('.btn-primary')",
      "querySelector('.btn:hover')", "closest('.btn.active')", "querySelectorAll('.btn, a')",
    ],
    good: [
      '<Button variant="secondary">', 'id="btn-change-email"', 'data-testid="btn-save"', 'htmlFor="btn-x"', 'name="btn"', 'className="gallery-btn notes-new-thread-btn"',
      'className={css.btnReset}', 'const submitBtn = ref', 'className="button-primary"',
    ],
  },
  legacyCard: {
    bad: [
      'className="page-card"', 'className="admin-page-card page-card"', "className='glass-card p-4'", 'className={`admin-card ${x}`}',
      'className="login-container card"', "className={cn('card', a)}", 'className={`${a} card`}', "querySelector('.glass-card')",
      "closest('.card')",
    ],
    good: [
      '<Card>', 'className="admin-page-card onboarding-card card-footer"', 'className={`${css.card} ${css.cardPast}`}', '<CabinToday variant="card" />',
      'variant: "sidebar" | "card"', 'id="page-card"', 'data-testid="glass-card"', 'className="bg-sheet border-rule-soft shadow-lift"',
    ],
  },
  legacyEmptyState: {
    bad: [
      'className="gallery-empty-state"', "className='detail-empty-state-title'", 'className={`kanban-empty-icon ${x}`}',
      "querySelector('.admin-empty-actions')",
    ],
    good: [
      '<EmptyState icon={Images} message="Zatím tu nejsou žádná alba." />', 'data-testid="gallery-empty-create-folder-button"',
      'className="badge-empty"', 'className="master-empty"', "id: `empty-${n}`", 'const isEmpty = list.length === 0',
    ],
  },
}

describe('pravidla DESIGN.md rozpoznají porušení', () => {
  for (const [name, { bad, good }] of Object.entries(EXAMPLES)) {
    it.each(bad)(`${name} chytí %s`, (snippet) => expect(hits(name, snippet)).toHaveLength(1))
    it.each(good)(`${name} pustí %s`, (snippet) => expect(hits(name, snippet)).toEqual([]))
  }

  it('surová barva, --raw-* a --color-* jsou v souborech s definicí tokenů povolené', () => {
    for (const name of ['rawColour', 'rawPalette', 'legacyColorAlias']) {
      const sources = Object.fromEntries(TOKEN_FILES.map((file) => [file, '--color-x: var(--raw-y, #fff);']))
      expect(evaluateRule(rule(name), sources).violations).toEqual([])
    }
  })

  it('Kalam smí jen Deník (styles/diary.css) a definice tokenů', () => {
    const sources = { 'styles/diary.css': 'font-family: var(--font-diary);', 'styles/variables.css': '--font-diary: "Kalam", cursive;' }
    expect(evaluateRule(rule('diaryFont'), sources).violations).toEqual([])
  })

  it('inline <svg> hlídá jen TSX, globální fallback je trvalá výjimka (vykreslí se i bez lucide)', () => {
    const sources = { 'a.css': '.a { content: "<svg"; }', 'components/shared/GlobalFallback.tsx': '<svg />', 'b.tsx': '<svg />' }
    expect(evaluateRule(rule('inlineSvg'), sources).violations).toEqual(['b.tsx:1  <svg'])
  })

  it('formátovat smí jen lib/format.ts a jen v TS/TSX', () => {
    const sources = { 'lib/format.ts': "new Intl.DateTimeFormat('cs-CZ')", 'a.css': '.a { content: "Leden"; }', 'b.ts': "d.toLocaleDateString()" }
    expect(evaluateRule(rule('localFormatter'), sources).violations).toEqual(['b.ts:1  .toLocaleDateString('])
  })

  it('newCssFile chytí nový .css soubor, vstup Tailwindu a definice tokenů ne', () => {
    const sources = { 'styles/new.css': '', 'features/x/X.module.css': '', 'index.css': '', 'x.tsx': '', ...Object.fromEntries(TOKEN_FILES.map((f) => [f, ''])) }
    expect(evaluateRule(rule('newCssFile'), sources).violations).toEqual(['styles/new.css  soubor .css', 'features/x/X.module.css  soubor .css'])
  })
})

describe('zdrojáky dodržují DESIGN.md, výjimky jen z allowlistu', () => {
  const remaining: string[] = []
  afterAll(() => console.info(`Zbývající výjimky v designAllowlist.json (Krok 6 v #69):\n  ${remaining.join('\n  ')}`))

  it('allowlist má klíč jen pro existující pravidla', () => {
    expect(Object.keys(ALLOWLIST).filter((name) => !DESIGN_RULES.some((r) => r.name === name))).toEqual([])
  })

  it.each(DESIGN_RULES.map((r) => [r.name, r] as const))('%s', (name, r) => {
    remaining.push(`${name}: ${assertRule(r, SOURCES, ALLOWLIST[name])}`)
  })
})
