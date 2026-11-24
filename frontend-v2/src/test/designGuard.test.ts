import { describe, it, expect } from 'vitest'
import { assertRule, evaluateRule, SOURCES, type DesignRule } from './designGuard'

/** Sdílený pomocník guard testů (#450) nad syntetickými zdrojáky. */

const HEX: DesignRule = { name: 'hex', hint: 'barva jen z tokenů', match: /#[0-9a-f]{3,6}\b/gi }

describe('designGuard: pravidlo s allowlistem, který se smí jen zmenšovat', () => {
  it('čistý zdroják bez allowlistu projde', () => {
    const report = evaluateRule(HEX, { 'a.css': '.a { color: var(--text-main); }' }, {})
    expect(report).toEqual({ violations: [], stale: [], invalid: [], remaining: 0 })
  })

  it('nový výskyt mimo allowlist selže a ukáže soubor, řádek a výskyt', () => {
    const report = evaluateRule(HEX, { 'a.css': '.a {\n  color: #fff;\n}' }, {})
    expect(report.violations).toEqual(['a.css:2  #fff'])
  })

  it('výskyt v souboru z allowlistu projde a počítá se do zbývajících výjimek', () => {
    const report = evaluateRule(HEX, { 'a.css': '.a { color: #fff; }', 'b.css': '' }, { 'legacy CSS': ['a.css'] })
    expect(report).toEqual({ violations: [], stale: [], invalid: [], remaining: 1 })
  })

  it('čistý nebo neexistující soubor v allowlistu selže, allowlist se musí zmenšit', () => {
    const report = evaluateRule(HEX, { 'a.css': '.a { color: var(--text-main); }' }, { 'legacy CSS': ['a.css', 'gone.css'] })
    expect(report.stale).toEqual(['a.css (legacy CSS)', 'gone.css (legacy CSS)'])
  })

  it('položka bez důvodu selže, stejně jako soubor uvedený víckrát', () => {
    expect(evaluateRule(HEX, { 'a.css': '#fff' }, { '  ': ['a.css'] }).invalid).toEqual(['a.css: chybí důvod'])
    const twice = evaluateRule(HEX, { 'a.css': '#fff' }, { první: ['a.css'], druhý: ['a.css'] })
    expect(twice.invalid).toEqual(['a.css: uveden víckrát'])
  })

  it('soubor mimo rozsah pravidla se nehlídá a v allowlistu by byl zastaralý', () => {
    const rule: DesignRule = { ...HEX, scope: (file) => file !== 'tokens.css' }
    expect(evaluateRule(rule, { 'tokens.css': '--x: #fff;' }, {}).violations).toEqual([])
    expect(evaluateRule(rule, { 'tokens.css': '--x: #fff;' }, { tokeny: ['tokens.css'] }).stale).toHaveLength(1)
  })

  it('komentáře v CSS i TS se nepočítají a čísla řádků zůstanou', () => {
    const css = '/* #fff\n   #000 */\n.a { color: #abc; }'
    const ts = '// #fff\nconst url = "https://x.cz" /* #000 */\nconst c = "#123"'
    expect(evaluateRule(HEX, { 'a.css': css, 'b.ts': ts }, {}).violations).toEqual(['a.css:3  #abc', 'b.ts:3  #123'])
  })

  it('"/*" uvnitř řetězce komentář neotevírá', () => {
    const tsx = '<input accept="image/*" />\n<p style={{ color: "#fff" }} />\n{/* náhledy */}'
    expect(evaluateRule(HEX, { 'a.tsx': tsx }, {}).violations).toEqual(['a.tsx:2  #fff'])
  })

  it('pravidlo může místo regexu vracet výskyty funkcí (celý soubor)', () => {
    const rule: DesignRule = { name: 'css', hint: 'žádný nový .css', match: (_s, file) => (file.endsWith('.css') ? ['soubor .css'] : []) }
    const report = evaluateRule(rule, { 'a.css': '', 'b.tsx': '' }, {})
    expect(report.violations).toEqual(['a.css  soubor .css'])
  })

  it('assertRule vrátí počet zbývajících výjimek, při nálezu vyhodí čitelnou chybu', () => {
    expect(assertRule(HEX, { 'a.css': '#fff' }, { legacy: ['a.css'] })).toBe(1)
    expect(() => assertRule(HEX, { 'a.css': '#fff', 'b.css': '' }, { legacy: ['b.css'] })).toThrow(
      /hex: barva jen z tokenů[\s\S]*a\.css:1 {2}#fff[\s\S]*b\.css \(legacy\)/,
    )
  })

  it('SOURCES najde TS, TSX i CSS pod src/ bez testů, klíče jsou cesty od src/', () => {
    const files = Object.keys(SOURCES)
    expect(files).toContain('styles/variables.css')
    expect(files).toContain('main.tsx')
    expect(files).toContain('lib/utils.ts')
    expect(files.some((f) => f.startsWith('test/') || /\.test\.tsx?$/.test(f))).toBe(false)
  })
})
