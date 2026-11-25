import { FeatureErrorFallback } from '@/components/shared/FeatureErrorFallback'
import { useSystemInfo } from '@/features/admin/hooks/useAdmin'

export function SystemStatsPanel() {
  const { data, isLoading, isError, error, refetch } = useSystemInfo()

  if (isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-2" data-testid="system-stats-panel" data-system-stats-state="loading">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="skeleton h-28 rounded-xl" />
        ))}
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div data-testid="system-stats-panel" data-system-stats-state="error">
        <FeatureErrorFallback
          error={error instanceof Error ? error : new Error('Nepodařilo se načíst statistiky')}
          resetErrorBoundary={() => {
            void refetch()
          }}
          title="Statistiky se nepodařilo načíst"
        />
      </div>
    )
  }

  const stats = [
    { label: 'Uživatelé', value: data.userCount, meta: 'Všichni s přístupem do chaty', tone: 'users' },
    { label: 'Rezervace', value: data.reservationCount, meta: 'Všechna uložená obsazení', tone: 'reservations' },
    { label: 'Fotky', value: data.photoCount, meta: 'Galerie a vzpomínky', tone: 'photos' },
    { label: 'Zprávy', value: data.noteCount, meta: 'Chat a nástěnka', tone: 'messages' },
  ]

  return (
    <div id="sys-info-content" className="grid gap-3 md:grid-cols-2" data-testid="system-stats-panel" data-system-stats-state="ready">
      {stats.map((stat) => (
        <div key={stat.label} className="grid content-start gap-1 rounded-xl bg-inset p-3 md:p-4" data-testid="system-stat-card" data-stat-tone={stat.tone}>
          <div className="text-eyebrow uppercase text-(--text-muted)">{stat.label}</div>
          <div className="text-page-title text-(--text-main)">{stat.value}</div>
          <div className="text-label text-(--text-muted)">{stat.meta}</div>
        </div>
      ))}
    </div>
  )
}