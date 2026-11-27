/**
 * ConfirmDialog.tsx — Reusable confirmation dialog (replaces window.confirm)
 *
 * Usage:
 *   <ConfirmDialog
 *     isOpen={showConfirm}
 *     title="Smazat položku"
 *     message="Opravdu chceš tuto položku smazat?"
 *     confirmLabel="Smazat"
 *     danger
 *     onConfirm={handleConfirmedDelete}
 *     onCancel={() => setShowConfirm(false)}
 *   />
 */
import { Button } from '@/components/ui/button'
import { Modal } from './Modal'
import type { ReactNode } from 'react'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  errorMessage?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button style */
  danger?: boolean
  /** Loading state — disables buttons */
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  errorMessage,
  confirmLabel = 'Potvrdit',
  cancelLabel = 'Zrušit',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      maxWidth="max-w-sm"
      footer={
        <div className="modal-dialog-actions">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={loading} data-testid="confirm-dialog-cancel-button">
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            pending={loading}
            data-testid="confirm-dialog-confirm-button"
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-body text-(--text-main)" data-testid="confirm-dialog-message">{message}</p>
      {errorMessage ? (
        <div className="error-message show mt-3" role="alert" data-testid="confirm-dialog-error">
          {errorMessage}
        </div>
      ) : null}
    </Modal>
  )
}
