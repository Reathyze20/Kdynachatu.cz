/**
 * lib/sessionReset.ts — Sdílené zařízení (#478): odhlášení, přihlášení jiného účtu, 401
 * i zablokování účtu vyprázdní cache dotazů a cache 'uploads' service workeru (vite.config.ts).
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
