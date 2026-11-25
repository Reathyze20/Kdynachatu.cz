/**
 * lib/navRoutes.ts — globální navigace (redesign #0, issue #171)
 * Hlavní sekce podle cyklu turnusu (Přehled · Kalendář · Předávka · Zásoby), doplňky pod „Víc“.
 * Admin a backoffice nejsou sekce chaty, žijí v profilovém menu (SidebarProfileMenu, ProfileDrawer).
 * Host (`guest`) vidí jen svůj pobyt (#484, PRODUCT.md „Role na chatě“): Přehled, Kalendář a Předávku.
 */
import type { LucideIcon } from 'lucide-react'
import { Home, CalendarDays, KeyRound, ShoppingCart, MessageCircle, Images, BookOpen, Hammer } from 'lucide-react'
import { isFeatureEnabled } from '@/hooks/useCabinFeatures'

export interface NavItem {
  /** Cíl odkazu; query část rozlišuje položky, které zatím vedou na stejnou stránku */
  to: string
  label: string
  icon: LucideIcon
  /** Položka je viditelná jen pokud cabin.features[featureKey] není vypnuté */
  featureKey?: string
  /** Sekce patří i hostovi (whitelist #484); ostatní host nevidí */
  forGuest?: true
}

/**
 * Předávka a Zásoby zatím nemají vlastní obrazovku (T3b, T6b). Do té doby vedou na dnešní ekvivalent:
 * Předávka na stránku rezervací (formulář odjezdu je v detailu pobytu), Zásoby na Nákupy (se spíží).
 * `?sekce=predavka` stránka nečte, jen odliší aktivní tab od Kalendáře.
 */
export const PRIMARY_NAV: NavItem[] = [
  { to: '/dashboard',                   label: 'Přehled',  icon: Home, forGuest: true },
  { to: '/reservations',                label: 'Kalendář', icon: CalendarDays, featureKey: 'reservations', forGuest: true },
  { to: '/reservations?sekce=predavka', label: 'Předávka', icon: KeyRound,     featureKey: 'reservations', forGuest: true },
  { to: '/shopping',                    label: 'Zásoby',   icon: ShoppingCart, featureKey: 'shopping' },
]

/** Doplňky pod „Víc“ */
export const MORE_NAV: NavItem[] = [
  { to: '/notes',          label: 'Chat',         icon: MessageCircle, featureKey: 'notes' },
  { to: '/gallery',        label: 'Galerie',      icon: Images,        featureKey: 'gallery' },
  { to: '/diary',          label: 'Deník',        icon: BookOpen,      featureKey: 'diary' },
  { to: '/reconstruction', label: 'Rekonstrukce', icon: Hammer,        featureKey: 'reconstruction' },
]

/** Položky, jejichž funkce je v chatě zapnutá; hostovi jen sekce z jeho whitelistu */
export function visibleNavItems(items: NavItem[], features: Record<string, boolean> | null | undefined, isGuest = false): NavItem[] {
  return items.filter((i) => (!i.featureKey || isFeatureEnabled(features, i.featureKey)) && (!isGuest || i.forGuest))
}

/**
 * Najde aktivní položku: cesta musí sedět (i podstránky) a všechny query parametry odkazu musí být v URL.
 * Když sedí víc položek (Kalendář i Předávka), vyhraje ta s víc parametry — aktivní je vždy nejvýš jedna.
 */
export function findActiveNavItem(
  items: NavItem[],
  location: { pathname: string; search: string },
): NavItem | undefined {
  const current = new URLSearchParams(location.search)
  let best: { item: NavItem; score: number } | undefined
  for (const item of items) {
    const [path, query = ''] = item.to.split('?')
    if (location.pathname !== path && !location.pathname.startsWith(`${path}/`)) continue
    const params = [...new URLSearchParams(query)]
    if (!params.every(([k, v]) => current.get(k) === v)) continue
    if (!best || params.length > best.score) best = { item, score: params.length }
  }
  return best?.item
}
