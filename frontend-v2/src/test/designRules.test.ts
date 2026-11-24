import { afterAll, describe, it, expect } from 'vitest'
import { assertRule, evaluateRule, SOURCES, type Allowlist } from './designGuard'
import { DESIGN_RULES, TOKEN_FILES } from './designRules'
import allowlistRaw from './designAllowlist.json?raw'

/**
 * Guard tokenů a barev z DESIGN.md (#450). Stávající porušení jsou v designAllowlist.json
 * („pravidlo → důvod → soubory“), který se smí jen zmenšovat. Prázdný allowlist = Krok 6 v #69.
 */

const ALLOWLIST = JSON.parse(allowlistRaw) as Record<string, Allowlist>
const rule = (name: string) => DESIGN_RULES.find((r) => r.name === name)!
const hits = (name: string, snippet: string) => evaluateRule(rule(name), { 'example.tsx': snippet }).violations

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
      '@media (min-width: 768px) {', '@media (min-width: 1024px) {', '@media (max-width: 767.98px) {', "matchMedia('(max-width: 1023px)')",
      'className="md:flex lg:grid max-md:hidden"', 'size: { sm: "h-8" }', 'className="@max-[280px]:hidden"', '.a { max-width: 1200px; }',
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
