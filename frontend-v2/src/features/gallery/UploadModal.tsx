/**
 * UploadModal.tsx — Upload modal with drag & drop, file previews, progress
 * Fotky se nahrávají po jedné (#515); nenahrané zůstanou v modálu a jdou poslat znovu.
 */
import { useState, useRef, useMemo, useEffect } from 'react'
import { useUploadPhotosOneByOne, type PhotoUploadOutcome } from './hooks/useGallery'
import { showToast } from '@/lib/toast'
import { formatCount, formatPercent, pluralize } from '@/lib/format'
import { Modal } from '@/components/shared/Modal'
import { Upload, ImagePlus, X } from 'lucide-react'

interface Props {
  folderId: string
  onClose: () => void
}

/** Souhrn po dávce, ve které se některé fotky nenahrály. */
function failureMessage({ failed, networkFailure }: PhotoUploadOutcome): string {
  const what = `${formatCount(failed.length, 'fotku', 'fotky', 'fotek')} se nepodařilo nahrát.`
  return networkFailure
    ? `${what} Spojení vypadlo, zkus to znovu po obnovení připojení.`
    : `${what} Zkus to znovu.`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function UploadModal({ folderId, onClose }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { upload, progress, isUploading } = useUploadPhotosOneByOne(folderId)

  const previews = useMemo(
    () => files.map(f => ({ name: f.name, size: f.size, url: URL.createObjectURL(f) })),
    [files],
  )

  // Revoke old object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      previews.forEach(p => URL.revokeObjectURL(p.url))
    }
  }, [previews])

  // Během nahrávání se seznam fotek nemění: dávka běží nad seznamem z okamžiku odeslání.
  function pickFiles() {
    if (!isUploading) inputRef.current?.click()
  }

  function addFiles(newFiles: FileList | null) {
    if (!newFiles || isUploading) return
    const incoming = Array.from(newFiles).filter(f => f.type.startsWith('image/'))
    if (incoming.length === 0) {
      showToast('Povoleny jsou pouze obrázky.', 'error')
      return
    }
    setSubmitError(null)
    setFiles(prev => [...prev, ...incoming])
  }

  function removeFile(idx: number) {
    setSubmitError(null)
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    addFiles(e.dataTransfer.files)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!files.length) return
    setSubmitError(null)
    const outcome = await upload(files)
    if (outcome.uploaded > 0) {
      const verb = pluralize(outcome.uploaded, 'Nahrána', 'Nahrány', 'Nahráno')
      showToast(`${verb} ${formatCount(outcome.uploaded, 'fotka', 'fotky', 'fotek')}.`, 'success')
    }
    if (outcome.failed.length === 0) {
      onClose()
      return
    }
    setFiles(outcome.failed)
    setSubmitError(failureMessage(outcome))
  }

  const totalSize = files.reduce((sum, f) => sum + f.size, 0)

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      persistent={isUploading}
      title="Nahrát fotky"
      maxWidth="max-w-md"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {files.length > 0 && `${files.length} souborů · ${formatSize(totalSize)}`}
          </span>
          <button
            type="submit"
            form="upload-photo-form"
            className="btn-primary"
            disabled={isUploading || files.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            data-testid="gallery-upload-submit-button"
          >
            <Upload size={16} />
            {isUploading ? 'Nahrávám…' : submitError ? 'Zkusit znovu' : 'Nahrát'}
          </button>
        </div>
      }
    >
      <form id="upload-photo-form" onSubmit={handleSubmit} data-testid="gallery-upload-form">
        {/* Drop zone */}
        <div
          className={`upload-dropzone${isDragging ? ' upload-dropzone--active' : ''}${files.length > 0 ? ' upload-dropzone--has-files' : ''}`}
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={pickFiles}
          data-testid="gallery-upload-dropzone"
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={e => { addFiles(e.target.files); if (inputRef.current) inputRef.current.value = '' }}
            style={{ display: 'none' }}
            data-testid="gallery-upload-file-input"
          />
          <ImagePlus size={28} strokeWidth={1.5} style={{ color: isDragging ? 'var(--brand-primary)' : 'var(--text-placeholder)' }} />
          <p className="upload-dropzone__text">
            {isDragging ? 'Pusť soubory sem' : 'Přetáhni fotky sem'}
          </p>
          <span className="upload-dropzone__subtext">nebo klikni pro výběr</span>
        </div>

        {/* File previews */}
        {files.length > 0 && (
          <div className="upload-previews" data-testid="gallery-upload-previews">
            {previews.map((p, i) => (
              <div key={`${p.name}-${i}`} className="upload-preview-item" data-testid="gallery-upload-preview-item" data-file-index={String(i)}>
                <img src={p.url} alt={p.name} />
                <button
                  type="button"
                  className="upload-preview-remove"
                  onClick={e => { e.stopPropagation(); removeFile(i) }}
                  disabled={isUploading}
                  aria-label={`Odebrat ${p.name}`}
                  data-testid="gallery-upload-remove-file-button"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <div
              className="upload-preview-add"
              onClick={e => { e.stopPropagation(); pickFiles() }}
              data-testid="gallery-upload-add-more-button"
            >
              <ImagePlus size={20} strokeWidth={1.5} />
            </div>
          </div>
        )}

        {/* Upload progress */}
        {progress && (
          <div className="mt-3 grid gap-1" data-testid="gallery-upload-progress">
            <div className="flex justify-between gap-3 text-meta text-(--text-muted)" aria-live="polite">
              <span>Nahrávám {progress.current} z {progress.total}…</span>
              <span>{formatPercent(progress.percent)}</span>
            </div>
            <progress
              value={progress.percent}
              max={100}
              aria-label="Průběh nahrávání aktuální fotky"
              className="h-2 w-full appearance-none overflow-hidden rounded-full border-0 bg-inset [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-inset [&::-webkit-progress-value]:bg-primary"
            />
          </div>
        )}
        {submitError ? (
          <div className="error-message show" role="alert" data-testid="gallery-upload-error">{submitError}</div>
        ) : null}
      </form>
    </Modal>
  )
}
