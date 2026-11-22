import { useSyncExternalStore } from 'react'
import { getQueueLength, isMutationQueued, subscribeQueue } from '@/lib/offlineQueue'

/** Počet změn čekajících v offline frontě. */
export function useQueueLength(): number {
  return useSyncExternalStore(subscribeQueue, getQueueLength, () => 0)
}

/** Čeká request (např. PATCH předávky) v offline frontě? Po odeslání vrátí false. */
export function useIsQueued(method: string, url: string): boolean {
  return useSyncExternalStore(subscribeQueue, () => isMutationQueued(method, url), () => false)
}
