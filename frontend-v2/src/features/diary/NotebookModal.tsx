/**
 * NotebookModal.tsx — Zápisník pro konkrétní den pobytu
 * Obsahuje editor textu, přikládání fotek a navigaci mezi dny
 */
import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { DiaryEntry } from '@/api/diary'
import { useSaveDiaryEntry, useDeleteDiaryEntry } from './hooks/useDiary'
import { usePhotosByIds } from '@/features/gallery/hooks/useGallery'
import { GalleryPicker } from './GalleryPicker'
import { DiaryLightbox } from './DiaryLightbox'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/shared/Modal'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { getNetworkAwareActionMessage } from '@/lib/networkError'
import { formatLongDate, weekdayName } from '@/lib/format'
import { capitalize, toIsoDate } from '@/lib/dateUtils'

const MAX_CHARS = 20000

function samePhotoIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every(id => set.has(id))
}

/** „Sobota, 27. března 2027“. Den deníku je lokální `Date`, proto přes kalendářní den z lokálních složek. */
function formatNotebookDate(d: Date): string {
  const day = toIsoDate(d)
  return `${capitalize(weekdayName(day, 'long'))}, ${formatLongDate(day, { year: true })}`
}

interface Props {
  dateObj: Date
  entry: DiaryEntry | undefined
  folderId: string
  /** Všechna dostupná data složky (YYYY-MM-DD) pro prev/next navigaci */
  allDates: string[]
  onNavigate: (newDate: Date, newEntry: DiaryEntry | undefined) => void
  onClose: () => void
  onSaved: () => void
}

export function NotebookModal({ dateObj, entry, folderId, allDates, onNavigate, onClose, onSaved }: Props) {
  const [content, setContent] = useState(entry?.content ?? '')
  const [entryPhotoIds, setEntryPhotoIds] = useState<string[]>(entry?.galleryPhotoIds ?? [])
  const [showPickerModal, setShowPickerModal] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [contentError, setContentError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const saveEntry = useSaveDiaryEntry(folderId)
  const deleteEntry = useDeleteDiaryEntry(folderId)

  const { data: attachedPhotos = [] } = usePhotosByIds(entryPhotoIds)

  // Neuložené změny proti tomu, co je na serveru – jen ty se ukládají a jen kvůli nim se ptáme.
  // Nový den, kam přibyly jen mezery, je pořád prázdný den.
  const savedContent = entry?.content ?? ''
  const savedPhotoIds = entry?.galleryPhotoIds ?? []
  const photosChanged = !samePhotoIds(entryPhotoIds, savedPhotoIds)
  const isDirty = entry
    ? content !== savedContent || photosChanged
    : content.trim() !== '' || photosChanged

  // ── Navigace prev / next ─────────────────────────────────────────────────
  const dateKey = dateObj.toISOString().slice(0, 10)
  const currentIdx = allDates.indexOf(dateKey)
  const hasPrev = currentIdx > 0
  const hasNext = currentIdx < allDates.length - 1

  // Při změně záznamu (navigace prev/next) reiniciujem state
  useEffect(() => {
    setContent(savedContent)
    setEntryPhotoIds(savedPhotoIds)
    setSaveError(null)
    setContentError(null)
    setDeleteError(null)
    setDiscardConfirmOpen(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id, dateKey])

  /** Uloží jen skutečnou změnu; prázdný text server odmítne, tak ho ani neposíláme. */
  async function save(): Promise<boolean> {
    setSaveError(null)
    setContentError(null)
    if (!isDirty) return true
    if (content.trim() === '') {
      setContentError(entry?.id
        ? 'Zápis nemůže být prázdný. Napiš pár slov, nebo zápis smaž.'
        : 'Zápis nemůže být prázdný. Napiš pár slov, ať je co uložit.')
      return false
    }
    try {
      await saveEntry.mutateAsync({
        entryId: entry?.id ?? null,
        date: dateKey,
        content,
        galleryPhotoIds: entryPhotoIds,
      })
      return true
    } catch (error) {
      setSaveError(
        getNetworkAwareActionMessage(
          error,
          'Zápis se nepodařilo uložit. Zkus to znovu.',
          'Spojení vypadlo dřív, než se zápis stihl uložit. Zkus to znovu po obnovení připojení.',
        ),
      )
      return false
    }
  }

  async function handleSave() {
    const ok = await save()
    if (ok) onSaved()
  }

  // ×, Esc i klik mimo jdou sem. Esc v otevřeném potvrzení, výběru fotek nebo lightboxu zavírá jen to horní okno.
  function requestClose() {
    if (discardConfirmOpen || deleteConfirmOpen || showPickerModal || lightboxIndex !== null) return
    if (isDirty) setDiscardConfirmOpen(true)
    else onClose()
  }

  function handleDeleteClick() {
    if (!entry?.id) return
    setDeleteError(null)
    setDeleteConfirmOpen(true)
  }

  async function handleConfirmedDelete() {
    if (!entry?.id) return
    setDeleteError(null)
    try {
      await deleteEntry.mutateAsync(entry.id)
      setDeleteConfirmOpen(false)
      onSaved()
    } catch (error) {
      setDeleteError(
        getNetworkAwareActionMessage(
          error,
          'Zápis se nepodařilo smazat. Zkus to znovu.',
          'Spojení vypadlo dřív, než se zápis stihl smazat. Zkus to znovu po obnovení připojení.',
        ),
      )
    }
  }

  function removePhoto(id: string) {
    if (saveError) setSaveError(null)
    setEntryPhotoIds(prev => prev.filter(pid => pid !== id))
  }

  function handlePickerConfirm(newIds: string[]) {
    if (saveError) setSaveError(null)
    setEntryPhotoIds(prev => {
      const set = new Set(prev)
      for (const id of newIds) set.add(id)
      return [...set]
    })
    setShowPickerModal(false)
  }

  async function navigate(direction: 'prev' | 'next') {
    // Změněný den se před přechodem uloží, nezměněný projde bez requestu.
    // Druhé klepnutí během ukládání by poslalo zápis znovu (u nového dne duplicitně).
    if (saveEntry.isPending) return
    const ok = await save()
    if (!ok) return
    const idx = direction === 'prev' ? currentIdx - 1 : currentIdx + 1
    if (idx < 0 || idx >= allDates.length) return
    const newDateStr = allDates[idx]
    const newDate = new Date(newDateStr + 'T12:00:00')
    // Parent v DiaryPage najde entry z entryByDate Map a předá ji
    onNavigate(newDate, undefined)
  }

  const notebookTitle = (
    <div className="flex flex-1 items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate('prev')}
        disabled={!hasPrev || saveEntry.isPending}
        aria-label="Předchozí den"
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <span className="notebook-date flex-1 text-center">{formatNotebookDate(dateObj)}</span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate('next')}
        disabled={!hasNext || saveEntry.isPending}
        aria-label="Další den"
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  )

  return (
    <>
      <Modal
        isOpen={true}
        onClose={requestClose}
        title={notebookTitle}
        maxWidth="max-w-2xl"
        footer={
          // Jeden řádek i na mobilu: modal.css jinak tlačítka v patičce skládá pod sebe a patička by zabrala
          // půl bottom sheetu i s přiloženými fotkami. Smazat stojí vlevo, daleko od Uložit.
          <div className="flex w-full flex-row! flex-wrap items-center justify-end gap-2 [&>*]:w-auto!">
            {entry?.id && (
              <Button
                variant="ghost"
                className="mr-auto text-destructive"
                onClick={handleDeleteClick}
                disabled={deleteEntry.isPending}
                data-testid="diary-delete-entry-button"
              >
                Smazat zápis
              </Button>
            )}
            <Button variant="secondary" onClick={() => setShowPickerModal(true)} data-testid="diary-attach-photos-button">
              Fotky
            </Button>
            <Button onClick={handleSave} pending={saveEntry.isPending} data-testid="diary-save-entry-button">
              {saveEntry.isPending ? 'Ukládám…' : 'Uložit'}
            </Button>
          </div>
        }
      >
          {/* Zápisník papír */}
          <div className="notebook-paper">
            <div className="notebook-holes">
              <span /><span /><span />
            </div>
            <div className="notebook-body">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={e => {
                  if (saveError) setSaveError(null)
                  if (contentError) setContentError(null)
                  setContent(e.target.value.slice(0, MAX_CHARS))
                }}
                aria-invalid={contentError ? true : undefined}
                aria-describedby={contentError ? 'diary-entry-content-error' : undefined}
                placeholder="Napiš co se dnes dělo…"
                maxLength={MAX_CHARS}
                rows={12}
                data-testid="diary-entry-textarea"
              />
              <div className="char-counter">{content.length}/{MAX_CHARS}</div>
              {contentError ? (
                <div id="diary-entry-content-error" className="error-message show" role="alert">{contentError}</div>
              ) : null}
            </div>
          </div>

          {/* Přiložené fotky */}
          {attachedPhotos.length > 0 && (
            <div className="notebook-attachments">
              {attachedPhotos.map((photo, idx) => (
                <div key={photo.id} className="attachment-thumbnail-wrapper">
                  <img
                    className="attachment-thumbnail"
                    src={photo.thumb ?? photo.src}
                    alt={photo.description ?? ''}
                    onClick={() => setLightboxIndex(idx)}
                  />
                  <button
                    className="attachment-remove-btn"
                    onClick={() => removePhoto(photo.id)}
                    aria-label="Odebrat fotku"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {saveError ? (
            <div className="error-message show" role="alert">{saveError}</div>
          ) : null}
      </Modal>

      {/* Výběr fotek z galerie */}
      {showPickerModal && (
        <GalleryPicker
          currentEntryPhotoIds={entryPhotoIds}
          onConfirm={handlePickerConfirm}
          onClose={() => setShowPickerModal(false)}
        />
      )}

      {/* Lightbox pro přiložené fotky */}
      {lightboxIndex !== null && attachedPhotos.length > 0 && (
        <DiaryLightbox
          photos={attachedPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      <ConfirmDialog
        isOpen={discardConfirmOpen}
        title="Zavřít bez uložení?"
        message="V zápisníku máš neuložené změny. Když ho teď zavřeš, ztratíš je."
        confirmLabel="Zavřít bez uložení"
        cancelLabel="Pokračovat v psaní"
        danger
        onConfirm={() => {
          setDiscardConfirmOpen(false)
          onClose()
        }}
        onCancel={() => setDiscardConfirmOpen(false)}
      />

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Smazat zápis?"
        message="Zápis z tohoto dne se smaže a nejde vrátit. Fotky zůstanou v galerii."
        confirmLabel="Smazat"
        danger
        loading={deleteEntry.isPending}
        errorMessage={deleteError}
        onConfirm={handleConfirmedDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false)
          setDeleteError(null)
        }}
      />
    </>
  )
}
