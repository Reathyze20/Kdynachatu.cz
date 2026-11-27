import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

export interface SelectProps extends React.ComponentProps<"select"> {
  /** Chybový stav: `aria-invalid` a červený rámeček. Text chyby patří pod pole a propojí se přes `aria-describedby`. */
  invalid?: boolean
}

/**
 * Nativní výběr jedné volby na tokenech (DESIGN.md §6, #651), vzhledem jako `Input`; volby jsou `<option>` v potomcích.
 * `className` patří obalu (šířka, umístění v mřížce), aby šipka zůstala v poli; výběr sám je vždy na celou šířku.
 * Výšku 48 px, písmo 16 px, odsazení pro šipku a chybový stav nese s `!`: globální pravidla pro `select` ve forms.css
 * jsou mimo vrstvy Tailwindu (a vypínají nativní šipku), proto šipku kreslí ikona.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid, "aria-invalid": ariaInvalid, children, ...props }, ref) => {
    return (
      <div className={cn("relative w-full", className)}>
        <select
          aria-invalid={invalid || ariaInvalid || undefined}
          className={cn(
            "w-full min-h-(--touch-target-min)! appearance-none rounded-(--radius-md) border border-input bg-(--bg-card) py-2 pl-3 pr-10! text-base! text-(--text-main) shadow-xs transition-colors focus-visible:border-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-(--bg-app) disabled:text-(--text-muted) aria-invalid:border-destructive! aria-invalid:shadow-[0_0_0_3px_color-mix(in_srgb,var(--status-error)_10%,transparent)]!"
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-(--text-muted)"
        />
      </div>
    )
  }
)
Select.displayName = "Select"

export { Select }
