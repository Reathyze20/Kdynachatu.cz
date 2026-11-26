/**
 * lib/dataFreshness.ts — Kdy appka naposledy dostala data ze serveru (pravidlo E4, #276).
 *
 * api/client.ts volá markDataReceived() po každé úspěšné odpovědi GET. OfflineBanner
 * podle toho ukáže „údaje z HH:MM“, když je appka offline nebo jsou data starší než hodina.
 * Jen v paměti: mezipaměť dotazů se dnes neukládá, po reloadu tedy žádná stará data nejsou.
 *
 * Event na window: 'data-freshness:changed'
 */

import { formatShortDate, formatTime } from './format'

/** Data starší než hodina mají upozornění i online. */
export const STALE_AFTER_MS = 60 * 60 * 1000

const EVENT = 'data-freshness:changed'
let lastDataAt: number | null = null

export function markDataReceived(at: number = Date.now()): void {
  lastDataAt = at
  window.dispatchEvent(new CustomEvent(EVENT))
}

export function getLastDataAt(): number | null {
  return lastDataAt
}

export function subscribeDataFreshness(callback: () => void): () => void {
  window.addEventListener(EVENT, callback)
  return () => window.removeEventListener(EVENT, callback)
}

/** „9:40“ pro dnešek, „21. 11. 18:05“ pro jiný den. */
export function formatDataTime(at: number, now: number): string {
  const time = formatTime(at)
  return new Date(at).toDateString() === new Date(now).toDateString() ? time : `${formatShortDate(at)} ${time}`
}
