import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MobileNav } from '@/components/layout/MobileNav'

let features: Record<string, boolean> | null = null
let canInstall: 'prompt' | 'ios' | null = null

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { cabinId: 'c-1' }, isAdmin: false, isSuperAdmin: false, logout: vi.fn() }),
}))
vi.mock('@/hooks/useCabinFeatures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useCabinFeatures')>()),
  useCabinFeatures: () => ({ data: { features, isWinterized: false } }),
}))

vi.mock('@/hooks/usePwaInstall', () => ({
  usePwaInstall: () => ({ isStandalone: false, canInstall }),
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
    canInstall = null
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

  it('„Víc“ zůstane, i když chata nemá zapnutý žádný doplněk (#524)', () => {
    features = { notes: false, gallery: false, diary: false, reconstruction: false }
    renderNav('/dashboard')
    expect(screen.getByRole('button', { name: /Víc/ })).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(4)
  })

  it('„Víc“ trvale nabízí „Přidat na plochu“, i když chata nemá žádný doplněk (#277)', async () => {
    const user = userEvent.setup()
    canInstall = 'ios'
    features = { notes: false, gallery: false, diary: false, reconstruction: false }
    renderNav('/dashboard')

    await user.click(screen.getByRole('button', { name: /Víc/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Víc' })
    await user.click(within(sheet).getByRole('button', { name: 'Přidat na plochu' }))
    expect(within(sheet).getByText('„Přidat na plochu“')).toBeInTheDocument()
  })

  it('v nainstalované appce „Přidat na plochu“ v „Víc“ není (#277)', async () => {
    const user = userEvent.setup()
    renderNav('/dashboard')

    await user.click(screen.getByRole('button', { name: /Víc/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Víc' })
    expect(within(sheet).queryByRole('button', { name: 'Přidat na plochu' })).not.toBeInTheDocument()
  })
})
