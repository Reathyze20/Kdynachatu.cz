/**
 * components/shared/Toast.tsx
 * Globální toast systém — strukturované toasty s ikonou, close, copy support code.
 * Podporuje stacking (max 3) a Framer Motion animace. Papírová karta s tónovanou ikonou (DESIGN.md §1 a §2, #526).
 *
 * Naslouchá custom window eventu 'toast:show' s payloadem:
 *   { title: string; detail?: string; supportCode?: string; action?: ToastAction; type: ToastType }
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle, XCircle, Info, X, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ToastAction, ToastType } from '@/lib/toast'

interface ToastItem {
  id: number
  title: string
  detail?: string
  supportCode?: string
  action?: ToastAction
  type: ToastType
}

const MAX_TOASTS = 3
let nextId = 0

const ICONS: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
}

const ICON_COLOURS: Record<ToastType, string> = {
  success: 'text-(--status-success)',
  error: 'text-(--status-error)',
  info: 'text-(--status-info)',
}

const DURATIONS: Record<ToastType, number> = {
  success: 4000,
  error: 8000,
  info: 3500,
}
/** Toast s akcí („Zpět“) zůstane déle, aby se na akci dalo v klidu klepnout. */
const ACTION_DURATION = 8000

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    }).catch(() => {
      // Clipboard API failed — silently ignore
    })
  }, [text])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="-my-3 text-(--text-muted)"
      onClick={handleCopy}
      aria-label="Zkopírovat kód chyby"
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
    </Button>
  )
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem
  onDismiss: (id: number) => void
}) {
  const Icon = ICONS[item.type] ?? Info
  // Potvrzení čtečka přečte, až domluví; naléhavě jen chybu (#513).
  const isError = item.type === 'error'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.95, transition: { duration: 0.15, ease: 'easeIn' } }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-2xl border border-rule-soft bg-sheet p-4 text-(--text-main) shadow-(--shadow-lg)"
      data-testid="toast"
      data-toast-type={item.type}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      <Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${ICON_COLOURS[item.type] ?? ICON_COLOURS.info}`} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="m-0 text-card-title text-(--text-main)">{item.title}</p>
        {item.detail && <p className="m-0 text-meta text-(--text-muted)">{item.detail}</p>}
        {item.supportCode && (
          <span className="flex items-center gap-1 text-meta text-(--text-muted)">
            Kód: {item.supportCode}
            <CopyButton text={item.supportCode} />
          </span>
        )}
      </div>

      {item.action && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-my-2 shrink-0 self-center"
          onClick={() => {
            item.action?.onClick()
            onDismiss(item.id)
          }}
        >
          {item.action.label}
        </Button>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="-my-3 -mr-3 shrink-0 text-(--text-muted)"
        onClick={() => onDismiss(item.id)}
        aria-label="Zavřít notifikaci"
      >
        <X aria-hidden="true" />
      </Button>
    </motion.div>
  )
}

export function Toast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const { title, detail, supportCode, action, type } = (
        e as CustomEvent<{
          title: string
          detail?: string
          supportCode?: string
          action?: ToastAction
          type: ToastType
        }>
      ).detail

      const id = nextId++
      const newToast: ToastItem = { id, title, detail, supportCode, action, type }

      setToasts((prev) => {
        // FIFO: pokud překročíme limit, odstraníme nejstarší
        const updated = [...prev, newToast]
        if (updated.length > MAX_TOASTS) {
          const removed = updated.shift()
          if (removed) {
            const timer = timersRef.current.get(removed.id)
            if (timer) {
              clearTimeout(timer)
              timersRef.current.delete(removed.id)
            }
          }
        }
        return updated
      })

      // Auto-dismiss
      const duration = action ? ACTION_DURATION : (DURATIONS[type] ?? 3500)
      const timer = setTimeout(() => {
        dismiss(id)
      }, duration)
      timersRef.current.set(id, timer)
    }

    window.addEventListener('toast:show', handler)
    return () => {
      window.removeEventListener('toast:show', handler)
      // Cleanup all timers
      timersRef.current.forEach((timer) => clearTimeout(timer))
      timersRef.current.clear()
    }
  }, [dismiss])

  return (
    // Mobil nad spodní lištou, desktop vpravo dole; na stagingu nad kartou „Co vyzkoušet“ (#399, TestingChecklist).
    <div
      className="pointer-events-none fixed inset-x-3 bottom-[max(calc(80px_+_env(safe-area-inset-bottom,0px)),var(--testing-card-clearance,0px))] z-(--z-toast) flex flex-col-reverse gap-2 md:left-auto md:right-5 md:bottom-[max(20px,var(--testing-card-clearance,0px))] md:w-[calc(100%-40px)] md:max-w-[440px]"
      data-testid="toast-container"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} item={toast} onDismiss={dismiss} />
        ))}
      </AnimatePresence>
    </div>
  )
}
