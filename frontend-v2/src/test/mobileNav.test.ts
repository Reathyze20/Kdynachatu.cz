import { describe, expect, it } from 'vitest'
import { MORE_NAV, PRIMARY_NAV, findActiveNavItem, visibleNavItems } from '@/lib/navRoutes'

const at = (url: string) => {
  const [pathname, search = ''] = url.split('?')
  return { pathname, search: search ? `?${search}` : '' }
}

describe('globální navigace (#171)', () => {
  it('dolní lišta je podle cyklu turnusu: Přehled · Kalendář · Předávka · Zásoby', () => {
    expect(PRIMARY_NAV.map((i) => i.label)).toEqual(['Přehled', 'Kalendář', 'Předávka', 'Zásoby'])
  })

  it('Galerie a Rekonstrukce jsou na mobilu dosažitelné', () => {
    const reachable = [...PRIMARY_NAV, ...MORE_NAV].map((i) => i.to.split('?')[0])
    expect(reachable).toContain('/gallery')
    expect(reachable).toContain('/reconstruction')
    expect(MORE_NAV.map((i) => i.to)).toEqual(['/notes', '/gallery', '/diary', '/reconstruction'])
  })

  it('aktivní je jen jedna položka, i když Kalendář a Předávka vedou na stejnou stránku', () => {
    const all = [...PRIMARY_NAV, ...MORE_NAV]
    expect(findActiveNavItem(all, at('/reservations'))?.label).toBe('Kalendář')
    expect(findActiveNavItem(all, at('/reservations?sekce=predavka'))?.label).toBe('Předávka')
    expect(findActiveNavItem(all, at('/shopping'))?.label).toBe('Zásoby')
    expect(findActiveNavItem(all, at('/gallery'))?.label).toBe('Galerie')
    expect(findActiveNavItem(all, at('/admin'))).toBeUndefined()
  })

  it('vypnutá funkce chaty schová svou položku, ostatní zůstanou', () => {
    const visible = visibleNavItems(PRIMARY_NAV, { reservations: false })
    expect(visible.map((i) => i.label)).toEqual(['Přehled', 'Zásoby'])
    expect(visibleNavItems(MORE_NAV, null)).toHaveLength(MORE_NAV.length)
  })
})
