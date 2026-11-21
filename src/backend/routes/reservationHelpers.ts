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

/** Zóna, ve které se počítá „dnes“ pro rezervace (rodiny jsou v Česku), ne UTC serveru. */
export const CABIN_TIME_ZONE = "Europe/Prague";

/** Dnešní kalendářní den "YYYY-MM-DD"; `toISOString()` by po půlnoci v Praze vrátil včerejšek. */
export function calendarTodayIso(now: Date, timeZone: string = CABIN_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Gate odjezdového banneru na dashboardu: můj pobyt dnes končí a předávka
 * (`isCheckoutCompleted`) ještě není dokončená. Starý per-rezervační
 * `handoverNote` („vzkaz pro další“ z formuláře rezervace) předávku neuzavírá.
 * Banner dostane i ID rezervace, aby odeslal předávku stejnou cestou jako detail rezervace.
 */
export function departureGate(
  departing: { id: string; isCheckoutCompleted: boolean } | null,
): { departingToday: boolean; departingReservationId: string | null } {
  if (!departing || departing.isCheckoutCompleted) {
    return { departingToday: false, departingReservationId: null };
  }
  return { departingToday: true, departingReservationId: departing.id };
}

export interface CheckoutStateShape {
  gas?: "full" | "half" | "low" | "empty";
  heatingOff?: boolean;
  waterOff?: boolean;
  broken?: string;
  leftBehind?: string;
  note?: string;
}

export const GAS_VALUES = ["full", "half", "low", "empty"] as const;

const MAX_TEXT = 1000;

/**
 * Sanitizuje strukturovaný "stav chaty" z těla requestu na známé klíče a typy.
 * - Vrací `undefined`, pokud klient stav neposlal (voláme "necháme beze změny").
 * - Vrací prázdný objekt, pokud poslal objekt bez validních klíčů.
 * - Neznámé klíče a špatné typy zahazuje; texty ořízne na 1000 znaků.
 */
export function sanitizeCheckoutState(raw: unknown): CheckoutStateShape | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const state: CheckoutStateShape = {};
  if (typeof r.gas === "string" && (GAS_VALUES as readonly string[]).includes(r.gas)) {
    state.gas = r.gas as CheckoutStateShape["gas"];
  }
  if (typeof r.heatingOff === "boolean") state.heatingOff = r.heatingOff;
  if (typeof r.waterOff === "boolean") state.waterOff = r.waterOff;
  if (typeof r.broken === "string") state.broken = r.broken.slice(0, MAX_TEXT);
  if (typeof r.leftBehind === "string") state.leftBehind = r.leftBehind.slice(0, MAX_TEXT);
  if (typeof r.note === "string") state.note = r.note.slice(0, MAX_TEXT);
  return state;
}
