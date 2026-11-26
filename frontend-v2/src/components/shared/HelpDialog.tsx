/**
 * components/shared/HelpDialog.tsx
 * Nápověda k právě otevřené stránce (#510). Otevírá se z menu Víc na mobilu, ze sidebaru na desktopu
 * a ze šuplíku profilu (#524). Plovoucí tlačítko, které překrývalo obsah, DESIGN.md nechce.
 */
import { useLocation } from 'react-router-dom'
import { Modal } from './Modal'
import { helpForLocation } from './helpContent'

interface HelpDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function HelpDialog({ isOpen, onClose }: HelpDialogProps) {
  const location = useLocation()

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nápověda k této stránce" maxWidth="max-w-xl">
      <div id="help-modal-content" className="help-modal-body">
        {helpForLocation(location)}
      </div>
    </Modal>
  )
}
