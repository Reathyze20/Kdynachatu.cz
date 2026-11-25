/**
 * lib/sessionReset.ts — Úklid dat předchozího účtu na sdíleném zařízení (#478).
 *
 * Odhlášení, přihlášení jiného účtu (event SESSION_RESET_EVENT z AuthContext),
 * vypršení session (401 → 'auth:expired') i zablokování účtu ('auth:blocked')
 * vyprázdní cache TanStack Query a cache uploadů v service workeru
 * (runtimeCaching 'uploads' ve vite.config.ts), aby další člověk u tabletu
 * neviděl data předchozího účtu.
 */
import type { QueryClient } from '@tanstack/react-query'

/** Skončila session jednoho účtu (odhlášení nebo přihlášení jiného účtu či chaty). */
export const SESSION_RESET_EVENT = 'auth:session-reset'
const UPLOADS_CACHE = 'uploads'
const RESET_EVENTS = [SESSION_RESET_EVENT, 'auth:expired', 'auth:blocked']

export async function clearSessionCaches(queryClient: QueryClient): Promise<void> {
  queryClient.clear()
  try {
    if (typeof caches !== 'undefined') await caches.delete(UPLOADS_CACHE)
  } catch {
    // CacheStorage nedostupné (soukromý režim, starý prohlížeč) — není co mazat
  }
}

/** Zaregistruje úklid cache na konec session. Vrací odregistraci. */
export function installSessionCacheReset(queryClient: QueryClient): () => void {
  const handler = () => void clearSessionCaches(queryClient)
  RESET_EVENTS.forEach((event) => window.addEventListener(event, handler))
  return () => RESET_EVENTS.forEach((event) => window.removeEventListener(event, handler))
}
