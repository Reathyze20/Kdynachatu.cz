/**
 * DiaryFolders.tsx — seznam pobytů deníku s filtrem období (DESIGN.md, #520)
 */
import { useState } from 'react'
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import type { DiaryFolder } from '@/api/diary'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCount } from '@/lib/format'
import { formatStayRange } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'

type PeriodFilter = 'all' | 'current_year' | 'last_year' | 'older'

const PERIODS: { value: PeriodFilter; label: string; empty: string }[] = [
  { value: 'all', label: 'Vše', empty: 'Zatím tu nejsou žádné pobyty.' },
  { value: 'current_year', label: 'Letos', empty: 'Letos tu zatím žádný pobyt není.' },
  { value: 'last_year', label: 'Loni', empty: 'Loni tu žádný pobyt není.' },
  { value: 'older', label: 'Starší', empty: 'Starší pobyty tu nejsou.' },
]

function filterFolders(folders: DiaryFolder[], period: PeriodFilter): DiaryFolder[] {
  if (period === 'all') return folders
  const now = new Date()
  const currentYear = now.getFullYear()
  const lastYear = currentYear - 1
  return folders.filter(f => {
    const year = f.startDate ? new Date(f.startDate).getFullYear() : null
    if (!year) return false
    if (period === 'current_year') return year === currentYear
    if (period === 'last_year') return year === lastYear
    if (period === 'older') return year < lastYear
    return true
  })
}

/** Podle termínu od nejnovějšího (server vrací podle data vytvoření); pobyt bez termínu až na konci. */
function byStayDate(a: DiaryFolder, b: DiaryFolder): number {
  const ka = a.startDate?.slice(0, 10) ?? ''
  const kb = b.startDate?.slice(0, 10) ?? ''
  if (ka !== kb) return !ka ? 1 : !kb ? -1 : kb.localeCompare(ka)
  return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
}

interface Props {
  folders: DiaryFolder[]
  onOpen: (folder: DiaryFolder) => void
  onRename: (folder: DiaryFolder) => void
  onDelete: (folder: DiaryFolder) => void
  onNewFolder: () => void
  /** Smí uživatel pobyt přejmenovat a smazat? Bez něj se akce nenabízí (#507). */
  canManage?: (folder: DiaryFolder) => boolean
}

export function DiaryFolders({ folders, onOpen, onRename, onDelete, onNewFolder, canManage = () => false }: Props) {
  const [period, setPeriod] = useState<PeriodFilter>('all')

  // Kopie: filtr „Vše“ vrací pole z cache dotazu a sort() by ho přeskládal na místě.
  const visible = [...filterFolders(folders, period)].sort(byStayDate)
  const emptyMessage = folders.length === 0 ? PERIODS[0].empty : PERIODS.find(p => p.value === period)!.empty

  return (
    <div className="flex flex-col gap-4" data-testid="diary-folders-view">
      {/* Segmentový přepínač: vybrané období je papír na vnořené dráze. */}
      <div className="flex gap-1 self-start rounded-xl bg-inset p-1" role="group" aria-label="Období">
        {PERIODS.map(p => (
          <Button
            key={p.value}
            type="button"
            variant="ghost"
            size="sm"
            className={cn('px-3 text-(--text-muted)', period === p.value && 'bg-sheet text-(--text-main) shadow-xs hover:bg-sheet')}
            aria-pressed={period === p.value}
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={BookOpen} message={emptyMessage} action={{ label: 'Nový pobyt', icon: Plus, onClick: onNewFolder }} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {visible.map(folder => (
            // Klik kamkoli na kartu otevře pobyt; tlačítko s názvem ho zpřístupní z klávesnice (jeho klik sem probublá).
            <li
              key={folder.id}
              className="flex cursor-pointer items-start gap-2 rounded-xl bg-inset p-4 transition-colors hover:bg-(--bg-hover)"
              onClick={() => onOpen(folder)}
              data-testid="diary-folder-card"
              data-folder-id={folder.id}
            >
              <div className="min-w-0 flex-1">
                <h2 className="text-card-title text-(--text-main) [overflow-wrap:anywhere]">
                  <button type="button" className="rounded-(--radius-sm) text-left focus-visible:outline-2 focus-visible:outline-ring">
                    {folder.name}
                  </button>
                </h2>
                {folder.startDate && (
                  <p className="folder-dates mt-1">
                    {formatStayRange(folder.startDate, folder.endDate)}
                  </p>
                )}
                {folder.stats && (
                  <p className="mt-1 text-meta text-(--text-muted)">
                    {formatCount(folder.stats.entries, 'záznam', 'záznamy', 'záznamů')} · {formatCount(folder.stats.photos, 'fotka', 'fotky', 'fotek')}
                  </p>
                )}
              </div>
              {canManage(folder) && (
                <div className="-my-2 -mr-2 flex shrink-0 gap-2" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" aria-label="Přejmenovat" onClick={() => onRename(folder)}>
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-(--status-error-dark)" aria-label="Smazat" onClick={() => onDelete(folder)}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
