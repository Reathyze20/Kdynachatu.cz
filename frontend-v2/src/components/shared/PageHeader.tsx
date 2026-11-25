import { Fragment, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { ChevronLeft, EllipsisVertical, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ActionButton, type Action } from "./actionButton"

/** Sekundární akce stránky v kebab menu hlavičky. `danger` (Smazat) se v menu oddělí od ostatních. */
export interface PageHeaderMenuAction {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  variant?: "default" | "danger"
  disabled?: boolean
}

export interface PageHeaderProps {
  /** Titulek stránky, vždy jediné `h1`. */
  title: ReactNode
  /** Krátký text pod titulkem. */
  subtitle?: ReactNode
  /** Cesta pro odkaz „Zpět“ nad titulkem. */
  backTo?: string
  /** Nejvýš jedna primární akce vpravo, u vytvoření ikona `Plus` a „Nová/Nové X“. */
  primaryAction?: Action
  /** Ostatní akce stránky, schované v kebab menu „Další akce“. */
  secondaryActions?: PageHeaderMenuAction[]
  className?: string
}

/**
 * Hlavička každé stránky (DESIGN.md §7 „Hlavička“, rozhodnutí #262): odkaz Zpět, titulek jako jediné `h1`,
 * podtitulek, vpravo nejvýš jedna primární akce a kebab menu se sekundárními akcemi.
 */
export function PageHeader({ title, subtitle, backTo, primaryAction, secondaryActions = [], className }: PageHeaderProps) {
  const hasActions = primaryAction !== undefined || secondaryActions.length > 0
  return (
    <header className={className}>
      {backTo !== undefined && (
        <Link
          to={backTo}
          className="-ml-2 inline-flex min-h-(--touch-target-min) items-center gap-1 rounded-(--radius-md) px-2 text-body font-semibold text-primary focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Zpět
        </Link>
      )}
      {/* Dlouhý titulek nenechá akce zúžit sloupec pod 10rem, akce se pak na mobilu zalomí pod něj. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-[1_1_10rem]">
          <h1 className="text-page-title text-(--text-main) [overflow-wrap:anywhere]">{title}</h1>
          {subtitle && <p className="mt-1 text-body text-(--text-muted)">{subtitle}</p>}
        </div>
        {hasActions && (
          <div className="flex shrink-0 items-center gap-2">
            {primaryAction && <ActionButton action={primaryAction} />}
            {secondaryActions.length > 0 && <HeaderMenu actions={secondaryActions} />}
          </div>
        )}
      </div>
    </header>
  )
}

function HeaderMenu({ actions }: { actions: PageHeaderMenuAction[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Další akce">
          <EllipsisVertical aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {actions.map((action, i) => {
          const Icon = action.icon
          // Mazání se odděluje od ostatních akcí (DESIGN.md §6 DropdownMenu).
          const separate = action.variant === "danger" && i > 0 && actions[i - 1].variant !== "danger"
          return (
            <Fragment key={action.label}>
              {separate && <DropdownMenuSeparator />}
              <DropdownMenuItem variant={action.variant} disabled={action.disabled} onSelect={action.onSelect}>
                {Icon && <Icon aria-hidden="true" />}
                {action.label}
              </DropdownMenuItem>
            </Fragment>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
