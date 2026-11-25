/** lib/authStorage.ts — přihlášení z úložiště pro kód mimo React; komponenty jen přes useAuth(). */

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
