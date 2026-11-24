/**
 * features/staging/TestingChecklist.tsx
 * Karta „Co vyzkoušet“ (#388): provede testera na stagingu aplikací. Jen na stagingu –
 * pozná se stejně jako testovací účty na přihlašovací obrazovce (backend je vydá jen tam).
 *
 * Plovoucí mini-karta (#399) vpravo dole, na mobilu nad lištou a nápovědou (help.css) – nic neodsouvá.
 * Jeden úkol, šipky přepínají, „Hotovo“ posune na další nehotový. Rozbalená, dokud není vše hotové;
 * sbalení si pamatuje prohlížeč. „Ukaž mi kde“ ji nechá otevřenou. Zpětná vazba (#389) až na kliknutí.
 */
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { useDemoAccounts } from '@/features/auth/hooks/useDemoAccounts'
import { cn } from '@/lib/utils'
import { FeedbackField } from './FeedbackField'
import { GENERAL_FEEDBACK_LABEL, TESTING_TASKS, allTasksDone, nextUndoneIndex, readCollapsed, readDoneTasks, writeCollapsed, writeDoneTasks } from './testingTasks'

export function TestingChecklist() {
  // Testovací účty vydá backend jen na stagingu – neprázdný seznam = staging
  const isStaging = useDemoAccounts().length > 0
  if (!isStaging) return null
  return <TestingChecklistCard />
}

function TestingChecklistCard() {
  const { user } = useAuth()
  const userId = user?.userId
  const [done, setDone] = useState<string[]>(() => readDoneTasks(userId))
  const [open, setOpenState] = useState(() => !allTasksDone(done) && !readCollapsed(userId))
  const [index, setIndex] = useState(() => nextUndoneIndex(done))
  const [feedback, setFeedback] = useState<'task' | 'general' | null>(null)
  const headingId = useId()
  const cardRef = useRef<HTMLDivElement>(null)

  // Toasty (toast.css) se zvednou nad kartu: vzdálenost její horní hrany od spodku okna + mezera.
  // Jen když je karta dole – ne skrytá ani nahoře (chat, help.css); pozici mění i třídy na <body>.
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const root = document.documentElement
    const update = () => {
      const { top, bottom } = el.getBoundingClientRect()
      if (el.offsetHeight === 0 || window.innerHeight - bottom > 200) root.style.removeProperty('--testing-card-clearance')
      else root.style.setProperty('--testing-card-clearance', `${Math.ceil(window.innerHeight - top + 8)}px`)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    const bodyClass = new MutationObserver(update)
    bodyClass.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => {
      observer.disconnect()
      bodyClass.disconnect()
      root.style.removeProperty('--testing-card-clearance')
    }
  }, [open])

  const total = TESTING_TASKS.length
  const task = TESTING_TASKS[index]
  const taskDone = done.includes(task.id)
  const progress = `${done.length}/${total}`

  const setOpen = (next: boolean) => {
    setOpenState(next)
    writeCollapsed(userId, !next)
  }
  const goTo = (i: number) => {
    setIndex((i + total) % total)
    setFeedback(null)
  }
  const saveDone = (next: string[]) => {
    setDone(next)
    writeDoneTasks(userId, next)
  }
  const markDone = () => {
    const next = [...done, task.id]
    saveDone(next)
    if (allTasksDone(next)) setOpen(false)
    else goTo(nextUndoneIndex(next, index))
  }

  if (!open) {
    return (
      <div ref={cardRef} className="testing-card testing-card--collapsed">
        <Button
          type="button"
          variant="secondary"
          className="rounded-full bg-sheet shadow-lift"
          aria-expanded={false}
          onClick={() => setOpen(true)}
          data-testid="testing-checklist-toggle"
        >
          <ClipboardList aria-hidden="true" />
          Co vyzkoušet · {progress}
        </Button>
      </div>
    )
  }

  return (
    <div ref={cardRef} className="testing-card">
      <section
        aria-labelledby={headingId}
        className="testing-card__panel rounded-2xl border border-rule-soft bg-sheet p-3 shadow-lift"
        data-testid="testing-checklist"
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="text-sm font-semibold">Co vyzkoušet</h2>
            <p className="text-sm text-muted-foreground" aria-live="polite">Úkol {index + 1} ze {total}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Předchozí úkol" onClick={() => goTo(index - 1)}><ChevronLeft aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Další úkol" onClick={() => goTo(index + 1)}><ChevronRight aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Sbalit Co vyzkoušet" aria-expanded onClick={() => setOpen(false)}><ChevronDown aria-hidden="true" /></Button>
        </div>
        <p className={cn('mt-1 font-medium', taskDone && 'text-muted-foreground line-through')}>{task.title}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {task.places.map((place) => (
            <Button key={place.to} asChild variant="secondary" size="sm">
              <Link to={place.to}>{place.name ? `Ukaž mi kde: ${place.name}` : 'Ukaž mi kde'}</Link>
            </Button>
          ))}
          {taskDone ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => saveDone(done.filter((id) => id !== task.id))}><Undo2 aria-hidden="true" />Vrátit odškrtnutí</Button>
          ) : (
            <Button type="button" size="sm" onClick={markDone}><Check aria-hidden="true" />Hotovo</Button>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" className="px-2" aria-expanded={feedback === 'task'} onClick={() => setFeedback(feedback === 'task' ? null : 'task')}>
            Napsat, co nešlo
          </Button>
          <Button type="button" variant="ghost" size="sm" className="px-2" aria-expanded={feedback === 'general'} onClick={() => setFeedback(feedback === 'general' ? null : 'general')}>
            {GENERAL_FEEDBACK_LABEL}
          </Button>
        </div>
        {feedback === 'task' && <FeedbackField key={task.id} taskId={task.id} label="Co ti nešlo / co ti chybí?" />}
        {feedback === 'general' && <FeedbackField taskId="general" label={GENERAL_FEEDBACK_LABEL} />}
      </section>
    </div>
  )
}
