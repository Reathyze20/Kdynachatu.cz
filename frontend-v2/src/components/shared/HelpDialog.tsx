/**
 * components/shared/HelpDialog.tsx
 * Nápověda k právě otevřené stránce (#510). Otevírá se z menu Víc na mobilu, ze sidebaru na desktopu
 * a ze šuplíku profilu (#524). Plovoucí tlačítko, které překrývalo obsah, DESIGN.md nechce.
 */
import { useLocation } from 'react-router-dom'
import { Modal } from './Modal'
import { helpForLocation } from './helpContent'

/** Texty z helpContent jsou holé h3/p/ul: role z typové škály, zvýraznění jen tučně (jeden akcent, DESIGN.md §2–§3). */
const HELP_BODY_CLASS =
  'text-body text-(--text-main) [&_h3]:mb-3 [&_h3]:text-card-title [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:pl-5 [&_li]:mb-2 [&>:last-child]:mb-0'

interface HelpDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function HelpDialog({ isOpen, onClose }: HelpDialogProps) {
  const location = useLocation()

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nápověda k této stránce" maxWidth="max-w-xl">
      <div id="help-modal-content" className={HELP_BODY_CLASS}>
        {helpForLocation(location)}
      </div>
    </Modal>
  )
}
