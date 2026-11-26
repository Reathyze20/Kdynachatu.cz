import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Rytmus řádku: výška aspoň 48 px (`--touch-target-min`), odsazení jako obsah `Card`. */
const listRowClass = "flex min-h-(--touch-target-min) items-center gap-3 px-4 text-body md:px-6"

/**
 * Řádek, který je celý odkazem nebo tlačítkem (položka menu Víc, šuplíku profilu): ikona 20 px vlevo,
 * text zarovnaný vlevo, aktivní položka (`aria-current="page"`) zvýrazněná jako navigace. Skládá se řetězcem,
 * ne přes `cn()`: tailwind-merge by `text-body` považoval za barvu a zahodil ho.
 */
export const listRowLinkClass = `${listRowClass} w-full rounded-(--radius-md) text-left text-(--text-main) hover:bg-(--bg-hover) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-[current=page]:bg-accent aria-[current=page]:font-semibold aria-[current=page]:text-primary [&_svg]:shrink-0`

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
 * Řádek, který je celý odkazem nebo tlačítkem, dostane `listRowLinkClass`.
 */
export function ListRow({ as: Tag = "div", children, action, className, ...props }: ListRowProps) {
  return (
    <Tag className={cn(listRowClass, className)} {...props}>
      <div className="min-w-0 flex-1 py-2">{children}</div>
      {action && <div className="flex shrink-0 items-center">{action}</div>}
    </Tag>
  )
}
