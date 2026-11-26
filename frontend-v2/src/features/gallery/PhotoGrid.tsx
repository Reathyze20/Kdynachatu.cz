/**
 * PhotoGrid.tsx — Fotky v albu: masonry, výběr k mazání a stránkování (DESIGN.md, #519).
 * Hlavička alba (název, Zpět, Nahrát) je v GalleryPage přes PageHeader.
 */
import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Check, ChevronLeft, ChevronRight, ImagePlus, ListChecks, SquareCheck, Trash2, Upload, X } from 'lucide-react'
import type { GalleryPhoto } from '@/api/gallery'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/EmptyState'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 10

interface Props {
  photos: GalleryPhoto[]
  isSelectionMode: boolean
  selectedPhotos: Set<string>
  isGuest?: boolean
  onOpenLightbox: (index: number) => void
  onToggleSelect: (id: string) => void
  onToggleSelectionMode: () => void
  onSelectAll: (ids: string[]) => void
  onDeselectAll: () => void
  onDeleteSelected: () => void
  onUpload: () => void
  folderName: string
  /** Smí uživatel fotku smazat? Jen takovou jde vybrat k hromadnému mazání (#507). */
  canDeletePhoto?: (photo: GalleryPhoto) => boolean
}

export function PhotoGrid({
  photos,
  isSelectionMode,
  selectedPhotos,
  isGuest = false,
  onOpenLightbox,
  onToggleSelect,
  onToggleSelectionMode,
  onSelectAll,
  onDeselectAll,
  onDeleteSelected,
  onUpload,
  folderName,
  canDeletePhoto = () => false,
}: Props) {
  const [page, setPage] = useState(0)
  const masonryRef = useRef<HTMLDivElement>(null)

  const totalPages = Math.max(1, Math.ceil(photos.length / PAGE_SIZE))
  const pagePhotos = photos.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Reset to page 0 when folder changes
  useEffect(() => {
    setPage(0)
  }, [photos])

  function goToPage(p: number) {
    setPage(p)
    masonryRef.current?.scrollIntoView?.({ block: 'start' })
  }

  // Výběr slouží jen k mazání, proto jde vybrat jen to, co server opravdu smaže.
  const deletableIds = photos.filter(canDeletePhoto).map(p => p.id)

  function handleSelectAll() {
    if (deletableIds.length > 0 && deletableIds.every(id => selectedPhotos.has(id))) {
      onDeselectAll()
    } else {
      onSelectAll(deletableIds)
    }
  }

  if (photos.length === 0) {
    return (
      <EmptyState
        icon={ImagePlus}
        message="Zatím tu nejsou žádné fotky."
        action={isGuest ? undefined : { label: 'Nahrát fotky', icon: Upload, onClick: onUpload }}
      />
    )
  }

  const canSelect = !isGuest && (isSelectionMode || deletableIds.length > 0)
  const columns =
    pagePhotos.length <= 1 ? 'mx-auto max-w-lg columns-1' : pagePhotos.length <= 3 ? 'columns-2' : 'columns-2 md:columns-3 lg:columns-4'

  return (
    <div className="flex flex-col gap-4">
      {canSelect && (
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Výběr fotek">
          {isSelectionMode ? (
            <>
              <Button variant="ghost" size="sm" onClick={handleSelectAll} title="Vybrat vše">
                <ListChecks aria-hidden="true" />
                Vybrat vše
              </Button>
              <span className="text-meta text-(--text-muted)" aria-live="polite">
                {selectedPhotos.size} vybráno
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={onDeleteSelected}
                  disabled={selectedPhotos.size === 0}
                  title="Smazat vybrané"
                  aria-label="Smazat vybrané"
                >
                  <Trash2 aria-hidden="true" />
                  Smazat
                </Button>
                <Button variant="secondary" size="sm" onClick={onToggleSelectionMode}>
                  <X aria-hidden="true" />
                  Zrušit výběr
                </Button>
              </div>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={onToggleSelectionMode}>
              <SquareCheck aria-hidden="true" />
              Vybrat
            </Button>
          )}
        </div>
      )}

      {/* Masonry přes CSS sloupce; fotka se otevře nebo vybere klepnutím, Enterem i mezerníkem. */}
      <div
        ref={masonryRef}
        className={cn('scroll-mt-4 gap-3', columns)}
        role="grid"
        aria-label={`Fotky v albu ${folderName}`}
        data-testid="gallery-photo-grid"
      >
        {pagePhotos.map((photo, idx) => {
          const globalIdx = page * PAGE_SIZE + idx
          const isSelected = selectedPhotos.has(photo.id)
          const isLocked = isSelectionMode && !canDeletePhoto(photo)
          return (
            <motion.div
              key={photo.id}
              className={`photo-masonry-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring${isSelected ? ' photo-masonry-item--selected' : ''}${isLocked ? ' photo-masonry-item--locked' : ''}`}
              onClick={() => {
                if (!isSelectionMode) onOpenLightbox(globalIdx)
                else if (!isLocked) onToggleSelect(photo.id)
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                e.currentTarget.click()
              }}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              tabIndex={0}
              role="gridcell"
              aria-selected={isSelected}
              aria-disabled={isLocked || undefined}
              title={isLocked ? 'Tuhle fotku smaže jen ten, kdo ji nahrál, nebo správce.' : undefined}
              aria-label={photo.description ?? `Fotka ${globalIdx + 1}`}
              data-testid="gallery-photo-card"
              data-photo-id={photo.id}
            >
              <img
                src={photo.thumb ?? photo.src}
                alt={photo.description ?? ''}
                loading="lazy"
              />
              <div className="photo-masonry-overlay" />
              {isSelectionMode && !isLocked && (
                <div className={`photo-select-badge${isSelected ? ' photo-select-badge--active' : ''}`}>
                  {isSelected && <Check size={16} strokeWidth={3} aria-hidden="true" />}
                </div>
              )}
              {photo.description && !isSelectionMode && (
                <div className="photo-masonry-desc">{photo.description}</div>
              )}
            </motion.div>
          )
        })}
      </div>

      {totalPages > 1 && (
        <nav className="flex flex-wrap items-center justify-center gap-1" aria-label="Stránky fotek">
          <Button variant="ghost" size="icon" onClick={() => goToPage(page - 1)} disabled={page === 0} aria-label="Předchozí stránka">
            <ChevronLeft aria-hidden="true" />
          </Button>
          {Array.from({ length: totalPages }, (_, i) => (
            <Button
              key={i}
              variant="ghost"
              size="sm"
              className={cn('min-w-(--touch-target-min)', i === page && 'bg-accent text-primary')}
              onClick={() => goToPage(i)}
              aria-current={i === page ? 'page' : undefined}
            >
              {i + 1}
            </Button>
          ))}
          <Button variant="ghost" size="icon" onClick={() => goToPage(page + 1)} disabled={page === totalPages - 1} aria-label="Další stránka">
            <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      )}
    </div>
  )
}

/* ── Skeleton ─────────────────────────────────────────────────────────────── */
export function PhotoGridSkeleton() {
  const heights = ['h-44', 'h-60', 'h-40', 'h-72', 'h-48', 'h-56', 'h-40', 'h-64']
  return (
    <div className="columns-2 gap-3 md:columns-3 lg:columns-4" aria-busy="true">
      <span className="sr-only">Načítám fotky…</span>
      {heights.map((h, i) => (
        <div key={i} className={cn('skeleton mb-3 break-inside-avoid rounded-(--radius-lg)', h)} />
      ))}
    </div>
  )
}
