import { describe, expect, it } from 'vitest'
import { regionEventsUrl } from '@/lib/regionEvents'
import dashboardCssRaw from '@/styles/dashboard.css?raw'

/**
 * Odkaz „Akce v kraji“ na kalendář Kudy z nudy (#283). Kraj je název z číselníku RÚIAN (#279),
 * slugy jsou ručně ověřené na https://www.kudyznudy.cz/kalendar-akci/<slug> (2026-11-23).
 */
describe('regionEventsUrl: kraj z RÚIAN → kalendář akcí Kudy z nudy (#283)', () => {
  it.each([
    ['Hlavní město Praha', 'hlavni-mesto-praha'],
    ['Středočeský kraj', 'stredocesky-kraj'],
    ['Jihočeský kraj', 'jihocesky-kraj'],
    ['Plzeňský kraj', 'plzensky-kraj'],
    ['Karlovarský kraj', 'karlovarsky-kraj'],
    ['Ústecký kraj', 'ustecky-kraj'],
    ['Liberecký kraj', 'liberecky-kraj'],
    ['Královéhradecký kraj', 'kralovehradecky-kraj'],
    ['Pardubický kraj', 'pardubicky-kraj'],
    ['Kraj Vysočina', 'kraj-vysocina'],
    ['Jihomoravský kraj', 'jihomoravsky-kraj'],
    ['Olomoucký kraj', 'olomoucky-kraj'],
    ['Zlínský kraj', 'zlinsky-kraj'],
    ['Moravskoslezský kraj', 'moravskoslezsky-kraj'],
  ])('%s → %s', (region, slug) => {
    expect(regionEventsUrl(region)).toBe(`https://www.kudyznudy.cz/kalendar-akci/${slug}`)
  })

  it('bez kraje nebo s neznámým krajem odkaz není', () => {
    expect(regionEventsUrl(null)).toBeNull()
    expect(regionEventsUrl(undefined)).toBeNull()
    expect(regionEventsUrl('')).toBeNull()
    expect(regionEventsUrl('Bavorsko')).toBeNull()
  })
})

describe('odkaz „Akce v kraji“: dotyková plocha 48 px a text 16 px (B2, G3)', () => {
  const rule = /\.cabin-hero__events\s*\{([^}]*)\}/.exec(dashboardCssRaw)?.[1] ?? ''

  it('má výšku z tokenu dotykového cíle', () => {
    expect(rule).toMatch(/min-height\s*:\s*var\(--touch-target-min\)/)
  })

  it('má běžnou velikost písma z tokenu', () => {
    expect(rule).toMatch(/font-size\s*:\s*var\(--font-size-base\)/)
  })
})
