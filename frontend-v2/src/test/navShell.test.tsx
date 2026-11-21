import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MobileNav } from '@/components/layout/MobileNav'

let features: Record<string, boolean> | null = null

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { cabinId: 'c-1' }, isAdmin: false, isSuperAdmin: false, logout: vi.fn() }),
}))
vi.mock('@/hooks/useCabinFeatures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useCabinFeatures')>()),
  useCabinFeatures: () => ({ data: { features, isWinterized: false } }),
}))

/** Stránky chaty, které dnes žijí v AppShellu (App.tsx); admin a backoffice jsou v profilovém menu. */
const CABIN_PAGES = ['/dashboard', '/reservations', '/notes', '/shopping', '/gallery', '/diary', '/reconstruction']

function renderNav(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <MobileNav />
    </MemoryRouter>,
  )
}

const hrefOf = (el: HTMLElement) => el.getAttribute('href')?.split('?')[0]

describe('MobileNav — dolní lišta (#171)', () => {
  beforeEach(() => {
    features = null
  })

  it('je nav landmark s taby Přehled · Kalendář · Předávka · Zásoby · Víc', () => {
    renderNav('/dashboard')
    const nav = screen.getByRole('navigation', { name: 'Hlavní navigace' })
    const labels = within(nav).getAllByRole('link').map((el) => el.textContent)
    expect(labels).toEqual(['Přehled', 'Kalendář', 'Předávka', 'Zásoby'])
    expect(within(nav).getByRole('button', { name: /Víc/ })).toBeInTheDocument()
  })

  it('aktivní tab má aria-current="page", ostatní ne', () => {
    renderNav('/reservations?sekce=predavka')
    const nav = screen.getByRole('navigation', { name: 'Hlavní navigace' })
    expect(within(nav).getByRole('link', { name: 'Předávka' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Kalendář' })).not.toHaveAttribute('aria-current')
  })

  it('„Víc“ otevře další sekce a je aktivní, když jsem v jedné z nich', async () => {
    const user = userEvent.setup()
    renderNav('/gallery')
    const more = screen.getByRole('button', { name: /Víc/ })
    expect(more).toHaveClass('active')

    await user.click(more)
    const sheet = await screen.findByRole('dialog', { name: 'Víc' })
    expect(within(sheet).getAllByRole('link').map((el) => el.textContent)).toEqual([
      'Chat', 'Galerie', 'Deník', 'Rekonstrukce',
    ])
    expect(within(sheet).getByRole('link', { name: 'Galerie' })).toHaveAttribute('aria-current', 'page')
  })

  it('všechny dnešní stránky chaty jsou dosažitelné z lišty nebo z „Víc“', async () => {
    const user = userEvent.setup()
    renderNav('/dashboard')
    await user.click(screen.getByRole('button', { name: /Víc/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Víc' })
    const nav = screen.getByRole('navigation', { name: 'Hlavní navigace' })
    const reachable = [...within(nav).getAllByRole('link'), ...within(sheet).getAllByRole('link')].map(hrefOf)
    for (const page of CABIN_PAGES) expect(reachable).toContain(page)
  })

  it('„Víc“ zmizí, když chata nemá zapnutý žádný doplněk', () => {
    features = { notes: false, gallery: false, diary: false, reconstruction: false }
    renderNav('/dashboard')
    expect(screen.queryByRole('button', { name: /Víc/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(4)
  })
})
