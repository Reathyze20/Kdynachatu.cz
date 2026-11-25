import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface ListRowProps extends HTMLAttributes<HTMLElement> {
  /** `li` uvnitř `<ul>`, jinak `div`. */
  as?: "div" | "li"
  /** Obsah řádku, zabere zbytek šířky a smí se zalomit. */
  children: ReactNode
  /** Akce vpravo: kebab menu (`DropdownMenu`) nebo jedna ikona nejčastější akce lehké položky (DESIGN.md §7). */
  action?: ReactNode
}

/**
 * Řádek seznamu (DESIGN.md §6): výška aspoň 48 px (`--touch-target-min`), slot pro obsah a akci.
 * Odsazení `px-4 md:px-6` sedí s obsahem `Card`, oddělovače dá rodič (`divide-y divide-rule-soft`).
 */
export function ListRow({ as: Tag = "div", children, action, className, ...props }: ListRowProps) {
  return (
    <Tag className={cn("flex min-h-(--touch-target-min) items-center gap-3 px-4 text-body md:px-6", className)} {...props}>
      <div className="min-w-0 flex-1 py-2">{children}</div>
      {action && <div className="flex shrink-0 items-center">{action}</div>}
    </Tag>
  )
}
