/**
 * ViewSwitcher.tsx — přepínač režimů „Zásoby / Nákup · N“ (#224): segmenty na vnořené dráze, vybraný je papír
 */
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ActiveView = 'shopping' | 'pantry'

interface Props {
  activeView: ActiveView
  onChange: (view: ActiveView) => void
  /** Položky ve stavu Koupit ve všech aktivních seznamech; bez čísla, dokud se seznamy nenačtou. */
  pendingCount?: number
}

export function ViewSwitcher({ activeView, onChange, pendingCount }: Props) {
  const views: { id: ActiveView; label: ReactNode }[] = [
    { id: 'pantry', label: 'Zásoby' },
    { id: 'shopping', label: pendingCount === undefined ? 'Nákup' : <>Nákup · {pendingCount} <span className="sr-only">ke koupi</span></> },
  ]
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-inset p-1 md:w-80" role="group" aria-label="Zásoby nebo nákup">
      {views.map(({ id, label }) => (
        <Button
          key={id}
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={activeView === id}
          className={cn('px-3 text-(--text-muted)', activeView === id && 'bg-sheet text-(--text-main) shadow-xs hover:bg-sheet')}
          onClick={() => onChange(id)}
        >
          {label}
        </Button>
      ))}
    </div>
  )
}
