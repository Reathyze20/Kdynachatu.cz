/**
 * lib/navRoutes.ts — globální navigace (redesign #0, issue #171)
 * Hlavní sekce podle cyklu turnusu (Přehled · Kalendář · Předávka · Zásoby), doplňky pod „Víc“.
 * Admin a backoffice nejsou sekce chaty, žijí v profilovém menu (SidebarProfileMenu, ProfileDrawer);
 * na mobilu je správa navíc v menu Víc (#524).
 * Host (`guest`) vidí jen svůj pobyt (#484, PRODUCT.md „Role na chatě“): Přehled, Kalendář a Předávku.
 */
import type { LucideIcon } from 'lucide-react'
import { Home, CalendarDays, KeyRound, ShoppingCart, MessageCircle, Images, BookOpen, Hammer, Settings } from 'lucide-react'
import { isFeatureEnabled } from '@/hooks/useCabinFeatures'

export interface NavItem {
  /** Cíl odkazu; query část rozlišuje položky, které zatím vedou na stejnou stránku */
  to: string
  /** Popisek; ve spodní liště musí být čitelný i na 360 px */
  label: string
  /** Celý název, když je `label` kvůli liště zkrácený (#688). Boční panel ho ukáže, lišta ho dá do `aria-label`. */
  fullLabel?: string
  icon: LucideIcon
  /** Položka je viditelná jen pokud cabin.features[featureKey] není vypnuté */
  featureKey?: string
  /** Sekce patří i hostovi (whitelist #484); ostatní host nevidí */
  forGuest?: true
}

/** Zásoby zatím nemají vlastní obrazovku (T6b), do té doby vedou na Nákupy (se spíží). */
export const PRIMARY_NAV: NavItem[] = [
  { to: '/dashboard',                   label: 'Přehled',  icon: Home, forGuest: true },
  { to: '/reservations',                label: 'Kalendář', icon: CalendarDays, featureKey: 'reservations', forGuest: true },
  { to: '/handover',                    label: 'Předávka', fullLabel: 'Předávka chaty', icon: KeyRound, featureKey: 'reservations', forGuest: true },
  { to: '/shopping',                    label: 'Zásoby',   icon: ShoppingCart, featureKey: 'shopping' },
]

/** Doplňky pod „Víc“ */
export const MORE_NAV: NavItem[] = [
  { to: '/notes',          label: 'Chat',         icon: MessageCircle, featureKey: 'notes' },
  { to: '/gallery',        label: 'Galerie',      icon: Images,        featureKey: 'gallery' },
  { to: '/diary',          label: 'Deník',        icon: BookOpen,      featureKey: 'diary' },
  { to: '/reconstruction', label: 'Rekonstrukce', icon: Hammer,        featureKey: 'reconstruction' },
]

/** Správa: jen pro správce, na mobilu pod „Víc“, na desktopu v profilovém menu, všude stejný název (#524) */
export const ADMIN_NAV: NavItem = { to: '/admin', label: 'Správa', icon: Settings }

/** Položky, jejichž funkce je v chatě zapnutá; hostovi jen sekce z jeho whitelistu */
export function visibleNavItems(items: NavItem[], features: Record<string, boolean> | null | undefined, isGuest = false): NavItem[] {
  return items.filter((i) => (!i.featureKey || isFeatureEnabled(features, i.featureKey)) && (!isGuest || i.forGuest))
}

/** Stránka patří do whitelistu hosta (#484); ostatní stránky chaty host neotevře */
export function isGuestAllowedPath(pathname: string): boolean {
  return [...PRIMARY_NAV, ...MORE_NAV].some((i) => i.forGuest && i.to.split('?')[0] === pathname)
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
