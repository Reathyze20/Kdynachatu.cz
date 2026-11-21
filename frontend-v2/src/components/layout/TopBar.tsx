/**
 * components/layout/TopBar.tsx
 * Překlad: div.top-bar z index.html + dropdown logika.
 * Navigace sekcí je od desktop rámu #1b (#171) v DesktopSidebar; tady zůstává profilové menu s administrací.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { showToast } from '@/lib/toast'
import { useCabinFeatures } from '@/hooks/useCabinFeatures'
import { ChevronDown, LogOut, ScrollText, Settings, Shield, User, UserPlus } from 'lucide-react'
import { AnimalAvatar } from '@/components/shared/AnimalAvatar'

interface TopBarProps {
  onOpenProfileDrawer: () => void
}

export function TopBar({ onOpenProfileDrawer }: TopBarProps) {
  const { user, isAdmin, isSuperAdmin, logout } = useAuth()
  const { data: cabin } = useCabinFeatures()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function toggleDropdown() {
    if (!dropdownOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect()
      setMenuPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
    }
    setDropdownOpen(!dropdownOpen)
  }

  // Zavřít dropdown při kliknutí mimo, scrollu nebo změně velikosti okna
  useEffect(() => {
    if (!dropdownOpen) return
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (dropdownRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setDropdownOpen(false)
    }
    const close = () => setDropdownOpen(false)
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('resize', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('resize', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [dropdownOpen])

  function handleLogout() {
    setDropdownOpen(false)
    logout()
    showToast('Odhlášení úspěšné', 'info')
  }

  const username = user?.username ?? 'Uživatel'

  return (
    <div className="top-bar" data-testid="desktop-topbar">
      <div className="user-info dropdown-container" id="nav-user-dropdown-container" ref={dropdownRef}>
        <button
          id="nav-dropdown-trigger"
          className="nav-dropdown-trigger"
          title="Otevřít profilové menu"
          aria-expanded={dropdownOpen}
          aria-haspopup="true"
          onClick={toggleDropdown}
          data-testid="profile-menu-button"
        >
          <span id="nav-animal-icon" className="nav-avatar">
            <AnimalAvatar icon={user?.animalIcon} username={username} size={32} />
          </span>
          <div id="user-greeting" className="profile-name">
            <span className="greeting">Ahoj, </span>
            <span className="username">{username}!</span>
          </div>
          <span className="nav-dropdown-arrow" aria-hidden="true">
            <ChevronDown size={16} />
          </span>
        </button>

        {dropdownOpen && menuPos && createPortal(
        <div
          id="nav-dropdown-menu"
          className="nav-dropdown-menu"
          role="menu"
          data-testid="profile-menu"
          ref={menuRef}
          style={{ top: menuPos.top, right: menuPos.right }}
        >
          {cabin?.name && (
            <>
              <div className="nav-dropdown-label" title={cabin.name}>{cabin.name}</div>
              <div className="nav-dropdown-separator"></div>
            </>
          )}
          <button
            id="profile-button"
            className="nav-dropdown-item"
            onClick={() => { setDropdownOpen(false); onOpenProfileDrawer() }}
            data-testid="profile-menu-profile-button"
          >
            <User size={16} />
            Osobní profil
          </button>

          {(isAdmin || isSuperAdmin) && (
            <>
              <div id="nav-admin-separator" className="nav-dropdown-separator"></div>
              {isSuperAdmin && (
                <Link
                  to="/superadmin"
                  className="nav-dropdown-item"
                  onClick={() => setDropdownOpen(false)}
                  data-testid="profile-menu-superadmin-link"
                >
                  <Shield size={16} />
                  Backoffice
                </Link>
              )}
              {isAdmin && (
                <>
                  <Link
                    to="/admin"
                    id="nav-admin-management"
                    className="nav-dropdown-item"
                    onClick={() => setDropdownOpen(false)}
                    data-testid="profile-menu-admin-link"
                  >
                    <Settings size={16} />
                    Administrativa
                  </Link>
                  <Link
                    to="/admin/invites"
                    id="nav-admin-invites"
                    className="nav-dropdown-item"
                    onClick={() => setDropdownOpen(false)}
                    data-testid="profile-menu-invites-link"
                  >
                    <UserPlus size={16} />
                    Pozvat člena
                  </Link>
                  <Link
                    to="/admin/diagnostics"
                    id="nav-admin-debug"
                    className="nav-dropdown-item"
                    onClick={() => setDropdownOpen(false)}
                    data-testid="profile-menu-diagnostics-link"
                  >
                    <ScrollText size={16} />
                    Diagnostika
                  </Link>
                </>
              )}
            </>
          )}

          <div className="nav-dropdown-separator"></div>
          <button id="logout-button" className="nav-dropdown-item" onClick={handleLogout} data-testid="profile-menu-logout-button">
            <LogOut size={16} />
            Odhlásit
          </button>
        </div>,
        document.body
        )}
      </div>
    </div>
  )
}
