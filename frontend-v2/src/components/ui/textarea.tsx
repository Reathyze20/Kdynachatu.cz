import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps extends React.ComponentProps<"textarea"> {
  /** Chybový stav: `aria-invalid` a červený rámeček. Text chyby patří pod pole a propojí se přes `aria-describedby`. */
  invalid?: boolean
}

/**
 * Víceřádkové pole na tokenech (DESIGN.md §6, #526), vzhledem jako `Input`. Výšku řídí `rows`, nejméně 48 px.
 * Písmo 16 px a chybový stav nese s `!`: globální pravidla pro `textarea` ve forms.css jsou mimo vrstvy Tailwindu.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, "aria-invalid": ariaInvalid, ...props }, ref) => {
    return (
      <textarea
        aria-invalid={invalid || ariaInvalid || undefined}
        className={cn(
          "w-full min-h-(--touch-target-min)! resize-y rounded-(--radius-md) border border-input bg-(--bg-card) px-3 py-2 text-base! text-(--text-main) shadow-xs transition-colors placeholder:text-(--text-placeholder) focus-visible:border-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-(--bg-app) disabled:text-(--text-muted) aria-invalid:border-destructive! aria-invalid:shadow-[0_0_0_3px_color-mix(in_srgb,var(--status-error)_10%,transparent)]!",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
