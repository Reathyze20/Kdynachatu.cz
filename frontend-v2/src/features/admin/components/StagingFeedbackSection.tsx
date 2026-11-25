/**
 * features/admin/components/StagingFeedbackSection.tsx
 * „Zpětná vazba z testování“ ve Správě (#390): co testeři napsali v kartě „Co vyzkoušet“.
 * Jen na stagingu – pozná se stejně jako karta (neprázdné testovací účty); mimo staging
 * se nevykreslí a na endpoint se vůbec nesahá. Správce hlídá AdminPage, backend vrací jen jeho chatu.
 */
import { useId } from 'react'
import { MessageSquare } from 'lucide-react'
import { Card } from '@/components/shared/Card'
import { EmptyState } from '@/components/shared/EmptyState'
import { FeatureErrorFallback } from '@/components/shared/FeatureErrorFallback'
import { useDemoAccounts } from '@/features/auth/hooks/useDemoAccounts'
import { useStagingFeedback } from '@/features/admin/hooks/useAdmin'
import { GENERAL_FEEDBACK_LABEL, TESTING_TASKS } from '@/features/staging/testingTasks'
import type { StagingFeedbackRecord } from '@/api/stagingFeedback'
import { formatDate, formatTime } from '@/lib/format'
import { AdminCardHeading } from './AdminCardHeading'

/** Stejná hranice jako mobilní shell (`max-width: 768px` v styles/nav.css) */
const MOBILE_MAX_WIDTH = 768

function taskLabel(taskId: StagingFeedbackRecord['taskId']): string {
  return TESTING_TASKS.find((t) => t.id === taskId)?.title ?? GENERAL_FEEDBACK_LABEL
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
    <Card as="section" aria-labelledby={headingId} data-testid="admin-staging-feedback-section">
      <AdminCardHeading
        eyebrow="Jen na stagingu"
        title="Zpětná vazba z testování"
        titleId={headingId}
        description="Co testeři napsali v kartě „Co vyzkoušet“, nejnovější nahoře."
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Načítám…</p>
      ) : isError ? (
        <FeatureErrorFallback
          bare
          error={error instanceof Error ? error : new Error('Nepodařilo se načíst zpětnou vazbu')}
          resetErrorBoundary={() => { void refetch() }}
          title="Zpětnou vazbu se nepodařilo načíst"
        />
      ) : feedback.length === 0 ? (
        <EmptyState icon={MessageSquare} message="Zatím nikdo nic nenapsal" />
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
                <time dateTime={item.createdAt}>{formatDate(item.createdAt)} {formatTime(item.createdAt)}</time>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
