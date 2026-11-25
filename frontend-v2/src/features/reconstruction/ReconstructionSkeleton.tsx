import { Card } from '@/components/shared/Card'
import { cn } from '@/lib/utils'

/** Kostička na tokenu `bg-inset`; pulz odpadne při `prefers-reduced-motion` (DESIGN.md §5). */
function Block({ className }: { className: string }) {
  return <div className={cn('rounded-md bg-inset motion-safe:animate-pulse', className)} />
}

/** Načítání ve tvaru stránky (DESIGN.md §7 Stavy): hlavička se souhrnem, rozpočet a tři sloupce s papírovými kartami. */
export function ReconstructionSkeleton() {
  return (
    <Card flush role="status" aria-label="Načítám rekonstrukce" className="reconstruction-card flex min-h-0 flex-1 flex-col">
      <div className="grid gap-4 border-b border-rule-soft p-4 md:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="grid gap-2">
          <Block className="h-8 w-56 max-w-full" />
          <Block className="h-5 w-72 max-w-full" />
        </div>
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Block key={index} className="h-18 rounded-xl lg:w-28" />
          ))}
        </div>
        <Block className="h-24 rounded-xl lg:col-span-2" />
      </div>

      <div className="kanban-board">
        {Array.from({ length: 3 }, (_, columnIndex) => (
          <div key={columnIndex} className="kanban-column">
            <div className="kanban-column-header">
              <Block className="h-5 flex-1" />
              <Block className="size-12 rounded-full" />
            </div>
            <div className="kanban-column-body">
              {Array.from({ length: 3 }, (_, cardIndex) => (
                <Card key={cardIndex} flush className="grid gap-2 rounded-xl p-3">
                  <Block className="h-5 w-3/4" />
                  <Block className="h-4 w-full" />
                  <Block className="h-4 w-2/3" />
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
