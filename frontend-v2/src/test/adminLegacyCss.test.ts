import { describe, expect, it } from 'vitest'
import indexCssRaw from '@/index.css?raw'
import stylesIndexCssRaw from '@/styles/index.css?raw'
import variablesCssRaw from '@/styles/variables.css?raw'
import { accountBadgeClass, roleBadgeTone } from '@/features/admin/components/accountBadge'

// Správa a SuperAdmin bez legacy admin.css (#527): třídy, které admin.css definoval, v TSX nezůstaly
// viset bez stylu a štítky účtů stojí na tokenech.
const CSS = import.meta.glob<string>('../**/*.css', { query: '?raw', import: 'default', eager: true })
const TSX = import.meta.glob<string>(['../**/*.tsx', '../**/*.ts', '!../test/**'], { query: '?raw', import: 'default', eager: true })

/** Třídy, které definoval smazaný styles/admin.css. */
const REMOVED = [
  'main-content-admin', 'admin-page-card', 'admin-card', 'admin-kicker', 'admin-section-nav', 'admin-section-link',
  'admin-section-link-icon', 'admin-section-link-copy', 'admin-section-link-label', 'admin-section-link-meta',
  'admin-card-header', 'admin-card-eyebrow', 'admin-card-title-row', 'admin-card-title', 'admin-card-counter',
  'admin-card-description', 'admin-user-self-badge', 'admin-role-badge', 'admin-status-badge', 'admin-invite-status',
  'admin-compact-form', 'admin-form-note', 'admin-support-steps', 'admin-invite-modal-note', 'admin-section-error',
  'admin-inline-loader', 'admin-empty-state', 'admin-invite-share-preview', 'admin-details', 'admin-details-count',
]

/** Zdroj bez komentářů a bez hodnot `data-testid` a klíčů dotazů (ty třídy nejsou). */
const classSource = (code: string) => code
  .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  .replace(/data-testid=(?:"[^"]*"|\{[^}]*\})/g, '')

describe('Správa bez admin.css (#527)', () => {
  it('styles/admin.css neexistuje a nikdo ho neimportuje', () => {
    expect(Object.keys(CSS).filter((file) => file.endsWith('/admin.css'))).toEqual([])
    expect(indexCssRaw).not.toMatch(/admin\.css/)
    expect(stylesIndexCssRaw).not.toMatch(/admin\.css/)
  })

  it('žádný zdroják nepoužívá třídu, kterou definoval admin.css', () => {
    const leftovers = Object.entries(TSX).flatMap(([file, code]) => {
      const source = classSource(code)
      return REMOVED.filter((name) => new RegExp(String.raw`(?<![\w-])${name}(?![\w-])`).test(source)).map((name) => `${file}: ${name}`)
    })
    expect(leftovers).toEqual([])
  })
})

describe('Štítky role a stavu účtu (#527)', () => {
  it('stav nese barvu z --ok / --low / --empty, role je tichá na --inset, vlastní účet zvýrazněný', () => {
    expect(accountBadgeClass('ok')).toContain('bg-(--ok-bg) text-[rgb(var(--ok))]')
    expect(accountBadgeClass('low')).toContain('bg-(--low-bg) text-[rgb(var(--low))]')
    expect(accountBadgeClass('empty')).toContain('bg-(--empty-bg) text-[rgb(var(--empty))]')
    expect(accountBadgeClass('quiet')).toContain('bg-inset text-(--text-muted)')
    expect(accountBadgeClass('brand')).toContain('bg-accent text-primary')
    expect(accountBadgeClass('quiet')).toContain('text-eyebrow uppercase')
  })

  it('role Admin má inkoust, Člen a Host tichý text', () => {
    expect(roleBadgeTone('admin')).toBe('role')
    expect(roleBadgeTone('user')).toBe('quiet')
    expect(roleBadgeTone('guest')).toBe('quiet')
    expect(accountBadgeClass('role')).toContain('bg-inset text-(--text-main)')
  })
})

/** Barva tokenu z :root ve variables.css: hex, trojice „R G B“, var(), rgb(var()) nebo color-mix (jsdom kaskádu nepočítá). */
type Rgb = [number, number, number]
const ROOT = [...variablesCssRaw.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?<![\w-]):root\s*\{([^{}]*)\}/g)].map((m) => m[1]).join(';')
function token(name: string): Rgb {
  const decl = ROOT.split(';').map((d) => d.split(/:(.*)/s).map((x) => x.trim())).filter(([k]) => k === name).at(-1)
  if (!decl) throw new Error(`Token ${name} v :root chybí`)
  return color(decl[1])
}
function color(value: string): Rgb {
  const ref = /^(?:rgb\()?var\((--[\w-]+)\)\)?$/.exec(value)
  if (ref) return token(ref[1])
  const mix = /^color-mix\(in srgb,\s*(.+?)\s+(\d+)%,\s*(.+)\)$/.exec(value)
  if (mix) {
    const [a, t, b] = [color(mix[1]), Number(mix[2]) / 100, color(mix[3])]
    return a.map((c, i) => c * t + b[i] * (1 - t)) as Rgb
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as Rgb
  return value.split(/\s+/).map(Number) as Rgb
}
const luminance = (rgb: Rgb) => {
  const [r, g, b] = rgb.map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: Rgb, b: Rgb) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }

describe('Štítky účtů: kontrast textu na podbarvení (#527, dřív admin.css)', () => {
  it.each([
    ['--ok', '--ok-bg'], ['--low', '--low-bg'], ['--empty', '--empty-bg'], ['--brand-primary', '--brand-primary-light'],
    ['--text-muted', '--inset'], ['--text-main', '--inset'],
  ])('%s na %s ≥ 4,5 : 1', (text, surface) => {
    expect(contrast(token(text), token(surface))).toBeGreaterThanOrEqual(4.5)
  })
})
