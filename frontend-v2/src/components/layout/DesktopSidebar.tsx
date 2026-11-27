/**
 * components/layout/DesktopSidebar.tsx
 * Levý sidebar desktopového rámu (redesign #1b, issue #171): ikona + popisek, stejný model jako dolní lišta.
 * Na desktopu je místa dost, takže doplňky z „Víc“ jsou vidět rovnou jako skupina pod hlavními sekcemi.
 * Dole je nápověda (#205, #524): stejný dialog jako z menu Víc na mobilu, plovoucí tlačítko appka nemá.
 * Pod ní profilové menu s administrací a odhlášením (#205): desktop nemá horní lištu.
 * Pod názvem chaty je slot `today` pro dnešek chaty (datum, počasí, #338); plní ho AppShell.
 */
import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MORE_NAV, PRIMARY_NAV, findActiveNavItem, visibleNavItems, type NavItem } from '@/lib/navRoutes'
import { useCabinFeatures } from '@/hooks/useCabinFeatures'
import { useAuth } from '@/context/AuthContext'
import { CircleHelp } from 'lucide-react'
import { HelpDialog } from '@/components/shared/HelpDialog'
import { InstallMenuItem } from '@/components/shared/InstallCard'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { SidebarProfileMenu } from './SidebarProfileMenu'

interface DesktopSidebarProps {
  onOpenProfileDrawer: () => void
  /** Obsah pod názvem chaty (dnešek chaty); bez chaty se nevykreslí. */
  today?: ReactNode
}

export function DesktopSidebar({ onOpenProfileDrawer, today }: DesktopSidebarProps) {
  const { user, isGuest } = useAuth()
  const { data: cabin } = useCabinFeatures()
  const location = useLocation()
  const { canInstall } = usePwaInstall()
  const [helpOpen, setHelpOpen] = useState(false)

  const hasCabin = Boolean(user?.cabinId)
  const primary = hasCabin ? visibleNavItems(PRIMARY_NAV, cabin?.features, isGuest) : []
  const more = hasCabin ? visibleNavItems(MORE_NAV, cabin?.features, isGuest) : []
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
      title={item.fullLabel ?? item.label}
    >
      <item.icon size={20} aria-hidden="true" />
      <span className="app-sidebar-label">{item.fullLabel ?? item.label}</span>
    </Link>
  )

  return (
    <aside className="app-sidebar" data-testid="desktop-sidebar">
      <Link to={homeTo} className="app-sidebar-brand" data-testid="desktop-home-link" title={cabin?.name ?? 'Kdy na chatu'}>
        <img src="/logo-icon.svg" alt="" className="nav-logo-icon" />
        <span className="app-sidebar-label">{cabin?.name ?? 'Kdy na chatu'}</span>
      </Link>
      {hasCabin ? today : null}

      {hasCabin ? (
        <nav className="app-sidebar-nav" aria-label="Hlavní navigace" data-testid="desktop-primary-nav">
          {primary.map(renderLink)}

          {more.length > 0 || canInstall ? (
            <div role="group" aria-labelledby="app-sidebar-more" className="app-sidebar-group">
              <span id="app-sidebar-more" className="app-sidebar-heading app-sidebar-label">Víc</span>
              {more.map(renderLink)}
              <InstallMenuItem className="app-sidebar-link app-sidebar-install" labelClassName="app-sidebar-label" />
            </div>
          ) : null}
        </nav>
      ) : null}

      <div className="app-sidebar-footer">
        <button
          type="button"
          className="app-sidebar-link app-sidebar-help"
          title="Nápověda k této stránce"
          onClick={() => setHelpOpen(true)}
          data-testid="desktop-help-button"
        >
          <CircleHelp size={20} aria-hidden="true" />
          <span className="app-sidebar-label">Nápověda</span>
        </button>
        <SidebarProfileMenu onOpenProfileDrawer={onOpenProfileDrawer} />
      </div>
      <HelpDialog isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </aside>
  )
}
