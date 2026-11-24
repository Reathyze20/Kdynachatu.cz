import type { DesignRule } from './designGuard'

/** Strojově ověřitelná pravidla z DESIGN.md (§2, §10). Nové pravidlo přibude sem a do `designAllowlist.json`. */

/** Soubory s definicí tokenů: jediné místo, kde smí být surové barvy, `--raw-*` a `--color-*`. */
export const TOKEN_FILES = ['styles/variables.css', 'styles/shadcn-tokens.css']
/** CSS, které zůstává natrvalo: vstup Tailwindu a definice tokenů. */
const PERMANENT_CSS = ['index.css', ...TOKEN_FILES]

const outsideTokens = (file: string) => !TOKEN_FILES.includes(file)

/** Povolené šířky v media query: `md` (768) a `lg` (1024), pro „pod md/lg“ o pixel méně. */
const ALLOWED_WIDTH = String.raw`min-width:\s*(?:768|1024)px\)|max-width:\s*(?:767|1023)(?:\.98)?px\)`
/** Tailwind varianta breakpointu mimo `md`/`lg` na začátku třídy (`sm:`, `max-xl:`, `min-[900px]:`), ne container query `@sm:`. */
const TW_BREAKPOINT = String.raw`(?<=^|[\s"'\`{:])(?:max-)?(?:sm|xl|2xl|min-\[[^\]]+\]|max-\[[^\]]+\]):(?=[\w[(!-])`

export const DESIGN_RULES: DesignRule[] = [
  {
    name: 'rawColour',
    hint: 'surový hex ani rgb()/rgba() s čísly mimo definici tokenů; barva jen z tokenu, s alfou rgb(var(--sheet) / .9)',
    scope: outsideTokens,
    match: /(?<![&\w])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])|\brgba?\(\s*[\d.]/gi,
  },
  {
    name: 'rawPalette',
    hint: 'surovou paletu --raw-* smí používat jen definice tokenů, komponenty berou sémantický token',
    scope: outsideTokens,
    match: /--raw-[\w-]+/g,
  },
  {
    name: 'legacyColorAlias',
    hint: 'alias --color-* je deprecated, použij sémantický token (--text-*, --bg-*, --brand-*, --status-*, --border-*)',
    scope: outsideTokens,
    match: /--color-[\w-]+/g,
  },
  {
    name: 'coldPalette',
    hint: 'studené třídy slate-*, emerald-* a bg-white nepatří na teplý papír; použij bg-sheet, bg-inset, text-(--text-main) …',
    match: /\b(?:slate|emerald)-\d+|\bbg-white\b/g,
  },
  {
    name: 'breakpoint',
    hint: 'breakpointy jen md (768 px) a lg (1024 px): Tailwind md:/lg:, v CSS min-width 768px/1024px',
    match: new RegExp(String.raw`\((?!${ALLOWED_WIDTH})(?:min|max)-width:[^)]*\)|${TW_BREAKPOINT}`, 'g'),
  },
  {
    name: 'newCssFile',
    hint: 'nový .css soubor nevzniká, nový vzhled se píše utilitami Tailwindu nad tokeny',
    scope: (file) => file.endsWith('.css') && !PERMANENT_CSS.includes(file),
    match: () => ['soubor .css'],
  },
]
