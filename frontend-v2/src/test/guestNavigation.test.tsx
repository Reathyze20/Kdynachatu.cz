import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MobileNav } from '@/components/layout/MobileNav'
import { MORE_NAV, PRIMARY_NAV, isGuestAllowedPath, visibleNavItems } from '@/lib/navRoutes'

// Host vidí jen svůj pobyt (#484, PRODUCT.md „Role na chatě“): Přehled a Kalendář (Předávka ne, #216).
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { cabinId: 'c-1', role: 'guest' }, isGuest: true, isAdmin: false, isSuperAdmin: false }),
}))
vi.mock('@/hooks/useCabinFeatures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useCabinFeatures')>()),
  useCabinFeatures: () => ({ data: { features: null, isWinterized: false } }),
}))
vi.mock('@/hooks/usePwaInstall', () => ({ usePwaInstall: () => ({ isStandalone: false, canInstall: null }) }))

describe('navigace hosta (#484)', () => {
  it('dolní lišta hostovi ukáže jen Přehled a Kalendář, a k tomu „Víc“ (#524, Předávka #216)', () => {
    render(<MemoryRouter initialEntries={['/dashboard']}><MobileNav /></MemoryRouter>)
    const nav = screen.getByRole('navigation', { name: 'Hlavní navigace' })
    expect(within(nav).getAllByRole('link').map((el) => el.textContent)).toEqual(['Přehled', 'Kalendář'])
    expect(within(nav).getByRole('button', { name: /Víc/ })).toBeInTheDocument()
  })

  it('ve „Víc“ má host jen Můj profil, Nápovědu a Odhlásit: bez sekcí, správy a osiřelého oddělovače (#524)', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/dashboard']}><MobileNav onOpenProfileDrawer={vi.fn()} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: /Víc/ }))
    await screen.findByRole('dialog', { name: 'Víc' })
    const rows = screen.getByTestId('mobile-nav-more-sheet')

    expect(within(rows).getAllByRole('button').map((el) => el.textContent)).toEqual(['Můj profil', 'Nápověda', 'Odhlásit'])
    expect(within(rows).queryAllByRole('link')).toHaveLength(0)
    expect(within(rows).queryByRole('separator')).not.toBeInTheDocument()
  })

  it('zakázané sekce (Zásoby, Chat, Galerie, Deník, Rekonstrukce) host nevidí v žádném seznamu', () => {
    const visible = [...visibleNavItems(PRIMARY_NAV, null, true), ...visibleNavItems(MORE_NAV, null, true)].map((i) => i.to)
    for (const forbidden of ['/shopping', '/notes', '/gallery', '/diary', '/reconstruction']) expect(visible).not.toContain(forbidden)
    expect(visibleNavItems(MORE_NAV, null)).toHaveLength(MORE_NAV.length) // člen beze změny
  })

  it('na přímou adresu zakázané sekce host nesmí, smí jen Přehled a Kalendář, ne Předávku (#216)', () => {
    expect(['/dashboard', '/reservations'].every(isGuestAllowedPath)).toBe(true)
    for (const path of ['/handover', '/notes', '/shopping', '/gallery', '/diary', '/reconstruction', '/admin']) expect(isGuestAllowedPath(path)).toBe(false)
  })
})
