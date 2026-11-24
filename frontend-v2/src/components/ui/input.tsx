import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps extends React.ComponentProps<"input"> {
  /** Chybový stav: `aria-invalid` a červený rámeček. Text chyby patří pod pole a propojí se přes `aria-describedby`. */
  invalid?: boolean
}

/**
 * Pole formuláře na tokenech (DESIGN.md §6, #452), vzhledem jako ostatní pole (`styles/forms.css`).
 * Výšku 48 px, písmo 16 px (G3, iOS při menším přiblíží stránku) a chybový stav (jako `.is-invalid`) nese s `!`: globální
 * pravidla pro `input[type=…]` ve forms.css jsou mimo vrstvy Tailwindu a jinak by utility přebila. `--bg-card` drží
 * shodu s ostatními poli, papír dostanou pole najednou s převodem forms.css.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, invalid, "aria-invalid": ariaInvalid, ...props }, ref) => {
    return (
      <input
        type={type}
        aria-invalid={invalid || ariaInvalid || undefined}
        className={cn(
          "w-full min-h-(--touch-target-min)! rounded-(--radius-md) border border-input bg-(--bg-card) px-3 py-2 text-base! text-(--text-main) shadow-xs transition-colors placeholder:text-(--text-placeholder) focus-visible:border-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-(--bg-app) disabled:text-(--text-muted) aria-invalid:border-destructive! aria-invalid:shadow-[0_0_0_3px_color-mix(in_srgb,var(--status-error)_10%,transparent)]!",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
