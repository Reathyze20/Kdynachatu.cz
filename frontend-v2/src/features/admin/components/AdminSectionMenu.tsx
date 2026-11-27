import { Link } from 'react-router-dom'
import { ScrollText, Settings, TicketPlus, UserPlus } from 'lucide-react'

export type AdminSectionMenuKey = 'members' | 'invites' | 'cabin' | 'diagnostics'

const adminMenuItems: Array<{
  key: AdminSectionMenuKey
  to: string
  label: string
  meta: string
  icon: typeof UserPlus
}> = [
  {
    key: 'members',
    to: '/admin',
    label: 'Členové a role',
    meta: 'Účty a oprávnění',
    icon: UserPlus,
  },
  {
    key: 'invites',
    to: '/admin/invites',
    label: 'Pozvánky',
    meta: 'Sdílené vstupy',
    icon: TicketPlus,
  },
  {
    key: 'cabin',
    to: '/admin/cabin',
    label: 'Nastavení chaty',
    meta: 'Moduly a pravidla',
    icon: Settings,
  },
  {
    key: 'diagnostics',
    to: '/admin/diagnostics',
    label: 'Diagnostika',
    meta: 'Logy a incidenty',
    icon: ScrollText,
  },
]

interface AdminSectionMenuProps {
  active: AdminSectionMenuKey
}

export function AdminSectionMenu({ active }: AdminSectionMenuProps) {
  return (
    <nav className="flex flex-wrap items-center gap-2.5" aria-label="Sekce administrace" data-testid="admin-section-menu">
      {adminMenuItems.map((item) => {
        const Icon = item.icon
        const isActive = active === item.key

        return (
          <Link
            key={item.key}
            to={item.to}
            className={`inline-flex min-h-(--touch-target-min) w-full items-center gap-3 rounded-full border px-3.5 py-2 text-(--text-main) no-underline transition-colors md:w-auto ${
              isActive ? 'border-primary bg-accent' : 'border-rule-soft bg-sheet hover:bg-(--bg-hover)'
            }`}
            aria-current={isActive ? 'page' : undefined}
            data-testid="admin-section-link"
            data-section-key={item.key}
            data-route={item.to}
          >
            {/* Vybraná sekce: zvýrazněná plocha (DESIGN.md §2), ikona v plné Jedli */}
            <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full ${isActive ? 'bg-primary text-(--text-on-primary)' : 'bg-accent text-primary'}`}>
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <span className="flex flex-col">
              <span className="whitespace-nowrap text-label font-bold leading-tight">{item.label}</span>
              <span className="text-meta leading-tight text-(--text-muted) max-md:hidden">{item.meta}</span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
