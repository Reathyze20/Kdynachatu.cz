/**
 * components/layout/DesktopSidebar.tsx
 * Levý sidebar desktopového rámu (redesign #1b, issue #171): ikona + popisek, stejný model jako dolní lišta.
 * Na desktopu je místa dost, takže doplňky z „Víc“ jsou vidět rovnou jako skupina pod hlavními sekcemi.
 * Dole je nápověda (#205): na desktopu nahrazuje plovoucí tlačítko, které překrývalo obsah.
 */
import { Link, useLocation } from 'react-router-dom'
import { MORE_NAV, PRIMARY_NAV, findActiveNavItem, visibleNavItems, type NavItem } from '@/lib/navRoutes'
import { useCabinFeatures } from '@/hooks/useCabinFeatures'
import { useAuth } from '@/context/AuthContext'
import { HelpFab } from '@/components/shared/HelpFab'

export function DesktopSidebar() {
  const { user } = useAuth()
  const { data: cabin } = useCabinFeatures()
  const location = useLocation()

  const hasCabin = Boolean(user?.cabinId)
  const primary = hasCabin ? visibleNavItems(PRIMARY_NAV, cabin?.features) : []
  const more = hasCabin ? visibleNavItems(MORE_NAV, cabin?.features) : []
  const active = findActiveNavItem([...primary, ...more], location)
  const homeTo = user?.isSuperAdmin && !hasCabin ? '/superadmin' : '/dashboard'

  const renderLink = (item: NavItem) => (
    <Link
      key={item.to}
      to={item.to}
      className={`app-sidebar-link${item === active ? ' active' : ''}`}
      aria-current={item === active ? 'page' : undefined}
      data-testid="desktop-nav-link"
      data-route={item.to}
      title={item.label}
    >
      <item.icon size={20} aria-hidden="true" />
      <span className="app-sidebar-label">{item.label}</span>
    </Link>
  )

  return (
    <aside className="app-sidebar" data-testid="desktop-sidebar">
      <Link to={homeTo} className="app-sidebar-brand" data-testid="desktop-home-link">
        <img src="/logo-icon.svg" alt="" className="nav-logo-icon" />
        <span className="app-sidebar-label">{cabin?.name ?? 'Kdy na chatu'}</span>
      </Link>

      {hasCabin ? (
        <nav className="app-sidebar-nav" aria-label="Hlavní navigace" data-testid="desktop-primary-nav">
          {primary.map(renderLink)}

          {more.length > 0 ? (
            <div role="group" aria-labelledby="app-sidebar-more" className="app-sidebar-group">
              <span id="app-sidebar-more" className="app-sidebar-heading app-sidebar-label">Víc</span>
              {more.map(renderLink)}
            </div>
          ) : null}
        </nav>
      ) : null}

      <div className="app-sidebar-footer">
        <HelpFab variant="sidebar" />
      </div>
    </aside>
  )
}
