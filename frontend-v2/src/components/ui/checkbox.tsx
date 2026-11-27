import * as React from "react"

import { cn } from "@/lib/utils"

export type CheckboxProps = Omit<React.ComponentProps<"input">, "type">

/**
 * Zaškrtávací políčko na tokenech (DESIGN.md §6, #526): nativní `input type="checkbox"` 20 px v barvě Jedle.
 * Dotykový cíl 48 px dává obalující `<label>` s `min-h-(--touch-target-min)`, jménem je text v labelu.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className, ...props }, ref) => {
  return (
    <input
      type="checkbox"
      className={cn(
        "size-5 shrink-0 cursor-pointer accent-(--brand-primary) disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Checkbox.displayName = "Checkbox"

export { Checkbox }
