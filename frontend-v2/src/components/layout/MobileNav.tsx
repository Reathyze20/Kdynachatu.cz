/**
 * components/layout/MobileNav.tsx
 * Spodní lišta podle cyklu turnusu (redesign #0, issue #171): Přehled · Kalendář · Předávka · Zásoby · Víc.
 * Doplňky (Chat, Galerie, Deník, Rekonstrukce) a „Přidat na plochu“ (#277) jsou pod „Víc“, pod oddělovačem
 * Můj profil, Správa (jen správce), Nápověda a Odhlásit (#524). Víc je vidět vždy, i hostovi a chatě bez doplňků:
 * nápověda na mobilu jinde není.
 * Po horní hraně lišty jednou za otevření appky přejde maskot ze scény chaty (#566).
 */
import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CircleHelp, LogOut, MoreHorizontal, UserRound } from 'lucide-react'
import { ADMIN_NAV, MORE_NAV, PRIMARY_NAV, findActiveNavItem, visibleNavItems, type NavItem } from '@/lib/navRoutes'
import { useCabinFeatures } from '@/hooks/useCabinFeatures'
import { useAuth } from '@/context/AuthContext'
import { useLogout } from '@/hooks/useLogout'
import { Modal } from '@/components/shared/Modal'
import { HelpDialog } from '@/components/shared/HelpDialog'
import { listRowLinkClass } from '@/components/shared/ListRow'
import { InstallMenuItem } from '@/components/shared/InstallCard'
import { LogoutPendingChangesDialog } from './LogoutPendingChangesDialog'
import { usePwaInstall } from '@/hooks/usePwaInstall'

interface MobileNavProps {
  /** Otevře šuplík profilu (drží ho AppShell). Bez něj Víc položku „Můj profil“ nenabízí. */
  onOpenProfileDrawer?: () => void
  /** Maskot na horní hraně lišty (#566). Dodá ho AppShell, protože čte nastavení Scény chaty ze serveru (#687). */
  mascot?: ReactNode
}

export function MobileNav({ onOpenProfileDrawer, mascot }: MobileNavProps) {
  const { user, isGuest, isAdmin } = useAuth()
  const { data: cabin } = useCabinFeatures()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const { canInstall } = usePwaInstall()
  const closeMore = () => setMoreOpen(false)
  // Menu se zavře až při odhlášení, jinak by s ním zmizel i dotaz na neodeslané změny (#537)
  const { requestLogout, pendingDialog } = useLogout(closeMore)

  if (!user?.cabinId) return null

  const tabs = visibleNavItems(PRIMARY_NAV, cabin?.features, isGuest)
  const more = visibleNavItems(MORE_NAV, cabin?.features, isGuest)
  const underMore = isAdmin ? [...more, ADMIN_NAV] : more
  const active = findActiveNavItem([...tabs, ...underMore], location)
  const activeMore = active && underMore.includes(active) ? active : undefined
  // V sekci schované pod „Víc“ má záložka ikonu té sekce, popisek zůstává „Víc“ (úzké displeje).
  const MoreIcon = activeMore?.icon ?? MoreHorizontal
  // Oddělovač jen pod něčím: hostovi a chatě bez doplňků (a bez instalace) by visel nad prvním řádkem
  const hasRowsAboveDivider = more.length > 0 || Boolean(canInstall)

  const renderNavLink = (item: NavItem, className: string, onClick?: () => void) => (
    <Link
      key={item.to}
      to={item.to}
      className={`${className}${item === active ? ' active' : ''}`}
      aria-current={item === active ? 'page' : undefined}
      aria-label={item.fullLabel}
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
        {tabs.map((item) => renderNavLink(item, 'mobile-nav-link'))}

        <button
          type="button"
          className={`mobile-nav-link${activeMore ? ' active' : ''}`}
          data-testid="mobile-nav-more"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-label={activeMore ? `Víc (právě: ${activeMore.label})` : undefined}
          onClick={() => setMoreOpen(true)}
        >
          <MoreIcon size={20} aria-hidden="true" />
          <span>Víc</span>
        </button>

        {mascot}
      </nav>

      <Modal isOpen={moreOpen} onClose={closeMore} title="Víc">
        <div className="-mx-4 flex flex-col" data-testid="mobile-nav-more-sheet">
          {more.map((item) => renderNavLink(item, listRowLinkClass, closeMore))}
          <InstallMenuItem className={listRowLinkClass} />

          {hasRowsAboveDivider ? <hr className="mx-4 my-2 border-rule-soft" /> : null}

          {onOpenProfileDrawer ? (
            <button type="button" className={listRowLinkClass} onClick={() => { closeMore(); onOpenProfileDrawer() }}>
              <UserRound size={20} aria-hidden="true" />
              <span>Můj profil</span>
            </button>
          ) : null}
          {isAdmin ? renderNavLink(ADMIN_NAV, listRowLinkClass, closeMore) : null}
          <button type="button" className={listRowLinkClass} onClick={() => { closeMore(); setHelpOpen(true) }}>
            <CircleHelp size={20} aria-hidden="true" />
            <span>Nápověda</span>
          </button>
          <button type="button" className={listRowLinkClass} onClick={requestLogout}>
            <LogOut size={20} aria-hidden="true" />
            <span>Odhlásit</span>
          </button>
        </div>
      </Modal>

      <HelpDialog isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
      <LogoutPendingChangesDialog {...pendingDialog} />
    </>
  )
}
