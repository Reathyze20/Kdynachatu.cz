/**
 * Dialog — primitivum Radix pro `shared/Modal` (DESIGN.md §6). Obrazovky ho přímo nepoužívají:
 * vzhled, pozadí, křížek a bottom sheet do 640 px dává `Modal` (`styles/modal.css`).
 */
import * as DialogPrimitive from '@radix-ui/react-dialog'

const Dialog = DialogPrimitive.Root
const DialogPortal = DialogPrimitive.Portal
const DialogContent = DialogPrimitive.Content
const DialogTitle = DialogPrimitive.Title
const DialogClose = DialogPrimitive.Close

export { Dialog, DialogPortal, DialogContent, DialogTitle, DialogClose }
