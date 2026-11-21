/**
 * components/layout/MobileNav.tsx
 * Spodní lišta podle cyklu turnusu (redesign #0, issue #171): Přehled · Kalendář · Předávka · Zásoby · Víc.
 * Doplňky (Chat, Galerie, Deník, Rekonstrukce) jsou pod „Víc“.
 */
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { MORE_NAV, PRIMARY_NAV, findActiveNavItem, visibleNavItems, type NavItem } from '@/lib/navRoutes'
import { useCabinFeatures } from '@/hooks/useCabinFeatures'
import { useAuth } from '@/context/AuthContext'
import { Modal } from '@/components/shared/Modal'

export function MobileNav() {
  const { user } = useAuth()
  const { data: cabin } = useCabinFeatures()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  if (!user?.cabinId) return null

  const tabs = visibleNavItems(PRIMARY_NAV, cabin?.features)
  const more = visibleNavItems(MORE_NAV, cabin?.features)
  const active = findActiveNavItem([...tabs, ...more], location)
  const activeMore = active && more.includes(active) ? active : undefined
  // V sekci schované pod „Víc“ má záložka ikonu té sekce, popisek zůstává „Víc“ (úzké displeje).
  const MoreIcon = activeMore?.icon ?? MoreHorizontal

  const navLink = (item: NavItem, className: string, onClick?: () => void) => (
    <Link
      key={item.to}
      to={item.to}
      className={`${className}${item === active ? ' active' : ''}`}
      aria-current={item === active ? 'page' : undefined}
      data-testid="mobile-nav-link"
      data-route={item.to}
      onClick={onClick}
    >
      <item.icon size={20} aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  )

  return (
    <>
      <nav id="mobile-nav" className="mobile-nav" aria-label="Hlavní navigace" data-testid="mobile-nav">
        {tabs.map((item) => navLink(item, 'mobile-nav-link'))}

        {more.length > 0 ? (
          <button
            type="button"
            className={`mobile-nav-link${activeMore ? ' active' : ''}`}
            data-testid="mobile-nav-more"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-label={activeMore ? `Víc (právě: ${activeMore.label})` : 'Víc sekcí'}
            onClick={() => setMoreOpen(true)}
          >
            <MoreIcon size={20} aria-hidden="true" />
            <span>Víc</span>
          </button>
        ) : null}
      </nav>

      <Modal isOpen={moreOpen} onClose={() => setMoreOpen(false)} title="Víc">
        <div className="drawer-quicklinks" data-testid="mobile-nav-more-sheet">
          {more.map((item) => navLink(item, 'button-secondary drawer-quicklink', () => setMoreOpen(false)))}
        </div>
      </Modal>
    </>
  )
}
