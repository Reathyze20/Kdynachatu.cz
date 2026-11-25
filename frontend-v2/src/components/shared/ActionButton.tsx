import { Link } from "react-router-dom"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Akce kompozitu (`PageHeader.primaryAction`, `EmptyState.action`): text infinitivem nebo „Nový/á X“ (DESIGN.md §8),
 * volitelná ikona lucide (u vytvoření `Plus`) a buď `onClick`, nebo `to` (odkaz se vzhledem tlačítka).
 */
export type Action = { label: string; icon?: LucideIcon } & (
  | { onClick: () => void; to?: never; disabled?: boolean; pending?: boolean }
  | { to: string; onClick?: never; disabled?: never; pending?: never }
)

/** Vykreslí `Action` jako primární `Button`; text zůstává vidět i na mobilu. */
export function ActionButton({ action }: { action: Action }) {
  const { label, icon: Icon } = action
  const content = <>{Icon && <Icon aria-hidden="true" />}{label}</>
  if (action.to !== undefined) {
    return (
      <Button asChild>
        <Link to={action.to}>{content}</Link>
      </Button>
    )
  }
  return (
    <Button onClick={action.onClick} disabled={action.disabled} pending={action.pending}>
      {content}
    </Button>
  )
}
