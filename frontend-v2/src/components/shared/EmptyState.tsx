import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ActionButton, type Action } from "./ActionButton"

export interface EmptyStateProps {
  /** Ikona lucide, vykreslĂ­ se 24 px a ÄŤteÄŤka ji pĹ™eskoÄŤĂ­. */
  icon: LucideIcon
  /** Jedna vÄ›ta: â€žZatĂ­m tu nejsou ĹľĂˇdnĂˇ alba.â€ś (DESIGN.md Â§8). */
  message: string
  /** VolitelnĂˇ akce, co udÄ›lat dĂˇl (â€žNovĂ© albumâ€ś). */
  action?: Action
  className?: string
}

/** PrĂˇzdnĂˇ sekce (DESIGN.md Â§7 â€žStavyâ€ś): ikona, jedna vÄ›ta a volitelnĂˇ akce. MĂ­sto jednorĂˇzovĂ˝ch tĹ™Ă­d `*-empty-*`. */
export function EmptyState({ icon: Icon, message, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-4 py-8 text-center", className)}>
      <Icon aria-hidden="true" className="size-6 text-(--text-muted)" />
      <p className="text-body text-(--text-muted)">{message}</p>
      {action && <ActionButton action={action} />}
    </div>
  )
}
