/**
 * features/admin/components/StagingFeedbackSection.tsx
 * „Zpětná vazba z testování“ ve Správě (#390): co testeři napsali v kartě „Co vyzkoušet“.
 * Jen na stagingu – pozná se stejně jako karta (neprázdné testovací účty); mimo staging
 * se nevykreslí a na endpoint se vůbec nesahá. Správce hlídá AdminPage, backend vrací jen jeho chatu.
 */
import { useId } from 'react'
import { FeatureErrorFallback } from '@/components/shared/FeatureErrorFallback'
import { useDemoAccounts } from '@/features/auth/hooks/useDemoAccounts'
import { useStagingFeedback } from '@/features/admin/hooks/useAdmin'
import { GENERAL_FEEDBACK_LABEL, TESTING_TASKS } from '@/features/staging/testingTasks'
import type { StagingFeedbackRecord } from '@/api/stagingFeedback'

/** Stejná hranice jako mobilní shell (`max-width: 768px` v styles/nav.css) */
const MOBILE_MAX_WIDTH = 768

function taskLabel(taskId: StagingFeedbackRecord['taskId']): string {
  return TESTING_TASKS.find((t) => t.id === taskId)?.title ?? GENERAL_FEEDBACK_LABEL
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function StagingFeedbackSection() {
  const isStaging = useDemoAccounts().length > 0
  if (!isStaging) return null
  return <StagingFeedbackCard />
}

function StagingFeedbackCard() {
  const { data: feedback = [], isLoading, isError, error, refetch } = useStagingFeedback()
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className="page-card admin-page-card admin-card" data-testid="admin-staging-feedback-section">
      <div className="admin-card-header">
        <div>
          <div className="admin-card-eyebrow">Jen na stagingu</div>
          <h2 id={headingId} className="admin-card-title">Zpětná vazba z testování</h2>
          <p className="admin-card-description">Co testeři napsali v kartě „Co vyzkoušet“, nejnovější nahoře.</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Načítám…</p>
      ) : isError ? (
        <FeatureErrorFallback
          error={error instanceof Error ? error : new Error('Nepodařilo se načíst zpětnou vazbu')}
          resetErrorBoundary={() => { void refetch() }}
          title="Zpětnou vazbu se nepodařilo načíst"
        />
      ) : feedback.length === 0 ? (
        <div className="admin-empty-state"><p>Zatím nikdo nic nenapsal</p></div>
      ) : (
        <ul className="grid max-h-[70vh] gap-3 overflow-y-auto">
          {feedback.map((item) => (
            <li key={item.id} className="rounded-xl bg-inset p-3 md:p-4">
              <p className="whitespace-pre-wrap break-words">{item.text}</p>
              <p className="mt-2 text-sm text-muted-foreground break-words">
                <strong className="text-foreground">{item.username}</strong>
                {' · '}{taskLabel(item.taskId)}
              </p>
              <p className="text-sm text-muted-foreground break-words">
                {item.screen} · {item.viewportWidth <= MOBILE_MAX_WIDTH ? 'Mobil' : 'Desktop'} ({item.viewportWidth} px) ·{' '}
                <time dateTime={item.createdAt}>{formatTime(item.createdAt)}</time>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
