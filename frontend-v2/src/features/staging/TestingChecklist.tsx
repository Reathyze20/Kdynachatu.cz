/**
 * features/staging/TestingChecklist.tsx
 * Karta „Co vyzkoušet“ (#388): provede testera na stagingu aplikací. Jen na stagingu –
 * pozná se stejně jako testovací účty na přihlašovací obrazovce (backend je vydá jen tam).
 *
 * Po přihlášení (= připojení AppShell) se karta otevře sama, dokud nejsou všechny úkoly hotové,
 * jinak je sbalená do tlačítka. „Ukaž mi kde“ kartu sbalí, aby obrazovka byla vidět celá.
 * Karta je v toku stránky nad obsahem (ne plovoucí), takže nepřekrývá spodní lištu ani přehled.
 * Zpětná vazba (#389): pole u každého úkolu (`TestingTaskItem`) + obecné pole pod seznamem.
 */
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { useDemoAccounts } from '@/features/auth/hooks/useDemoAccounts'
import { FeedbackField } from './FeedbackField'
import { TESTING_TASKS, allTasksDone, readDoneTasks, writeDoneTasks, type TestingTask } from './testingTasks'

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
  const [open, setOpen] = useState(() => !allTasksDone(done))
  const headingId = useId()

  const toggleDone = (taskId: string) => {
    const next = done.includes(taskId) ? done.filter((id) => id !== taskId) : [...done, taskId]
    setDone(next)
    writeDoneTasks(userId, next)
  }

  const progress = `${done.length} z ${TESTING_TASKS.length}`

  if (!open) {
    return (
      <div className="flex shrink-0 justify-end px-3 pb-3 md:px-0">
        <Button
          type="button"
          variant="outline"
          className="rounded-full bg-sheet"
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
    <div className="shrink-0 px-3 pb-3 md:px-0">
      <section
        aria-labelledby={headingId}
        className="rounded-2xl border border-rule-soft bg-sheet p-4 shadow-lift md:p-5"
        data-testid="testing-checklist"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={headingId} className="text-lg font-semibold">Co vyzkoušet</h2>
            <p className="text-sm text-muted-foreground">
              Zkus tyhle věci a odškrtni, co máš hotové. Hotovo {progress}.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Zavřít seznam Co vyzkoušet"
            onClick={() => setOpen(false)}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <ol className="mt-3 grid max-h-[55vh] gap-2 overflow-y-auto md:max-h-[40vh] lg:grid-cols-2">
          {TESTING_TASKS.map((task, i) => (
            <TestingTaskItem
              key={task.id}
              task={task}
              order={i + 1}
              done={done.includes(task.id)}
              onToggleDone={() => toggleDone(task.id)}
              onShowWhere={() => setOpen(false)}
            />
          ))}
        </ol>
        <FeedbackField taskId="general" label="Cokoli dalšího" />
      </section>
    </div>
  )
}

interface TestingTaskItemProps {
  task: TestingTask
  order: number
  done: boolean
  onToggleDone: () => void
  onShowWhere: () => void
}

function TestingTaskItem({ task, order, done, onToggleDone, onShowWhere }: TestingTaskItemProps) {
  return (
    <li className="rounded-xl bg-inset p-3">
      <p className={done ? 'text-muted-foreground line-through' : undefined}>
        {order}. {task.title}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {task.places.map((place) => (
          <Button key={place.to} asChild variant="outline" size="sm">
            <Link to={place.to} onClick={onShowWhere}>
              {place.name ? `Ukaž mi kde: ${place.name}` : 'Ukaž mi kde'}
            </Link>
          </Button>
        ))}
        <label className="inline-flex min-h-(--touch-target-min) cursor-pointer items-center gap-2 px-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-5 accent-[var(--brand-primary)]"
            checked={done}
            onChange={onToggleDone}
            aria-label={`Hotovo: ${task.title}`}
          />
          Hotovo
        </label>
      </div>
      <FeedbackField taskId={task.id} label="Co ti nešlo / co ti chybí?" />
    </li>
  )
}
