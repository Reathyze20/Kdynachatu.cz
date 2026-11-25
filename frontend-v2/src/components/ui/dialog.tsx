/**
 * Dialog — primitivum Radix pro `shared/Modal` (DESIGN.md §6). Obrazovky ho přímo nepoužívají:
 * vzhled, pozadí, křížek a bottom sheet do 640 px dává `Modal` (`styles/modal.css`).
 */
import * as DialogPrimitive from '@radix-ui/react-dialog'

const Dialog = DialogPrimitive.Root
const DialogContent = DialogPrimitive.Content
const DialogTitle = DialogPrimitive.Title

export { Dialog, DialogContent, DialogTitle }
