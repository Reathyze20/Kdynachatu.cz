/**
 * Modal.tsx — sdílený dialog a krátký formulář (DESIGN.md §6)
 *
 * Stojí na primitivu `ui/dialog` (Radix): titulek je přístupné jméno, Esc zavře jen horní dialog,
 * Tab zůstává v dialogu, focus jde dovnitř (na první pole) a po zavření zpět. Klik na pozadí zavře,
 * `persistent` blokuje Esc i pozadí. Do 640 px bottom sheet (`styles/modal.css`).
 *
 * Radix běží s `modal={false}`: modální režim by schoval zbytek stránky čtečce (aria-hidden)
 * i ukazateli (pointer-events), a s ním toasty a lightbox otevřený nad zápisníkem deníku.
 * Pozadí, zámek scrollu a `aria-modal` proto řeší Modal sám.
 *
 * Usage:
 *   <Modal isOpen={open} onClose={close} title="Upravit položku" footer={<buttons/>}>
 *     <form>...</form>
 *   </Modal>
 */
import { useLayoutEffect, useRef, type ReactNode, type MouseEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { Dialog, DialogClose, DialogContent, DialogPortal, DialogTitle } from '@/components/ui/dialog'

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

/** První pole formuláře dostane focus po otevření, jinak karta (čtečka přečte titulek). */
const FIRST_FIELD = 'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [autofocus]'

const overlayTransition = { duration: 0.2, ease: 'easeOut' as const }
const cardTransition = { duration: 0.25, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'max-w-lg',
  persistent = false,
}: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  // Zapamatuje focus před otevřením (portál Radixu vykreslí obsah až v dalším commitu) a zamkne scroll.
  useLayoutEffect(() => {
    if (!isOpen) return
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  function focusFirstField(e: Event) {
    e.preventDefault()
    const card = cardRef.current
    const field = card?.querySelector<HTMLElement>(FIRST_FIELD)
    ;(field ?? card)?.focus()
  }

  function returnFocus(e: Event) {
    e.preventDefault()
    if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus()
  }

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (!persistent && e.target === e.currentTarget) onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }} modal={false}>
      <AnimatePresence>
        {isOpen && (
          <DialogPortal forceMount>
            <motion.div
              className="modal-unified-overlay"
              onClick={handleBackdropClick}
              variants={overlayVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={overlayTransition}
              data-testid="modal-overlay"
              data-modal-persistent={persistent ? 'true' : 'false'}
            >
              <DialogContent
                forceMount
                asChild
                aria-modal="true"
                aria-describedby={undefined}
                onOpenAutoFocus={focusFirstField}
                onCloseAutoFocus={returnFocus}
                onEscapeKeyDown={(e) => { if (persistent) e.preventDefault() }}
                // Klik na pozadí řeší handleBackdropClick, klik do toastu nebo lightboxu dialog nezavírá.
                onInteractOutside={(e) => e.preventDefault()}
              >
                <motion.div
                  ref={cardRef}
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
                    <DialogClose asChild>
                      <button
                        type="button"
                        className="modal-unified-close"
                        aria-label="Zavřít"
                        data-testid="modal-close-button"
                      >
                        <X size={20} strokeWidth={2.5} />
                      </button>
                    </DialogClose>
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
              </DialogContent>
            </motion.div>
          </DialogPortal>
        )}
      </AnimatePresence>
    </Dialog>
  )
}
