/**
 * PromptDialog.tsx — Reusable single-input dialog (replaces window.prompt)
 *
 * Usage:
 *   <PromptDialog
 *     isOpen={showPrompt}
 *     title="Nové téma"
 *     label="Název tématu"
 *     placeholder="Např. Opravy na jaře"
 *     maxLength={100}
 *     onSubmit={(value) => createThread(value)}
 *     onCancel={() => setShowPrompt(false)}
 *   />
 */
import { useState, useEffect, useId, type HTMLInputTypeAttribute, type ReactNode } from 'react'
import { Modal } from './Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface PromptDialogProps {
  isOpen: boolean
  title: string
  description?: ReactNode
  errorMessage?: ReactNode
  label?: string
  initialValue?: string
  placeholder?: string
  maxLength?: number
  inputType?: HTMLInputTypeAttribute
  autoComplete?: string
  submitLabel?: string
  cancelLabel?: string
  danger?: boolean
  loading?: boolean
  loadingLabel?: string
  trimValue?: boolean
  canSubmit?: (value: string) => boolean
  onSubmit: (value: string) => void
  onCancel: () => void
}

export function PromptDialog({
  isOpen,
  title,
  description,
  errorMessage,
  label,
  initialValue = '',
  placeholder,
  maxLength,
  inputType = 'text',
  autoComplete,
  submitLabel = 'Vytvořit',
  cancelLabel = 'Zrušit',
  danger = false,
  loading = false,
  loadingLabel = '…',
  trimValue = true,
  canSubmit,
  onSubmit,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState('')
  const inputId = useId()
  const descriptionId = useId()
  const errorId = useId()
  const describedBy = [description && descriptionId, errorMessage && errorId].filter(Boolean).join(' ') || undefined
  const normalizedValue = trimValue ? value.trim() : value
  const canSubmitValue = canSubmit ? canSubmit(value) : Boolean(normalizedValue)

  useEffect(() => {
    if (isOpen) setValue(initialValue)
  }, [initialValue, isOpen])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmitValue) return
    onSubmit(normalizedValue)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      maxWidth="max-w-sm"
      footer={
        <div className="modal-dialog-actions">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            type="submit"
            form="prompt-dialog-form"
            variant={danger ? 'danger' : 'primary'}
            pending={loading}
            disabled={!canSubmitValue}
          >
            {loading ? loadingLabel : submitLabel}
          </Button>
        </div>
      }
    >
      <form id="prompt-dialog-form" onSubmit={handleSubmit}>
        {description && (
          <div id={descriptionId} className="mb-3 text-body text-(--text-main)">
            {description}
          </div>
        )}
        {label && (
          <label htmlFor={inputId} className="mb-1.5 block text-label text-(--text-muted)">
            {label}
          </label>
        )}
        <Input
          id={inputId}
          type={inputType}
          invalid={Boolean(errorMessage)}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete={autoComplete}
          aria-describedby={describedBy}
          autoFocus
        />
        {errorMessage ? (
          <p id={errorId} role="alert" className="mt-2 text-label text-(--status-error)">
            {errorMessage}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
