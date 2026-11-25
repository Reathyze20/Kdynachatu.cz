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
import { ActionButton, type Action } from "./ActionButton"

/** SekundĂˇrnĂ­ akce strĂˇnky v kebab menu hlaviÄŤky. `danger` (Smazat) se v menu oddÄ›lĂ­ od ostatnĂ­ch. */
export interface PageHeaderMenuAction {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  variant?: "default" | "danger"
}

export interface PageHeaderProps {
  /** Titulek strĂˇnky, vĹľdy jedinĂ© `h1`. */
  title: ReactNode
  subtitle?: ReactNode
  /** Cesta pro odkaz â€žZpÄ›tâ€ś nad titulkem. */
  backTo?: string
  /** NejvĂ˝Ĺˇ jedna primĂˇrnĂ­ akce vpravo, u vytvoĹ™enĂ­ ikona `Plus` a â€žNovĂˇ/NovĂ© Xâ€ś. */
  primaryAction?: Action
  /** OstatnĂ­ akce strĂˇnky, schovanĂ© v kebab menu â€žDalĹˇĂ­ akceâ€ś. */
  secondaryActions?: PageHeaderMenuAction[]
  className?: string
}

/**
 * HlaviÄŤka kaĹľdĂ© strĂˇnky (DESIGN.md Â§7 â€žHlaviÄŤkaâ€ś, rozhodnutĂ­ #262): odkaz ZpÄ›t, titulek jako jedinĂ© `h1`,
 * podtitulek, vpravo nejvĂ˝Ĺˇ jedna primĂˇrnĂ­ akce a kebab menu se sekundĂˇrnĂ­mi akcemi.
 */
export function PageHeader({ title, subtitle, backTo, primaryAction, secondaryActions = [], className }: PageHeaderProps) {
  return (
    <header className={className}>
      {backTo !== undefined && (
        <Link
          to={backTo}
          className="-ml-2 inline-flex min-h-(--touch-target-min) items-center gap-1 rounded-(--radius-md) px-2 text-body font-semibold text-primary focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          ZpÄ›t
        </Link>
      )}
      {/* Titulek si drĹľĂ­ aspoĹ 10rem, akce se pak na mobilu zalomĂ­ pod nÄ›j. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-[1_1_10rem]">
          <h1 className="text-page-title text-(--text-main) [overflow-wrap:anywhere]">{title}</h1>
          {subtitle && <p className="mt-1 text-body text-(--text-muted)">{subtitle}</p>}
        </div>
        {(primaryAction || secondaryActions.length > 0) && (
          <div className="flex shrink-0 items-center gap-2">
            {primaryAction && <ActionButton action={primaryAction} />}
            {secondaryActions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="DalĹˇĂ­ akce">
                    <EllipsisVertical aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {secondaryActions.map(({ label, icon: Icon, onSelect, variant }, i) => (
                    <Fragment key={label}>
                      {variant === "danger" && i > 0 && secondaryActions[i - 1].variant !== "danger" && <DropdownMenuSeparator />}
                      <DropdownMenuItem variant={variant} onSelect={onSelect}>
                        {Icon && <Icon aria-hidden="true" />}
                        {label}
                      </DropdownMenuItem>
                    </Fragment>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
