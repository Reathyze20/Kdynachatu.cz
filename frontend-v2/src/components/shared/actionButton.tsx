import { Link } from "react-router-dom"
import type { LucideIcon } from "lucide-react"
import { Button, type ButtonProps } from "@/components/ui/button"

/**
 * Akce kompozitu (`PageHeader.primaryAction`, `EmptyState.action`): text infinitivem nebo „Nový/á X“ (DESIGN.md §8),
 * volitelná ikona lucide (u vytvoření `Plus`) a buď `onClick`, nebo `to` (odkaz se vzhledem tlačítka).
 */
export type Action = {
  label: string
  icon?: LucideIcon
} & (
  | { onClick: () => void; to?: never; disabled?: boolean; pending?: boolean }
  | { to: string; onClick?: never; disabled?: never; pending?: never }
)

/** Vykreslí `Action` jako `Button`; text zůstává vidět i na mobilu. */
export function ActionButton({ action, variant = "primary" }: { action: Action; variant?: ButtonProps["variant"] }) {
  const Icon = action.icon
  const content = (
    <>
      {Icon && <Icon aria-hidden="true" />}
      {action.label}
    </>
  )
  if (action.to !== undefined) {
    return (
      <Button asChild variant={variant}>
        <Link to={action.to}>{content}</Link>
      </Button>
    )
  }
  return (
    <Button variant={variant} onClick={action.onClick} disabled={action.disabled} pending={action.pending}>
      {content}
    </Button>
  )
}
