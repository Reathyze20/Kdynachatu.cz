/**
 * features/staging/FeedbackField.tsx
 * Pole zpětné vazby v kartě „Co vyzkoušet“ (#389) – u úkolu nebo obecné („general“). Pošle text
 * s obrazovkou a šířkou okna; po úspěchu poděkuje a vyprázdní se, při chybě text v poli nechá.
 */
import { useId, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { stagingFeedbackApi, type StagingFeedbackTaskId } from '@/api/stagingFeedback'
import { handleMutationError } from '@/lib/mutationError'

interface FeedbackFieldProps {
  taskId: StagingFeedbackTaskId
  label: string
}

export function FeedbackField({ taskId, label }: FeedbackFieldProps) {
  const fieldId = useId()
  const { pathname } = useLocation()
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  // Bez offline fronty (lib/offlineQueue.ts): bez signálu skončí chybou a text zůstane v poli
  const send = useMutation({
    mutationFn: stagingFeedbackApi.send,
    onSuccess: () => {
      setText('')
      setStatus('saved')
    },
    onError: (err: Error) => {
      handleMutationError('Zpětnou vazbu se nepodařilo odeslat', { component: 'FeedbackField', silent: true })(err)
      setStatus('error')
    },
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (trimmed && !send.isPending) send.mutate({ taskId, text: trimmed, screen: pathname, viewportWidth: window.innerWidth })
  }

  return (
    <form className="mt-2 grid gap-1.5" onSubmit={onSubmit}>
      <label htmlFor={fieldId} className="text-sm font-medium">{label}</label>
      <textarea
        id={fieldId}
        rows={2}
        maxLength={2000} // shodně se Zod schématem na backendu
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setStatus('idle')
        }}
        className="min-h-(--touch-target-min) w-full min-w-0 resize-y rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="outline" size="sm" disabled={!text.trim() || send.isPending}>
          {send.isPending ? 'Odesílám…' : 'Odeslat'}
        </Button>
        {status === 'saved' && <p role="status" className="text-sm font-medium text-green-600">Díky, uloženo</p>}
        {status === 'error' && <p role="alert" className="text-sm text-destructive">Nepodařilo se odeslat. Text zůstal v poli, zkus to znovu.</p>}
      </div>
    </form>
  )
}
