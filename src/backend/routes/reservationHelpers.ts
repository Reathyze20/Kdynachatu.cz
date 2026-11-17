/**
 * reservationHelpers.ts — Pure, dependency-free helpers for the reservations
 * route. Kept out of the route module so they can be unit-tested without
 * booting Express / Prisma / Socket.IO.
 */

/**
 * Rozhoduje, zda se úprava rezervace má zablokovat kolizí (HTTP 409).
 *
 * Blokuje se jen případ, kdy by výsledkem byla `primary` rezervace a v daném
 * termínu už jiná překrývající se `primary` existuje. Stavy `backup` a `soft`
 * se smí s `primary` překrývat, takže nikdy neblokují.
 *
 * DB dotaz (`findFirst`) zůstává v route handleru; sem jde jen jeho boolean
 * výsledek, aby bylo rozhodnutí testovatelné bez databáze.
 */
export function isPrimaryCollisionBlocked(
  effectiveStatus: string,
  hasOverlappingPrimary: boolean,
): boolean {
  return effectiveStatus === "primary" && hasOverlappingPrimary;
}
