/**
 * Modal.tsx — Unified, reusable modal component
 *
 * Renders into a React portal attached to document.body.
 * Provides consistent SaaS-grade look: glassmorphism backdrop, white rounded card,
 * structured header/body/footer zones, Escape key & backdrop click to close.
 * Entrance/exit animations via framer-motion. Do 640 px bottom sheet (DESIGN.md §6).
 *
 * Stojí na primitivu ui/dialog (Radix): titulek je přístupné jméno, Esc zavře jen horní dialog,
 * Tab zůstává v dialogu, focus jde na první pole a po zavření zpět; `persistent` blokuje Esc i pozadí.
 * Radix běží s modal={false}: modální režim by schoval (aria-hidden) a vypnul (pointer-events)
 * zbytek stránky i s toasty a lightboxem nad zápisníkem deníku. Pozadí a zámek scrollu řeší Modal.
 *
 * Usage:
 *   <Modal isOpen={open} onClose={close} title="Edit Item" footer={<buttons/>}>
 *     <form>...</form>
 *   </Modal>
 */
import { useEffect, useState, type ReactNode, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

/** Pozadí je zároveň obsah dialogu Radixu (role, Esc, focus); karta je jen vzhled uvnitř. */
const MotionDialogContent = motion.create(DialogContent)
const FIRST_FIELD = 'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [autofocus]'

export interface ModalProps {
  /** Controls visibility */
  isOpen: boolean
  /** Called when user clicks backdrop, presses Escape, or clicks close button */
  onClose: () => void
  /** Header title text or JSX */
  title: ReactNode
  /** Modal body content */
  children: ReactNode
  /** Optional footer (action buttons) */
  footer?: ReactNode
  /** Tailwind max-width class — default "max-w-lg" */
  maxWidth?: string
  /** If true, the modal will not close on backdrop click */
  persistent?: boolean
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const cardVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 15 },
  visible: { opacity: 1, scale: 1, y: 0 },
}

const overlayTransition = { duration: 0.2, ease: 'easeOut' as const }
const cardTransition = { duration: 0.25, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }

export function Modal(props: ModalProps) {
  const { isOpen, onClose } = props
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }} modal={false}>
      <ModalLayer {...props} />
    </Dialog>
  )
}

function ModalLayer({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'max-w-lg',
  persistent = false,
}: ModalProps) {
  // Kam vrátit focus: prvek aktivní při otevření, ještě než autoFocus nebo Radix focus přesune.
  const [wasOpen, setWasOpen] = useState(isOpen)
  const [returnFocusTo, setReturnFocusTo] = useState<Element | null>(null)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) setReturnFocusTo(document.activeElement)
  }

  // Lock body scroll
  useEffect(() => {
    if (!isOpen) return

    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  function focusFirstField(e: Event) {
    e.preventDefault()
    const layer = e.currentTarget as HTMLElement
    ;(layer.querySelector<HTMLElement>(FIRST_FIELD) ?? layer).focus()
  }

  function returnFocus(e: Event) {
    e.preventDefault()
    if (returnFocusTo instanceof HTMLElement && returnFocusTo.isConnected) returnFocusTo.focus()
  }

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (!persistent && e.target === e.currentTarget) onClose()
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <MotionDialogContent
          forceMount
          className="modal-unified-overlay"
          onClick={handleBackdropClick}
          aria-modal="true"
          aria-describedby={undefined}
          onOpenAutoFocus={focusFirstField}
          onCloseAutoFocus={returnFocus}
          onEscapeKeyDown={(e) => { if (persistent) e.preventDefault() }}
          // Klik na pozadí řeší handleBackdropClick; klik do toastu nebo lightboxu dialog nezavírá.
          onInteractOutside={(e) => e.preventDefault()}
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={overlayTransition}
          data-testid="modal-overlay"
          data-modal-persistent={persistent ? 'true' : 'false'}
        >
          <motion.div
            className={`modal-unified-card ${maxWidth}`}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={cardTransition}
            data-testid="modal-card"
          >
            {/* Header */}
            <div className="modal-unified-header">
              <DialogTitle asChild>
                <h3 className="modal-unified-title" data-testid="modal-title">{title}</h3>
              </DialogTitle>
              <button
                type="button"
                className="modal-unified-close"
                onClick={onClose}
                aria-label="Zavřít"
                data-testid="modal-close-button"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            {/* Body */}
            <div className="modal-unified-body" data-testid="modal-body">
              {children}
            </div>

            {/* Footer (optional) */}
            {footer && (
              <div className="modal-unified-footer" data-testid="modal-footer">
                {footer}
              </div>
            )}
          </motion.div>
        </MotionDialogContent>
      )}
    </AnimatePresence>,
    document.body
  )
}
