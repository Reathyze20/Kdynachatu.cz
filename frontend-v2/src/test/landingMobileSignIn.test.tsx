import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import landingCssRaw from '@/styles/landing.css?raw'
import { LandingPage } from '@/features/landing/LandingPage'

// #695: člen rodiny na telefonu (360–430 px) vidí „Přihlásit se“ přímo v liště landing page,
// bez otevírání menu. jsdom nepočítá media queries, proto se viditelnost hlídá přes DOM
// (tlačítko je v liště, ne v menu) a přes pravidla landing.css, která platí na mobilu.

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const MEDIA_BLOCK = /@media([^{]*)\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g

type Rule = { selectors: string[]; decls: Record<string, string> }

function parseRules(css: string): Rule[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(',').map((s) => s.trim()).filter(Boolean),
    decls: Object.fromEntries(
      m[2].split(';').map((d) => d.split(':')).filter((p) => p.length >= 2)
        .map(([prop, ...value]) => [prop.trim(), value.join(':').replace('!important', '').trim()]),
    ),
  }))
}

const css = stripComments(landingCssRaw)
/** Pravidla mimo @media, platí na všech šířkách. */
const baseRules = parseRules(css.replace(MEDIA_BLOCK, ''))
/** Pravidla z `@media (max-width: N px)`, která platí aspoň pro část šířek 360–430 px. */
const phoneRules = [...css.matchAll(MEDIA_BLOCK)]
  .filter(([, query]) => {
    const max = /max-width:\s*(\d+)px/.exec(query)
    return max !== null && Number(max[1]) >= 360 && !/min-width/.test(query)
  })
  .flatMap(([, , body]) => parseRules(body))

const matches = (el: Element, selector: string) => {
  try {
    return el.matches(selector)
  } catch {
    return false // pseudo-elementy a podobně
  }
}

/** Element nebo jeho předek v liště je na telefonu schovaný (`display: none` v mobilním pravidle nebo Tailwind `hidden`). */
function hiddenOnPhone(control: Element, bar: Element): Element | undefined {
  for (let el: Element | null = control; el; el = el === bar ? null : el.parentElement) {
    const node = el
    const tailwindHidden = [...node.classList].some((c) => /^(max-[\w-]+:)?hidden$/.test(c))
    const cssHidden = phoneRules.some((r) => r.decls.display === 'none' && r.selectors.some((s) => matches(node, s)))
    if (tailwindHidden || cssHidden) return node
  }
  return undefined
}

/** Dotyková plocha podle DESIGN.md: min. výška z tokenu `--touch-target-min/primary` (nebo ≥ 48 px) na telefonu. */
function hasTouchTarget(control: Element): boolean {
  if ([...control.classList].some((c) => /^min-h-\(--touch-target-(min|primary)\)$/.test(c))) return true
  return [...baseRules, ...phoneRules].some((r) => {
    const minHeight = r.decls['min-height']
    if (!minHeight || !r.selectors.some((s) => matches(control, s))) return false
    const px = /^(\d+)px$/.exec(minHeight)
    return /^var\(--touch-target-(min|primary)\)$/.test(minHeight) || (px !== null && Number(px[1]) >= 48)
  })
}

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<h1>Přihlášení</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

function signInInBar() {
  const bar = screen.getByTestId('landing-nav')
  const control = within(bar).getByText('Přihlásit se').closest('a, button')
  if (!control) throw new Error('„Přihlásit se“ v liště není tlačítko ani odkaz')
  return { bar, control }
}

describe('landing page: „Přihlásit se“ v mobilní liště (#695)', () => {
  it('„Přihlásit se“ je v liště a na telefonu není schované, menu zůstává zavřené', () => {
    renderLanding()
    const { bar, control } = signInInBar()

    expect(screen.getByTestId('landing-mobile-menu')).not.toHaveClass('open')
    expect(hiddenOnPhone(control, bar)).toBeUndefined()
  })

  it('tlačítko má na telefonu dotykovou plochu podle DESIGN.md', () => {
    renderLanding()
    expect(hasTouchTarget(signInInBar().control)).toBe(true)
  })

  it('klepnutí vede na přihlášení', () => {
    renderLanding()
    fireEvent.click(signInInBar().control)
    expect(screen.getByRole('heading', { name: 'Přihlášení' })).toBeInTheDocument()
  })
})
