/**
 * components/layout/LogoutPendingChangesDialog.tsx
 * Dotaz před odhlášením, když v offline frontě čekají neodeslané změny (#537). Stav a akce dodává
 * `useLogout()`; dialog jen vykreslí text s počtem změn a tři volby (DESIGN.md §6, Modal + Button).
 */
import { Modal } from '@/components/shared/Modal'
import { Button } from '@/components/ui/button'
import { formatCount, pluralize } from '@/lib/utils'
import type { LogoutPendingChangesDialogProps } from '@/hooks/useLogout'

export function LogoutPendingChangesDialog({
  isOpen,
  pendingCount,
  sending,
  error,
  onSend,
  onDiscard,
  onCancel,
}: LogoutPendingChangesDialogProps) {
  const verb = pluralize(pendingCount, 'se ještě neodeslala', 'se ještě neodeslaly', 'se ještě neodeslalo')
  const unsent = `${formatCount(pendingCount, 'změna', 'změny', 'změn')} ${verb}`

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!sending) onCancel()
      }}
      title="Neodeslané změny"
      maxWidth="max-w-sm"
      persistent={sending}
      footer={
        <div className="modal-dialog-actions">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={sending} data-testid="logout-pending-cancel-button">
            Zrušit
          </Button>
          <Button type="button" variant="danger" onClick={onDiscard} disabled={sending} data-testid="logout-pending-discard-button">
            Zahodit a odhlásit
          </Button>
          <Button type="button" onClick={onSend} pending={sending} data-testid="logout-pending-send-button">
            {sending ? 'Odesílám…' : 'Odeslat a odhlásit'}
          </Button>
        </div>
      }
    >
      <p className="text-body text-(--text-main)" data-testid="logout-pending-message">
        {unsent}. Odešli je, nebo je zahoď. Zahozené změny se už neuloží.
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-label text-(--status-error)" data-testid="logout-pending-error">
          {error}
        </p>
      ) : null}
    </Modal>
  )
}
