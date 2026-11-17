/**
 * lib/navRoutes.ts — Překlad routes[] z lib/router.ts
 * Definuje navigační položky pro TopBar a MobileNav.
 */
import type { LucideIcon } from 'lucide-react'
import { Home, CalendarDays, MessageCircle, ShoppingCart, Images, BookOpen, Hammer, Settings, Shield } from 'lucide-react'

export interface NavRoute {
  path: string
  label: string
  /** Lucide icon component */
  icon: LucideIcon
  /** Pokud je nastaveno, položka je viditelná jen pokud cabin.features[featureKey] === true */
  featureKey?: string
  /** Pokud true, viditelná jen pro role=admin */
  adminOnly?: boolean
  /** Pokud true, viditelná jen pro Super Admina */
  superAdminOnly?: boolean
  /** Zobrazovat i v mobile bottom nav (nad 5 položek se zbytek schová pod „Více“) */
  mobileNav?: boolean
}

export const NAV_ROUTES: NavRoute[] = [
  { path: '/dashboard',      label: 'Přehled',         icon: Home,               mobileNav: true },
  { path: '/reservations',   label: 'Rezervace',       icon: CalendarDays,        featureKey: 'reservations', mobileNav: true },
  { path: '/notes',          label: 'Chat',            icon: MessageCircle,       featureKey: 'notes',        mobileNav: true },
  { path: '/shopping',       label: 'Nákupy',          icon: ShoppingCart,        featureKey: 'shopping',     mobileNav: true },
  { path: '/gallery',        label: 'Galerie',         icon: Images,             featureKey: 'gallery',      mobileNav: true },
  { path: '/diary',          label: 'Deník',           icon: BookOpen,           featureKey: 'diary',        mobileNav: true },
  { path: '/reconstruction', label: 'Rekonstrukce',    icon: Hammer,             featureKey: 'reconstruction', mobileNav: true },
  { path: '/admin',          label: 'Administrativa',  icon: Settings,           adminOnly: true },
  { path: '/superadmin',     label: 'Backoffice',      icon: Shield,             superAdminOnly: true },
]

/** Jen routy pro mobile bottom nav */
export const MOBILE_NAV_ROUTES = NAV_ROUTES.filter((r) => r.mobileNav)

/** Víc než 5 záložek se na úzký telefon nevejde čitelně */
export const MOBILE_NAV_MAX_TABS = 5

/**
 * Rozdělí viditelné mobilní routy na záložky ve spodní liště a položky pod „Více“.
 * Když se vše vejde, „Více“ se nezobrazí (overflow je prázdný).
 */
export function splitMobileNav<T>(routes: T[], maxTabs = MOBILE_NAV_MAX_TABS): { tabs: T[]; overflow: T[] } {
  if (routes.length <= maxTabs) return { tabs: routes, overflow: [] }
  // Jedno místo zabere samotné tlačítko „Více“
  return { tabs: routes.slice(0, maxTabs - 1), overflow: routes.slice(maxTabs - 1) }
}
