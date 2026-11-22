/**
 * OfflineBanner.tsx — Překlad #offline-banner z vanilla app, rozšířený o pravidlo E4 (#276).
 *
 * Řádek nahoře v AppShell. Online s čerstvými daty se nic neukazuje. Offline řekne
 * „Jste offline · údaje z HH:MM“ a kolik změn čeká v offline frontě (lib/offlineQueue).
 * Online s daty staršími než hodina řekne „Údaje z HH:MM“ (lib/dataFreshness).
 *
 * CSS: src/styles/skeleton.css → .offline-banner
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Clock, WifiOff } from 'lucide-react'
import { useOnline } from '@/hooks/useOnline'
import { useQueueLength } from '@/hooks/useOfflineQueue'
import { STALE_AFTER_MS, formatDataTime, getLastDataAt, subscribeDataFreshness } from '@/lib/dataFreshness'

export function OfflineBanner() {
  const isOnline = useOnline()
  const pendingCount = useQueueLength()
  const lastDataAt = useSyncExternalStore(subscribeDataFreshness, getLastDataAt, () => null)
  // Hodiny po minutě: online data zestárnou i bez jakékoli události
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const since = lastDataAt !== null ? formatDataTime(lastDataAt, now) : null

  if (isOnline) {
    if (lastDataAt === null || now - lastDataAt <= STALE_AFTER_MS) return null
    return (
      <div className="offline-banner" role="status" data-testid="stale-data-banner">
        <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Údaje z {since}.</span>
      </div>
    )
  }

  return (
    <div className="offline-banner" role="alert" aria-live="polite" data-testid="offline-banner">
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>
        <strong>Jste offline</strong>{since ? ` · údaje z ${since}. ` : '. '}
        {pendingCount > 0
          ? `${pendingCount === 1 ? '1 změna čeká' : `${pendingCount} změny/změn čeká`} na odeslání. Po obnovení připojení se uloží automaticky.`
          : 'Změny provedené offline se uloží po obnovení připojení.'}
      </span>
    </div>
  )
}
