import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ActionButton, type Action } from "./ActionButton"

export interface EmptyStateProps {
  /** Ikona lucide, vykreslí se 24 px a čtečka ji přeskočí. */
  icon: LucideIcon
  /** Jedna věta: „Zatím tu nejsou žádná alba.“ (DESIGN.md §8). */
  message: string
  /** Volitelná akce, co udělat dál („Nové album“). */
  action?: Action
  className?: string
}

/** Prázdná sekce (DESIGN.md §7 „Stavy“): ikona, jedna věta a volitelná akce. Místo jednorázových tříd `*-empty-*`. */
export function EmptyState({ icon: Icon, message, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-4 py-8 text-center", className)}>
      <Icon aria-hidden="true" className="size-6 text-(--text-muted)" />
      <p className="text-body text-(--text-muted)">{message}</p>
      {action && <ActionButton action={action} />}
    </div>
  )
}
