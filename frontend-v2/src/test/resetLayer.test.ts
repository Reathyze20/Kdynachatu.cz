import { describe, it, expect, beforeAll } from 'vitest'
import { compile } from 'tailwindcss'
import tailwindCssRaw from 'tailwindcss/index.css?raw'

/**
 * Globální reset vs. Tailwind utility (#200).
 *
 * CSS mimo cascade layer přebije každou vrstvu, takže nevrstvený `* { margin: 0; padding: 0 }`
 * potichu vypínal `mt-*`, `p-*`, `space-y-*`. Test zkompiluje skutečný vstup `src/index.css`
 * stejným Tailwind kompilátorem jako build a pro prvek v jsdom vybere vítězné pravidlo podle
 * kaskády (vrstva → specificita → pořadí). jsdom kaskádu s vrstvami sám nepočítá.
 * Zjednodušení: pravidla v `@media`/`@supports`, `!important` a pseudoelementy se ignorují,
 * takže test hlídá jen výchozí (mobilní) kaskádu bez `!important`.
 */

// `?raw` místo node:fs (není v typech tsconfig.app); klíče jsou relativní k tomuto souboru.
const projectCss = import.meta.glob<string>('../**/*.css', { query: '?raw', import: 'default', eager: true })

function resolvePath(base: string, id: string): string {
  const parts = base.split('/').filter(Boolean)
  for (const seg of id.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.' && seg !== '') parts.push(seg)
  }
  return '/' + parts.join('/')
}

function readProjectCss(absPath: string): string {
  const content = projectCss[absPath.replace(/^\/src\//, '../')]
  if (content === undefined) throw new Error(`CSS ${absPath} nenalezeno`)
  return content
}

async function buildAppCss(candidates: string[]): Promise<string> {
  const compiler = await compile(readProjectCss('/src/index.css'), {
    base: '/src',
    loadStylesheet: async (id, base) => {
      if (id === 'tailwindcss') return { path: '/tailwindcss/index.css', base: '/tailwindcss', content: tailwindCssRaw }
      const path = resolvePath(base, id)
      return { path, base: path.slice(0, path.lastIndexOf('/')), content: readProjectCss(path) }
    },
  })
  return compiler.build(candidates)
}

interface Rule { selectors: string[]; decls: Map<string, string>; layer: string | null; order: number }

/** Rozdělí podle čárek na nejvyšší úrovni (ne uvnitř `:where(…)` apod.). */
function splitTopLevel(text: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === sep && depth === 0) { out.push(text.slice(start, i)); start = i + 1 }
  }
  out.push(text.slice(start))
  return out.map((s) => s.trim()).filter(Boolean)
}

/** Plochá pravidla s vrstvou; `@media`, `@supports` apod. se přeskočí. Vrací i pořadí vrstev. */
function parseCss(css: string): { rules: Rule[]; layerOrder: string[] } {
  const rules: Rule[] = []
  const layerOrder: string[] = []
  const noteLayer = (name: string) => { if (!layerOrder.includes(name)) layerOrder.push(name) }

  const walk = (text: string, layer: string | null) => {
    let depth = 0
    let start = 0
    let bodyStart = 0
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === ';' && depth === 0) {
        const stmt = text.slice(start, i).trim()
        if (stmt.startsWith('@layer')) stmt.slice(6).split(',').forEach((n) => noteLayer(n.trim()))
        start = i + 1
      } else if (ch === '{') {
        if (depth === 0) bodyStart = i
        depth++
      } else if (ch === '}') {
        depth--
        if (depth !== 0) continue
        const prelude = text.slice(start, bodyStart).trim()
        const body = text.slice(bodyStart + 1, i)
        start = i + 1
        if (prelude.startsWith('@layer')) {
          const name = prelude.slice(6).trim()
          noteLayer(name)
          walk(body, name)
        } else if (!prelude.startsWith('@')) {
          const decls = new Map<string, string>()
          for (const d of splitTopLevel(body, ';')) {
            const colon = d.indexOf(':')
            if (colon > 0) decls.set(d.slice(0, colon).trim(), d.slice(colon + 1).trim())
          }
          rules.push({ selectors: splitTopLevel(prelude, ','), decls, layer, order: rules.length })
        }
      }
    }
  }
  walk(css.replace(/\/\*[\s\S]*?\*\//g, ''), null)
  return { rules, layerOrder }
}

/** Specificita [id, třída/atribut/pseudotřída, typ]; `:where()` nepočítá. */
function specificity(selector: string): [number, number, number] {
  let s = selector
  while (s.includes(':where(')) {
    const at = s.indexOf(':where(')
    let depth = 0
    let end = at + 6
    for (; end < s.length; end++) {
      if (s[end] === '(') depth++
      else if (s[end] === ')' && --depth === 0) break
    }
    s = s.slice(0, at) + s.slice(end + 1)
  }
  s = s.replace(/:(is|not|has)\(/g, ' ').replace(/\)/g, ' ')
  const ids = (s.match(/#[\w-]+/g) ?? []).length
  const classes = (s.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g) ?? []).length
  const types = (s.replace(/\[[^\]]*\]/g, '').match(/(^|[\s>+~(])[a-zA-Z][\w-]*/g) ?? []).length
  return [ids, classes, types]
}

function compareKeys(a: number[], b: number[]): number {
  const i = a.findIndex((v, idx) => v !== b[idx])
  return i === -1 ? 0 : a[i] - b[i]
}

/** Vítězná deklarace pro `el` mezi vlastnostmi, které nastavují danou hodnotu (longhand i zkratky). */
function winningDecl(css: ReturnType<typeof parseCss>, el: Element, props: string[]) {
  const rank = (layer: string | null) => (layer === null ? Infinity : css.layerOrder.indexOf(layer))
  let best: { selector: string; value: string; cascadeKey: number[] } | null = null
  for (const rule of css.rules) {
    const prop = [...props].reverse().find((p) => rule.decls.has(p))
    if (!prop) continue
    for (const selector of rule.selectors) {
      if (selector.includes('::')) continue
      let matches = false
      try { matches = el.matches(selector) } catch { /* selektor, který jsdom nezná */ }
      if (!matches) continue
      const cascadeKey = [rank(rule.layer), ...specificity(selector), rule.order]
      if (!best || compareKeys(cascadeKey, best.cascadeKey) > 0) best = { selector, value: rule.decls.get(prop)!, cascadeKey }
    }
  }
  return best
}

const MARGIN_TOP = ['margin', 'margin-block', 'margin-top', 'margin-block-start']
const MARGIN_BOTTOM = ['margin', 'margin-block', 'margin-bottom', 'margin-block-end']
const PADDING_LEFT = ['padding', 'padding-inline', 'padding-left', 'padding-inline-start']

describe('globální reset ve vrstvě base (#200)', () => {
  let css: ReturnType<typeof parseCss>

  beforeAll(async () => {
    css = parseCss(await buildAppCss(['mt-3', 'p-4', 'space-y-3']))
    document.body.innerHTML = `
      <div id="margin" class="mt-3"></div>
      <div id="padding" class="p-4"></div>
      <div class="space-y-3"><div id="stacked"></div><div></div></div>
      <p id="plain-p"></p>
      <ul id="plain-ul"></ul>`
  })

  it('vrstva base je v hlavním vstupu před vrstvou utilities', () => {
    expect(css.layerOrder.indexOf('base')).toBeGreaterThanOrEqual(0)
    expect(css.layerOrder.indexOf('base')).toBeLessThan(css.layerOrder.indexOf('utilities'))
  })

  it('mt-3 přebije reset', () => {
    expect(winningDecl(css, document.getElementById('margin')!, MARGIN_TOP)?.selector).toBe('.mt-3')
  })

  it('p-4 přebije reset', () => {
    expect(winningDecl(css, document.getElementById('padding')!, PADDING_LEFT)?.selector).toBe('.p-4')
  })

  it('space-y-3 dá mezeru mezi potomky', () => {
    expect(winningDecl(css, document.getElementById('stacked')!, MARGIN_BOTTOM)?.selector).toContain('.space-y-3')
  })

  it.each([
    ['plain-p', MARGIN_TOP],
    ['plain-ul', PADDING_LEFT],
  ])('prvek bez utility (#%s) dál vynuluje reset', (id, props) => {
    const win = winningDecl(css, document.getElementById(id)!, props)
    expect(win?.selector).toMatch(/^\*/)
    expect(win?.value).toBe('0')
  })
})
