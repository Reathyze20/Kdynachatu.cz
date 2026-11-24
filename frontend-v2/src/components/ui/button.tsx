import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { LoaderCircle } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Tlačítko pro každou akci (DESIGN.md §6, #452). Varianty `primary` (hlavní akce, výchozí), `secondary`,
 * `ghost` a `danger`. Každá velikost má dotykový cíl aspoň 48 px, `lg` je hlavní akce obrazovky 56 px.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-md) text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-(--brand-primary-hover)",
        secondary: "border border-input bg-background text-foreground hover:bg-(--bg-hover)",
        ghost: "text-foreground hover:bg-accent",
        danger: "bg-destructive text-destructive-foreground hover:bg-(--status-error-dark)",
        // Zastaralé aliasy původních shadcn jmen, drží je themeBridge.test.tsx a brandGreen.test.ts.
        // Nový kód píše `primary` a `secondary`.
        default: "bg-primary text-primary-foreground hover:bg-(--brand-primary-hover)",
        outline: "border border-input bg-background text-foreground hover:bg-(--bg-hover)",
      },
      size: {
        default: "min-h-(--touch-target-min) px-4 py-2",
        sm: "min-h-(--touch-target-min) px-3 text-sm",
        lg: "min-h-(--touch-target-primary) rounded-full px-8",
        icon: "size-(--touch-target-min) [&_svg]:size-5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Vykreslí potomka (např. `<Link>`) se vzhledem tlačítka. Spinner pro `pending` se pak nepřidá. */
  asChild?: boolean
  /** Probíhá odesílání: spinner v tlačítku, `aria-busy` a tlačítko nejde stisknout znovu. Text piš v 1. osobě („Ukládám…“). */
  pending?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, pending = false, disabled, children, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size, className }))
    if (asChild) {
      return (
        <Slot className={classes} ref={ref} disabled={disabled} aria-busy={pending || undefined} {...props}>
          {children}
        </Slot>
      )
    }
    return (
      <button className={classes} ref={ref} disabled={disabled || pending} aria-busy={pending || undefined} {...props}>
        {pending && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
