/**
 * Sdílený pomocník guard testů pro DESIGN.md (#450, kapitola 10). Selže na výskyt mimo allowlist,
 * na položku allowlistu, která je čistá nebo neexistuje (allowlist se smí jen zmenšovat), a na položku bez důvodu.
 */

/** Cesta od `src/` → obsah souboru. */
export type Sources = Record<string, string>
/** Důvod → soubory (cesty od `src/`), kterým pravidlo zatím odpouští. */
export type Allowlist = Record<string, string[]>

export interface DesignRule {
  /** Jméno pravidla = klíč v `designAllowlist.json`. */
  name: string
  /** Co je špatně a co použít místo toho; ukáže se u každého nálezu. */
  hint: string
  /** Trvalý rozsah pravidla (např. bez souborů s definicí tokenů). Výchozí: všechny soubory. */
  scope?: (file: string) => boolean
  /** Globální regex (flag `g`), nebo funkce vracející výskyty. Dostane zdroják bez komentářů. */
  match: RegExp | ((source: string, file: string) => string[])
}

export interface GuardReport {
  violations: string[] // výskyty mimo allowlist: `soubor:řádek  výskyt`
  stale: string[] // položky, které už nic neporušují nebo neexistují: `soubor (důvod)`
  invalid: string[] // položky bez důvodu nebo uvedené víckrát
  remaining: number // kolik souborů z allowlistu pravidlo ještě porušuje
}

const RAW = import.meta.glob<string>(['../**/*.{ts,tsx,css}', '!../test/**', '!../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** Zdrojáky aplikace (TS, TSX, CSS pod `src/`, bez testů); klíč je cesta od `src/`. */
export const SOURCES: Sources = Object.fromEntries(Object.entries(RAW).map(([path, raw]) => [path.slice(3), raw]))

/** Odstraní komentáře, zalomení řádků nechá, aby čísla řádků seděla. `//` v CSS ani v URL komentář není. */
export function stripComments(source: string, file: string): string {
  const noBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
  return file.endsWith('.css') ? noBlocks : noBlocks.replace(/(^|[^:\\])\/\/.*$/gm, '$1')
}

function find(rule: DesignRule, source: string, file: string): string[] {
  const code = stripComments(source, file)
  if (typeof rule.match === 'function') return rule.match(code, file).map((hit) => `${file}  ${hit}`)
  return [...code.matchAll(rule.match)].map((m) => `${file}:${code.slice(0, m.index).split('\n').length}  ${m[0]}`)
}

export function evaluateRule(rule: DesignRule, sources: Sources, allowlist: Allowlist = {}): GuardReport {
  const reasonOf = new Map<string, string>()
  const invalid: string[] = []
  for (const [reason, files] of Object.entries(allowlist)) {
    for (const file of files) {
      if (!reason.trim()) invalid.push(`${file}: chybí důvod`)
      else if (reasonOf.has(file)) invalid.push(`${file}: uveden víckrát`)
      reasonOf.set(file, reason)
    }
  }

  const violations: string[] = []
  const dirty = new Set<string>()
  for (const [file, source] of Object.entries(sources)) {
    if (rule.scope && !rule.scope(file)) continue
    const hits = find(rule, source, file)
    if (hits.length) dirty.add(file)
    if (!reasonOf.has(file)) violations.push(...hits)
  }

  const stale = [...reasonOf].filter(([file]) => !dirty.has(file)).map(([file, reason]) => `${file} (${reason})`)
  return { violations, stale, invalid, remaining: reasonOf.size - stale.length }
}

/** Vyhodnotí pravidlo; při jakémkoli nálezu vyhodí čitelnou chybu, jinak vrátí počet zbývajících výjimek. */
export function assertRule(rule: DesignRule, sources: Sources, allowlist: Allowlist = {}): number {
  const { violations, stale, invalid, remaining } = evaluateRule(rule, sources, allowlist)
  const problems = [
    ['Nový výskyt (oprav podle DESIGN.md, allowlist se nerozšiřuje):', violations],
    ['Soubor je čistý nebo neexistuje, odeber ho z allowlistu:', stale],
    ['Neplatná položka allowlistu:', invalid],
  ] as const
  const body = problems.filter(([, lines]) => lines.length).map(([title, lines]) => `${title}\n  ${lines.join('\n  ')}`)
  if (body.length) throw new Error(`${rule.name}: ${rule.hint}\n${body.join('\n')}`)
  return remaining
}
