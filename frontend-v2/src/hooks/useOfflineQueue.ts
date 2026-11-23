import { useSyncExternalStore } from 'react'
import { checkoutPath } from '@/api/reservations'
import { getQueueLength, isMutationQueued, subscribeQueue } from '@/lib/offlineQueue'

/** Počet změn čekajících v offline frontě. */
export function useQueueLength(): number {
  return useSyncExternalStore(subscribeQueue, getQueueLength, () => 0)
}

/** Čeká předávka pobytu v offline frontě? Po odeslání fronty vrátí false (štítek zmizí). */
export function useCheckoutPending(reservationId: string): boolean {
  return useSyncExternalStore(subscribeQueue, () => isMutationQueued('patch', checkoutPath(reservationId)), () => false)
}
