import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { DesktopSidebar } from '@/components/layout/DesktopSidebar'

let features: Record<string, boolean> | null = null
let auth: { user: { cabinId: string | null; username: string }; isAdmin: boolean; isSuperAdmin?: boolean } = {
  user: { cabinId: 'c-1', username: 'Eva' },
  isAdmin: false,
}
const logout = vi.fn()

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ isSuperAdmin: false, ...auth, logout }),
}))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/hooks/useCabinFeatures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useCabinFeatures')>()),
  useCabinFeatures: () => ({ data: { name: 'Pod Lípou', features, isWinterized: false } }),
}))

/** Stránky chaty, které dnes žijí v AppShellu (App.tsx); admin a backoffice jsou v profilovém menu. */
const CABIN_PAGES = ['/dashboard', '/reservations', '/notes', '/shopping', '/gallery', '/diary', '/reconstruction']

function renderSidebar(url: string, onOpenProfileDrawer = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <DesktopSidebar onOpenProfileDrawer={onOpenProfileDrawer} />
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
      'Přehled', 'Kalendář', 'Předávka chaty', 'Zásoby', 'Chat', 'Galerie', 'Deník', 'Rekonstrukce',
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

  it('nápověda je na desktopu dole v sidebaru, ne jako plovoucí tlačítko přes obsah (#205)', async () => {
    const user = userEvent.setup()
    renderSidebar('/reservations')
    const sidebar = screen.getByTestId('desktop-sidebar')
    expect(within(sidebar).queryByRole('button', { name: 'Potřebuješ poradit?' })).not.toBeInTheDocument()

    await user.click(within(sidebar).getByRole('button', { name: 'Nápověda' }))
    expect(await screen.findByRole('dialog', { name: 'Nápověda k této stránce' })).toBeInTheDocument()
    expect(screen.getByText(/Kdo kdy jede na chatu/)).toBeInTheDocument() // nápověda Kalendáře (#510)
  })
})

describe('Profilové menu v sidebaru — desktop bez horní lišty (#205)', () => {
  beforeEach(() => {
    features = null
    auth = { user: { cabinId: 'c-1', username: 'Eva' }, isAdmin: true }
    logout.mockClear()
  })

  const openMenuButton = () => within(screen.getByTestId('desktop-sidebar')).getByRole('button', { name: /Profilové menu.*Eva/ })

  it('je v sidebaru mimo hlavní navigaci a nese administraci i odhlášení', async () => {
    const user = userEvent.setup()
    const nav = renderSidebar('/dashboard')!
    expect(within(nav).queryByRole('button', { name: /Profilové menu/ })).not.toBeInTheDocument()

    await user.click(openMenuButton())
    const menu = screen.getByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      'Osobní profil', 'Správa', 'Pozvat člena', 'Diagnostika', 'Odhlásit',
    ])
    expect(within(menu).getByRole('menuitem', { name: 'Správa' })).toHaveAttribute('href', '/admin')
  })

  it('člen bez admin role vidí jen profil a odhlášení', async () => {
    auth = { user: { cabinId: 'c-1', username: 'Eva' }, isAdmin: false }
    const user = userEvent.setup()
    renderSidebar('/dashboard')
    await user.click(openMenuButton())
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      'Osobní profil', 'Odhlásit',
    ])
  })

  it('správce platformy má v menu i Backoffice', async () => {
    auth = { user: { cabinId: null, username: 'Eva' }, isAdmin: false, isSuperAdmin: true }
    const user = userEvent.setup()
    renderSidebar('/superadmin')
    await user.click(openMenuButton())
    expect(screen.getByRole('menuitem', { name: 'Backoffice' })).toHaveAttribute('href', '/superadmin')
  })

  it('mezerník aktivuje i položky, které jsou odkazy', async () => {
    const user = userEvent.setup()
    renderSidebar('/dashboard')
    openMenuButton().focus()
    await user.keyboard('{Enter}{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Správa' })).toHaveFocus()
    await user.keyboard(' ')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('„Osobní profil“ otevře profilový panel a „Odhlásit“ odhlásí', async () => {
    const user = userEvent.setup()
    const onOpenProfileDrawer = vi.fn()
    renderSidebar('/dashboard', onOpenProfileDrawer)

    await user.click(openMenuButton())
    await user.click(screen.getByRole('menuitem', { name: 'Osobní profil' }))
    expect(onOpenProfileDrawer).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await user.click(openMenuButton())
    await user.click(screen.getByRole('menuitem', { name: 'Odhlásit' }))
    expect(logout).toHaveBeenCalledOnce()
  })

  it('jde ovládat z klávesnice: Enter otevře, šipky přechází, Escape zavře a vrátí fokus', async () => {
    const user = userEvent.setup()
    renderSidebar('/dashboard')
    const trigger = openMenuButton()
    trigger.focus()

    await user.keyboard('{Enter}')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem')
    expect(items[0]).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(items[1]).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(items[items.length - 1]).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('Tab z menu ho zavře a vrátí fokus na tlačítko', async () => {
    const user = userEvent.setup()
    renderSidebar('/dashboard')
    const trigger = openMenuButton()
    trigger.focus()
    await user.keyboard('{Enter}')
    await user.tab()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('je dostupné i bez chaty (backoffice bez přiřazené chaty)', () => {
    auth = { user: { cabinId: null, username: 'Eva' }, isAdmin: false }
    renderSidebar('/superadmin')
    expect(openMenuButton()).toBeInTheDocument()
  })
})
