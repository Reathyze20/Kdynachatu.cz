/**
 * components/layout/SidebarProfileMenu.tsx
 * Profilové menu dole v desktopovém sidebaru (#205, mock 01b varianta A): desktop nemá horní lištu.
 * Na sbaleném sidebaru zůstane jen avatar, jméno je v názvu tlačítka.
 * Menu jde portálem do <body>, protože sidebar kvůli povrchu ořezává obsah (overflow: hidden);
 * fokus proto řídí komponenta (vzor menu button: šipky, Home/End, Escape i Tab vrací fokus).
 */
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { showToast } from '@/lib/toast'
import { ChevronUp, LogOut, ScrollText, Settings, Shield, User, UserPlus } from 'lucide-react'
import { AnimalAvatar } from '@/components/shared/AnimalAvatar'

interface SidebarProfileMenuProps {
  onOpenProfileDrawer: () => void
}

const MENU_GAP_PX = 8

export function SidebarProfileMenu({ onOpenProfileDrawer }: SidebarProfileMenuProps) {
  const { user, isAdmin, isSuperAdmin, logout } = useAuth()
  const [menuPos, setMenuPos] = useState<{ bottom: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const isOpen = menuPos !== null

  const adminLinks = [
    ...(isSuperAdmin ? [{ to: '/superadmin', label: 'Backoffice', icon: Shield, testId: 'superadmin' }] : []),
    ...(isAdmin
      ? [
          { to: '/admin', label: 'Administrativa', icon: Settings, testId: 'admin' },
          { to: '/admin/invites', label: 'Pozvat člena', icon: UserPlus, testId: 'invites' },
          { to: '/admin/diagnostics', label: 'Diagnostika', icon: ScrollText, testId: 'diagnostics' },
        ]
      : []),
  ]

  function closeMenu(returnFocus = false) {
    setMenuPos(null)
    if (returnFocus) triggerRef.current?.focus()
  }

  function toggleMenu() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (isOpen || !rect) return closeMenu()
    // Menu roste nahoru od tlačítka u spodního okraje okna, zarovnané k jeho levé hraně
    setMenuPos({ bottom: window.innerHeight - rect.top + MENU_GAP_PX, left: rect.left })
  }

  const menuItems = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])

  // Po otevření fokus na první položku, ať jde menu ovládat z klávesnice
  useEffect(() => {
    if (isOpen) menuItems()[0]?.focus({ preventScroll: true })
  }, [isOpen])

  // Zavřít při kliknutí mimo, scrollu nebo změně velikosti okna (pozice je fixní)
  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setMenuPos(null)
    }
    const close = () => setMenuPos(null)
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('resize', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('resize', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [isOpen])

  function handleMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = menuItems()
    const current = items.indexOf(document.activeElement as HTMLElement)
    const nextIndex = { ArrowDown: current + 1, ArrowUp: current - 1, Home: 0, End: items.length - 1 }[e.key]
    if (nextIndex !== undefined) {
      e.preventDefault()
      items[(nextIndex + items.length) % items.length]?.focus()
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      closeMenu(true)
    } else if (e.key === ' ' && document.activeElement instanceof HTMLAnchorElement) {
      // Položky menu se aktivují i mezerníkem; tlačítka to umí sama, odkazy ne
      e.preventDefault()
      document.activeElement.click()
    }
  }

  function handleLogout() {
    closeMenu()
    logout()
    showToast('Odhlášení úspěšné', 'info')
  }

  const username = user?.username ?? 'Uživatel'

  return (
    <div className="app-sidebar-profile">
      <button
        ref={triggerRef}
        type="button"
        className="app-sidebar-link app-sidebar-profile-trigger"
        aria-label={`Profilové menu – ${username}`}
        title={`Profilové menu – ${username}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={toggleMenu}
        data-testid="profile-menu-button"
      >
        <span className="nav-avatar" aria-hidden="true">
          <AnimalAvatar icon={user?.animalIcon} username={username} size={32} />
        </span>
        <span className="app-sidebar-label app-sidebar-profile-name">{username}</span>
        <ChevronUp size={16} className="app-sidebar-label app-sidebar-profile-arrow" aria-hidden="true" />
      </button>

      {isOpen && createPortal(
        <div
          className="nav-dropdown-menu app-sidebar-profile-menu"
          role="menu"
          aria-label="Profilové menu"
          data-testid="profile-menu"
          ref={menuRef}
          style={{ bottom: menuPos.bottom, left: menuPos.left }}
          onKeyDown={handleMenuKeyDown}
        >
          <button
            type="button"
            role="menuitem"
            className="nav-dropdown-item"
            onClick={() => { closeMenu(); onOpenProfileDrawer() }}
            data-testid="profile-menu-profile-button"
          >
            <User size={16} aria-hidden="true" />
            Osobní profil
          </button>

          {adminLinks.length > 0 && <div role="separator" className="nav-dropdown-separator"></div>}
          {adminLinks.map(({ to, label, icon: Icon, testId }) => (
            <Link
              key={to}
              to={to}
              role="menuitem"
              className="nav-dropdown-item"
              onClick={() => closeMenu()}
              data-testid={`profile-menu-${testId}-link`}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </Link>
          ))}

          <div role="separator" className="nav-dropdown-separator"></div>
          <button
            type="button"
            role="menuitem"
            className="nav-dropdown-item"
            onClick={handleLogout}
            data-testid="profile-menu-logout-button"
          >
            <LogOut size={16} aria-hidden="true" />
            Odhlásit
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}
