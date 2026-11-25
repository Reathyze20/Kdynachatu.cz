import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils"

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Prvek karty; sekce s nadpisem je `section`, položka seznamu `li`. */
  as?: "div" | "section" | "article" | "li"
  /** Bez vnitřního odsazení, pro kartu se seznamem `ListRow`, které mají odsazení samy. */
  flush?: boolean
}

/**
 * Papírová karta (DESIGN.md §2 a §6): `bg-sheet` + `border-rule-soft` + `shadow-lift`, uvnitř `p-4 md:p-6`.
 * Místo zmrazených tříd `page-card`, `glass-card`, `admin-card` a `.card`.
 */
export function Card({ as: Tag = "div", flush = false, className, ...props }: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-2xl border border-rule-soft bg-sheet text-(--text-main) shadow-lift",
        !flush && "p-4 md:p-6",
        className
      )}
      {...props}
    />
  )
}
