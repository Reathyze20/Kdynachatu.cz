import type { DesignRule } from './designGuard'

/** Strojově ověřitelná pravidla z DESIGN.md (§2–§4, §10). Nové pravidlo přibude sem a do `designAllowlist.json`. */

/** Soubory s definicí tokenů: jediné místo, kde smí být surové barvy, `--raw-*` a `--color-*`. */
export const TOKEN_FILES = ['styles/variables.css', 'styles/shadcn-tokens.css']
/** CSS, které zůstává natrvalo: vstup Tailwindu a definice tokenů. */
const PERMANENT_CSS = ['index.css', ...TOKEN_FILES]

const outsideTokens = (file: string) => !TOKEN_FILES.includes(file)

/** Povolené šířky v media query: `md` (768) a `lg` (1024), pro „pod md/lg“ o pixel méně. */
const ALLOWED_WIDTH = String.raw`min-width:\s*(?:768|1024)px\s*\)|max-width:\s*(?:767|1023)(?:\.98)?px\s*\)`
/** Tailwind varianta breakpointu mimo `md`/`lg` na začátku třídy (`sm:`, `max-xl:`, `min-[900px]:`), ne container query `@sm:`. */
const TW_BREAKPOINT = String.raw`(?<=^|[\s"'\`{:])(?:max-)?(?:sm|xl|2xl|min-\[[^\]]+\]|max-\[[^\]]+\]):(?=[\w[(!-])`

/** Povolené velikosti ikon: `size={16|20|24}`, v Tailwindu `h-4/5/6`, `w-…`, `size-…`. */
const ICON_PX = new Set(['16', '20', '24'])
const ICON_TW = new Set(['4', '5', '6', '[16px]', '[20px]', '[24px]', '[1rem]', '[1.25rem]', '[1.5rem]'])

/** Otevírací JSX tag od `start` po `>` mimo `{…}` a řetězce (zvládne `onClick={() => a > b}`). */
function jsxTag(code: string, start: number): string {
  let depth = 0
  let quote = ''
  for (let i = start; i < code.length; i++) {
    const c = code[i]
    if (quote) quote = c === quote ? '' : quote
    else if (c === '"' || c === "'" || c === '`') quote = c
    else if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0) return code.slice(start, i + 1)
  }
  return code.slice(start)
}

/** Ikony lucide s velikostí mimo 16/20/24: importované komponenty a proměnné ikon (`Icon`, `item.icon`) v souboru s importem lucide-react. */
function iconSizes(code: string): string[] {
  const imported = [...code.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g)]
  if (!imported.length) return []
  const names = imported
    .flatMap((m) => m[1].split(','))
    .map((spec) => spec.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()!)
    .filter(Boolean)
  const tag = new RegExp(String.raw`<(?:${[...names, String.raw`\w*Icon`, String.raw`[a-z]\w*\.icon`].join('|')})(?=[\s/>])`, 'g')
  return [...code.matchAll(tag)].flatMap((m) => {
    const text = jsxTag(code, m.index)
    const sizeExpr = /(?<![\w-])size=(?:\{([^}]*)\}|["']([^"']*)["'])/.exec(text)
    const px = (sizeExpr?.[1] ?? sizeExpr?.[2] ?? '').match(/\d+(?:\.\d+)?/g) ?? []
    const tw = [...text.matchAll(/(?<![\w-])(?:size|h|w)-(\[[^\]\s]+\]|\d+(?:\.\d+)?)(?![\w.-])/g)].map((t) => t[1])
    if (px.every((n) => ICON_PX.has(n)) && tw.every((t) => ICON_TW.has(t))) return []
    return [`ř. ${code.slice(0, m.index).split('\n').length}  ${text.replace(/\s+/g, ' ').slice(0, 100)}`]
  })
}

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
    name: 'fontWeight',
    hint: 'načtené jsou jen řezy 400, 500, 600 a 700 (index.html), jiný by prohlížeč dopočítával; místo 800/900 a font-extrabold/font-black piš 700 a font-bold',
    match: new RegExp(
      [
        String.raw`font-weight:\s*(?!\s|[4-7]00\b|normal\b|bold\b|inherit\b|var\()[^;}"'\n]+`,
        String.raw`fontWeight:\s*['"]?(?![4-7]00\b)\d+`,
        String.raw`\bfont-(?:thin|extralight|light|extrabold|black)\b`,
        String.raw`\bfont-\[(?![4-7]00\])\d+\]`,
      ].join('|'),
      'g',
    ),
  },
  {
    name: 'diaryFont',
    hint: 'ruční písmo Kalam (--font-diary) patří jen Deníku pobytů v styles/diary.css',
    scope: (file) => file !== 'styles/diary.css' && outsideTokens(file),
    match: /--font-diary\b|\bKalam\b/g,
  },
  {
    name: 'inlineSvg',
    hint: 'ikona je komponenta z lucide-react; inline <svg> jen logo, ilustrace landing page a prázdné stavy',
    // Globální fallback se vykreslí, i když spadne zbytek aplikace, proto nesmí záviset na lucide (trvalá výjimka).
    scope: (file) => file.endsWith('.tsx') && file !== 'components/shared/GlobalFallback.tsx',
    match: /<svg\b/g,
  },
  {
    name: 'iconSize',
    hint: 'ikony lucide jen 16 px (v textu, h-4), 20 px (samostatná ikona, h-5) nebo 24 px (EmptyState, h-6)',
    scope: (file) => file.endsWith('.tsx'),
    match: iconSizes,
  },
  {
    name: 'newCssFile',
    hint: 'nový .css soubor nevzniká, nový vzhled se píše utilitami Tailwindu nad tokeny',
    scope: (file) => file.endsWith('.css') && !PERMANENT_CSS.includes(file),
    match: () => ['soubor .css'],
  },
]
