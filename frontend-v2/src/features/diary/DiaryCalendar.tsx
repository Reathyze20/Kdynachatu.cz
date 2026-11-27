/**
 * DiaryCalendar.tsx — Kalendář dnů pobytu uvnitř složky deníku (DESIGN.md, #520)
 * Loop od startDate do endDate, každý den je tlačítko, které otevře zápisník.
 */
import { CalendarX, Image as ImageIcon } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import type { DiaryEntry, DiaryFolder } from '@/api/diary'
import { capitalize, toIsoDate } from '@/lib/dateUtils'
import { weekdayName } from '@/lib/format'

interface Props {
  folder: DiaryFolder
  entries: DiaryEntry[]
  onOpenNotebook: (dateObj: Date, entry: DiaryEntry | undefined) => void
}

export function DiaryCalendar({ folder, entries, onOpenNotebook }: Props) {
  // Generuj pole dnů od startDate do endDate
  const days: Date[] = []
  if (folder.startDate && folder.endDate) {
    const start = new Date(folder.startDate)
    const end = new Date(folder.endDate)
    start.setHours(0, 0, 0, 0)
    end.setHours(0, 0, 0, 0)
    const cur = new Date(start)
    while (cur <= end) {
      days.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
  }

  // Map date-string → entry
  const entryByDate = new Map<string, DiaryEntry>()
  for (const e of entries) {
    entryByDate.set(e.date.slice(0, 10), e)
  }

  if (days.length === 0) {
    return <EmptyState icon={CalendarX} message="Pobyt nemá nastavený termín." />
  }

  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4" data-testid="diary-calendar">
      {days.map(day => {
        const key = day.toISOString().slice(0, 10)
        const entry = entryByDate.get(key)
        const preview = entry?.content
          ? entry.content.length > 50
            ? entry.content.slice(0, 50) + '…'
            : entry.content
          : ''
        const hasPhotos = (entry?.galleryPhotoIds?.length ?? 0) > 0

        return (
          <li key={key}>
            {/* Den se zápisem je zvýrazněná plocha; číslo dne stojí v řádku nad textem, nic nepřekrývá. */}
            <button
              type="button"
              className={`flex h-full min-h-28 w-full flex-col gap-1 rounded-xl p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${entry ? 'bg-accent' : 'bg-inset hover:bg-(--bg-hover)'}`}
              onClick={() => onOpenNotebook(day, entry)}
              data-testid="diary-day-card"
              data-date={key}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-eyebrow text-(--text-muted) uppercase">{capitalize(weekdayName(toIsoDate(day)))}</span>
                <span className="day-number text-card-title text-(--text-main)">{day.getDate()}</span>
              </span>
              {preview && (
                <span className="entry-preview text-meta text-(--text-main) [overflow-wrap:anywhere]">
                  {preview}
                  {hasPhotos && <ImageIcon role="img" aria-label="Zápis má fotky" className="ml-1 inline size-4 align-text-bottom text-(--text-muted)" />}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
