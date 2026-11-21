/**
 * OfflineBanner.tsx — Překlad #offline-banner z vanilla app.
 *
 * Zobrazuje se top-of-page pro celý AppShell když uživatel ztratí připojení.
 * Ukazuje i počet změn čekajících v offline frontě (lib/offlineQueue).
 * Používá VÝHRADNĚ originální CSS třídu `.offline-banner` z skeleton.css.
 * Žádné Tailwind, žádné shadcn; ikona z lucide-react (#165).
 *
 * CSS: src/styles/skeleton.css → .offline-banner
 */
import { useSyncExternalStore } from 'react'
import { WifiOff } from 'lucide-react'
import { useOnline } from '@/hooks/useOnline'
import { getQueueLength } from '@/lib/offlineQueue'

function subscribeQueue(callback: () => void) {
  window.addEventListener('offline-queue:changed', callback)
  return () => window.removeEventListener('offline-queue:changed', callback)
}

export function OfflineBanner() {
  const isOnline = useOnline()
  const pendingCount = useSyncExternalStore(subscribeQueue, getQueueLength, () => 0)

  if (isOnline) return null

  return (
    <div className="offline-banner" role="alert" aria-live="polite" data-testid="offline-banner">
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>
        {pendingCount > 0
          ? `Jste offline — ${pendingCount === 1 ? '1 změna čeká' : `${pendingCount} změny/změn čeká`} na odeslání. Po obnovení připojení se uloží automaticky.`
          : 'Jste offline — některé obrazovky poběží z naposledy načtených dat. Změny provedené offline se uloží po obnovení připojení.'}
      </span>
    </div>
  )
}
