import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MobileNav } from '@/components/layout/MobileNav'
import { MORE_NAV, PRIMARY_NAV, visibleNavItems } from '@/lib/navRoutes'

// Host vidí jen svůj pobyt (#484, PRODUCT.md „Role na chatě“): Přehled, Kalendář a Předávku.
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { cabinId: 'c-1', role: 'guest' }, isGuest: true, isAdmin: false, isSuperAdmin: false }),
}))
vi.mock('@/hooks/useCabinFeatures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useCabinFeatures')>()),
  useCabinFeatures: () => ({ data: { features: null, isWinterized: false } }),
}))
vi.mock('@/hooks/usePwaInstall', () => ({ usePwaInstall: () => ({ isStandalone: false, canInstall: null }) }))

describe('navigace hosta (#484)', () => {
  it('dolní lišta hostovi ukáže jen Přehled, Kalendář a Předávku, bez „Víc“', () => {
    render(<MemoryRouter initialEntries={['/dashboard']}><MobileNav /></MemoryRouter>)
    const nav = screen.getByRole('navigation', { name: 'Hlavní navigace' })
    expect(within(nav).getAllByRole('link').map((el) => el.textContent)).toEqual(['Přehled', 'Kalendář', 'Předávka'])
    expect(within(nav).queryByRole('button', { name: /Víc/ })).not.toBeInTheDocument()
  })

  it('zakázané sekce (Zásoby, Chat, Galerie, Deník, Rekonstrukce) host nevidí v žádném seznamu', () => {
    const visible = [...visibleNavItems(PRIMARY_NAV, null, true), ...visibleNavItems(MORE_NAV, null, true)].map((i) => i.to)
    for (const forbidden of ['/shopping', '/notes', '/gallery', '/diary', '/reconstruction']) expect(visible).not.toContain(forbidden)
    expect(visibleNavItems(MORE_NAV, null)).toHaveLength(MORE_NAV.length) // člen beze změny
  })
})
