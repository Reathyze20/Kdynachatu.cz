import { describe, expect, it } from 'vitest'
import { MOBILE_NAV_ROUTES, splitMobileNav } from '@/lib/navRoutes'

describe('splitMobileNav', () => {
  it('do 5 sekcí ukáže všechny jako záložky a „Více“ nepotřebuje', () => {
    expect(splitMobileNav([1, 2, 3, 4, 5])).toEqual({ tabs: [1, 2, 3, 4, 5], overflow: [] })
  })

  it('nad 5 sekcí nechá 4 záložky a zbytek dá pod „Více“', () => {
    expect(splitMobileNav([1, 2, 3, 4, 5, 6, 7])).toEqual({ tabs: [1, 2, 3, 4], overflow: [5, 6, 7] })
  })

  it('Galerie a Rekonstrukce jsou na mobilu dosažitelné', () => {
    const { tabs, overflow } = splitMobileNav(MOBILE_NAV_ROUTES.map((r) => r.path))
    const reachable = [...tabs, ...overflow]
    expect(reachable).toContain('/gallery')
    expect(reachable).toContain('/reconstruction')
    expect(tabs).toEqual(['/dashboard', '/reservations', '/notes', '/shopping'])
  })
})
