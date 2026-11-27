/**
 * DiaryCalendar.tsx — Kalendář dnů pobytu uvnitř složky deníku (DESIGN.md, #520)
 * Loop od startDate do endDate, každý den je tlačítko, které otevře zápisník.
 */
import { CalendarX, Image as ImageIcon } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import type { DiaryEntry, DiaryFolder } from '@/api/diary'
import { capitalize, isoDateToLocalNoon, isoDaysBetween } from '@/lib/dateUtils'
import { weekdayName } from '@/lib/format'

interface Props {
  folder: DiaryFolder
  entries: DiaryEntry[]
  onOpenNotebook: (dateObj: Date, entry: DiaryEntry | undefined) => void
}

export function DiaryCalendar({ folder, entries, onOpenNotebook }: Props) {
  // Dny pobytu jako kalendářní dny "YYYY-MM-DD" – stejný klíč jako `date` zápisu z API (#185)
  const days = folder.startDate && folder.endDate
    ? isoDaysBetween(folder.startDate.slice(0, 10), folder.endDate.slice(0, 10))
    : []

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
      {days.map(key => {
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
              onClick={() => onOpenNotebook(isoDateToLocalNoon(key), entry)}
              data-testid="diary-day-card"
              data-date={key}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-eyebrow text-(--text-muted) uppercase">{capitalize(weekdayName(key))}</span>
                <span className="day-number text-card-title text-(--text-main)">{Number(key.slice(8, 10))}</span>
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
