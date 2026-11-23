/**
 * PendingSyncBadge.tsx — Štítek „Čeká na odeslání“ u akce v offline frontě (pravidlo E4, #276).
 *
 * CSS: src/styles/skeleton.css → .pending-sync-badge
 */
import { Clock } from 'lucide-react'

export function PendingSyncBadge() {
  return (
    <span className="pending-sync-badge">
      <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
      Čeká na odeslání
    </span>
  )
}
