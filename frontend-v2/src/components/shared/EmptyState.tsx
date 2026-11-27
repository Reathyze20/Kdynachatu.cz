import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ActionButton, type Action } from "./ActionButton"

/** Ikona, nebo obrázek plcha, nikdy obojí (DESIGN.md §4). */
type EmptyStateVisual =
  | {
      /** Ikona lucide, vykreslí se 24 px a čtečka ji přeskočí. */
      icon: LucideIcon
      image?: never
    }
  | {
      /** Plch z PixelLabu (`features/dashboard/scene/dormouse-*.png`, 56 × 40 px) místo ikony, dekorativní. */
      image: string
      icon?: never
    }

export type EmptyStateProps = EmptyStateVisual & {
  /** Jedna věta: „Zatím tu nejsou žádná alba.“ (DESIGN.md §8). */
  message: string
  /** Volitelná akce, co udělat dál („Nové album“). */
  action?: Action
  className?: string
}

/**
 * Plch z PixelLabu v prázdném stavu (#655): 1× nativní velikosti spritu (56 × 40 px), ostré pixely, dekorativní.
 * Bloky prázdných stavů, které ještě nejsou na `EmptyState` (Nákupy, Galerie), ho vkládají přímo.
 */
export function EmptyStateImage({ src }: { src: string }) {
  return <img src={src} alt="" width={56} height={40} className="[image-rendering:pixelated]" />
}

/** Prázdná sekce (DESIGN.md §7 „Stavy“): ikona nebo plch, jedna věta a volitelná akce. Místo jednorázových tříd `*-empty-*`. */
export function EmptyState({ icon: Icon, image, message, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-4 py-8 text-center", className)}>
      {image ? <EmptyStateImage src={image} /> : Icon && <Icon aria-hidden="true" className="size-6 text-(--text-muted)" />}
      <p className="text-body text-(--text-muted)">{message}</p>
      {action && <ActionButton action={action} />}
    </div>
  )
}
