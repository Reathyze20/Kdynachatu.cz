import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"

import { cn } from "@/lib/utils"

/**
 * Kebab menu akcí nad položkou (DESIGN.md §7 „Akce nad položkou“, #452). Radix obstará klávesnici
 * (Enter/mezerník/šipky otevřou, šipky procházejí, Esc zavře a vrátí focus) i dotyk.
 *
 * ```tsx
 * <DropdownMenu>
 *   <DropdownMenuTrigger asChild>
 *     <Button variant="ghost" size="icon" aria-label="Akce s položkou"><EllipsisVertical aria-hidden="true" /></Button>
 *   </DropdownMenuTrigger>
 *   <DropdownMenuContent>
 *     <DropdownMenuItem onSelect={edit}><Pencil aria-hidden="true" />Upravit</DropdownMenuItem>
 *     <DropdownMenuItem variant="danger" onSelect={askDelete}><Trash2 aria-hidden="true" />Smazat</DropdownMenuItem>
 *   </DropdownMenuContent>
 * </DropdownMenu>
 * ```
 */
const DropdownMenu = DropdownMenuPrimitive.Root

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, align = "end", ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      align={align}
      className={cn(
        // Nad modálem (--z-modal), aby kebab menu fungovalo i v dialogu.
        "z-(--z-dialog) max-h-(--radix-dropdown-menu-content-available-height) min-w-48 overflow-y-auto overflow-x-hidden rounded-xl border border-rule-soft bg-sheet p-1 text-(--text-main) shadow-lift",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    /** `danger` pro mazání: červený text. Samotné smazání se potvrdí přes `ConfirmDialog`. */
    variant?: "default" | "danger"
  }
>(({ className, variant = "default", ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex min-h-(--touch-target-min) cursor-pointer select-none items-center gap-3 rounded-(--radius-sm) px-3 text-base outline-none transition-colors focus:bg-accent data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      // Tmavší červená: --status-error má na papíře kontrast jen ~4,3 : 1.
      variant === "danger" && "text-(--status-error-dark) focus:bg-(--status-error-light)",
      className
    )}
    {...props}
  />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-rule-soft", className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
}
