/**
 * lib/authStorage.ts — Čtení přihlášení z úložiště mimo React (api/client.ts, offline fronta).
 * Komponenty berou uživatele a chatu jen přes useAuth().
 */

export function getStoredUserId(): string | null {
  return sessionStorage.getItem('userId') ?? localStorage.getItem('userId')
}

/** Aktivní chata (nastavuje AuthContext při přihlášení a přepnutí chaty). */
export function getActiveCabinId(): string | null {
  return (
    localStorage.getItem('activeCabinId') ??
    sessionStorage.getItem('activeCabinId') ??
    localStorage.getItem('cabinId') ??
    sessionStorage.getItem('cabinId') ??
    null
  )
}
