import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { DesktopSidebar } from '@/components/layout/DesktopSidebar'
import { TopBar } from '@/components/layout/TopBar'

let features: Record<string, boolean> | null = null
let auth = { user: { cabinId: 'c-1' as string | null, username: 'Eva' }, isAdmin: false }

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ ...auth, isSuperAdmin: false, logout: vi.fn() }),
}))
vi.mock('@/hooks/useCabinFeatures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useCabinFeatures')>()),
  useCabinFeatures: () => ({ data: { name: 'Pod Lípou', features, isWinterized: false } }),
}))

/** Stránky chaty, které dnes žijí v AppShellu (App.tsx); admin a backoffice jsou v profilovém menu. */
const CABIN_PAGES = ['/dashboard', '/reservations', '/notes', '/shopping', '/gallery', '/diary', '/reconstruction']

function renderSidebar(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <DesktopSidebar />
    </MemoryRouter>,
  )
  return screen.queryByRole('navigation', { name: 'Hlavní navigace' })
}

describe('DesktopSidebar — desktop rám #1b (#171)', () => {
  beforeEach(() => {
    features = null
    auth = { user: { cabinId: 'c-1', username: 'Eva' }, isAdmin: false }
  })

  it('má hlavní sekce a doplňky ve skupině „Víc“, s ikonou a popiskem; dosáhne na všechny stránky chaty', () => {
    const nav = renderSidebar('/dashboard')!
    const links = within(nav).getAllByRole('link')
    expect(links.map((el) => el.textContent)).toEqual([
      'Přehled', 'Kalendář', 'Předávka', 'Zásoby', 'Chat', 'Galerie', 'Deník', 'Rekonstrukce',
    ])
    for (const link of links) expect(link.querySelector('svg')).not.toBeNull()
    const hrefs = links.map((el) => el.getAttribute('href')?.split('?')[0])
    for (const page of CABIN_PAGES) expect(hrefs).toContain(page)

    const more = within(nav).getByRole('group', { name: 'Víc' })
    expect(within(more).getAllByRole('link').map((el) => el.textContent)).toEqual([
      'Chat', 'Galerie', 'Deník', 'Rekonstrukce',
    ])
  })

  it('ukazuje název chaty s odkazem na Přehled', () => {
    renderSidebar('/notes')
    expect(screen.getByRole('link', { name: /Pod Lípou/ })).toHaveAttribute('href', '/dashboard')
  })

  it('aktivní je jen jedna položka (Kalendář vs. Předávka na stejné stránce)', () => {
    const nav = renderSidebar('/reservations')!
    expect(within(nav).getByRole('link', { name: 'Kalendář' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getAllByRole('link').filter((el) => el.hasAttribute('aria-current'))).toHaveLength(1)
  })

  it('skupina „Víc“ zmizí, když chata nemá zapnutý žádný doplněk', () => {
    features = { notes: false, gallery: false, diary: false, reconstruction: false }
    const nav = renderSidebar('/dashboard')!
    expect(within(nav).queryByRole('group', { name: 'Víc' })).not.toBeInTheDocument()
    expect(within(nav).getAllByRole('link')).toHaveLength(4)
  })

  it('bez chaty nemá sekce chaty', () => {
    auth = { user: { cabinId: null, username: 'Eva' }, isAdmin: false }
    expect(renderSidebar('/dashboard')).toBeNull()
  })
})

describe('TopBar — po příchodu sidebaru jen profilové menu (#171)', () => {
  it('nemá vlastní navigaci sekcí, administrace zůstává v profilovém menu', async () => {
    features = null
    auth = { user: { cabinId: 'c-1', username: 'Eva' }, isAdmin: true }
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <TopBar onOpenProfileDrawer={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('profile-menu-button'))
    expect(within(screen.getByRole('menu')).getByRole('link', { name: 'Administrativa' })).toHaveAttribute('href', '/admin')
  })
})
