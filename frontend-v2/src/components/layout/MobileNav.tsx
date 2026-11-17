/**
 * components/layout/MobileNav.tsx
 * Překlad: nav#mobile-nav z index.html + buildMobileNav() z router.ts
 * Spodní lišta s max. 5 záložkami; sekce navíc (Galerie, Deník, Rekonstrukce…)
 * jsou pod záložkou „Více“, aby byly na mobilu vůbec dosažitelné.
 */
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutGrid } from 'lucide-react'
import { MOBILE_NAV_ROUTES, splitMobileNav } from '@/lib/navRoutes'
import { useCabinFeatures, isFeatureEnabled } from '@/hooks/useCabinFeatures'
import { useAuth } from '@/context/AuthContext'
import { Modal } from '@/components/shared/Modal'

export function MobileNav() {
  const { user } = useAuth()
  const { data: cabin } = useCabinFeatures()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  if (!user?.cabinId) return null

  const visibleRoutes = MOBILE_NAV_ROUTES.filter((r) => {
    if (r.featureKey) return isFeatureEnabled(cabin?.features, r.featureKey)
    return true
  })
  const { tabs, overflow } = splitMobileNav(visibleRoutes)
  // V sekci schované pod „Více“ je záložka zvýrazněná a má ikonu té sekce.
  // Popisek zůstává „Více“ — „Rekonstrukce“ se na 360px šířku nevejde.
  const activeOverflow = overflow.find((r) => location.pathname.startsWith(r.path))
  const MoreIcon = activeOverflow?.icon ?? LayoutGrid

  return (
    <>
      <nav id="mobile-nav" className="mobile-nav" data-testid="mobile-nav">
        {tabs.map((route) => (
          <NavLink
            key={route.path}
            to={route.path}
            className={({ isActive }) => `mobile-nav-link${isActive ? ' active' : ''}`}
            data-testid="mobile-nav-link"
            data-route={route.path}
          >
            <route.icon size={20} />
            <span>{route.label}</span>
          </NavLink>
        ))}

        {overflow.length > 0 ? (
          <button
            type="button"
            className={`mobile-nav-link${activeOverflow ? ' active' : ''}`}
            data-testid="mobile-nav-more"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-label={activeOverflow ? `Více (právě: ${activeOverflow.label})` : 'Více sekcí'}
            onClick={() => setMoreOpen(true)}
          >
            <MoreIcon size={20} />
            <span>Více</span>
          </button>
        ) : null}
      </nav>

      <Modal isOpen={moreOpen} onClose={() => setMoreOpen(false)} title="Další sekce">
        <div className="drawer-quicklinks" data-testid="mobile-nav-more-sheet">
          {overflow.map((route) => (
            <NavLink
              key={route.path}
              to={route.path}
              className="button-secondary drawer-quicklink"
              data-testid="mobile-nav-link"
              data-route={route.path}
              onClick={() => setMoreOpen(false)}
            >
              <route.icon size={18} />
              <span>{route.label}</span>
            </NavLink>
          ))}
        </div>
      </Modal>
    </>
  )
}
