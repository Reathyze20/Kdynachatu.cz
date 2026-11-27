/**
 * reservationHelpers.ts — Pure, dependency-free helpers for the reservations
 * route. Kept out of the route module so they can be unit-tested without
 * booting Express / Prisma / Socket.IO.
 */
import type { HandoverPhase } from "../../types";

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

/** Den "YYYY-MM-DD" posunutý o `days`; počítá se v UTC, takže ho neposune zóna serveru ani letní čas. */
export function addDaysIso(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Nejbližší volný víkend (So–Ne) od `today` ("YYYY-MM-DD" z `calendarTodayIso`), nejvýš
 * 26 víkendů dopředu. Dnešní sobota se počítá. `reservations` jsou `primary` rezervace chaty
 * (`@db.Date`, tedy UTC půlnoc daného dne). Dny se porovnávají jako řetězce "YYYY-MM-DD".
 */
export function nextFreeWeekend(
  today: string,
  reservations: { dateFrom: Date; dateTo: Date }[],
): { start: string; end: string } | null {
  const stays = reservations.map((r) => ({
    from: r.dateFrom.toISOString().slice(0, 10),
    to: r.dateTo.toISOString().slice(0, 10),
  }));
  const daysToSaturday = (6 - new Date(`${today}T00:00:00Z`).getUTCDay() + 7) % 7;
  let saturday = addDaysIso(today, daysToSaturday);
  for (let i = 0; i < 26; i++) {
    const sunday = addDaysIso(saturday, 1);
    const occupied = stays.some((s) => s.from <= sunday && saturday <= s.to);
    if (!occupied) return { start: saturday, end: sunday };
    saturday = addDaysIso(saturday, 7);
  }
  return null;
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

/** Fáze mého pobytu vůči dnešku pro tab Předávka. Okno předávky je den odjezdu a den po něm, mimo něj `null`. */
export function handoverPhase(today: string, from: string, to: string): HandoverPhase | null {
  if (to === today || to === addDaysIso(today, -1)) return "departure";
  if (from > today) return "upcoming";
  return to > today ? "ongoing" : null;
}

/** „Můj pobyt“ (spec #173): nedokončená předávka v okně, pak dokončená, pak probíhající pobyt, pak nejbližší budoucí. */
export function pickMyStay<T extends { from: string; to: string; isCheckoutCompleted: boolean }>(
  stays: T[],
  today: string,
): (T & { phase: HandoverPhase }) | null {
  const rank = (s: T & { phase: HandoverPhase }) =>
    s.phase === "departure" ? Number(s.isCheckoutCompleted) : s.phase === "ongoing" ? 2 : 3;
  const candidates = stays.flatMap((s) => {
    const phase = handoverPhase(today, s.from, s.to);
    return phase ? [{ ...s, phase }] : [];
  });
  return candidates.sort((a, b) => rank(a) - rank(b) || a.from.localeCompare(b.from))[0] ?? null;
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

export interface HandoverFault {
  text: string;
  reportedBy: string;
  reportedAt: string;
}

/**
 * Závada z poslední dokončené předávky pro kartu „Potřebuje pozornost“ (#275).
 * Platí, dokud ji nepřepíše další předávka: prázdné nebo chybějící pole „rozbité“ = žádná závada.
 */
export function handoverFault(state: unknown, reportedBy: string, reportedAt: Date): HandoverFault | null {
  const text = sanitizeCheckoutState(state)?.broken?.trim();
  return text ? { text, reportedBy, reportedAt: reportedAt.toISOString() } : null;
}

/** Host (`guest`) smí jen svůj pobyt (#484). */
export const isGuest = (user?: { role: string }): boolean => user?.role === "guest";

/**
 * Filtr rezervací pro Prisma `where`: host vidí jen pobyty, které založil nebo na kterých je
 * spolucestující (#484); člen a správce celou chatu (prázdný filtr).
 */
export function guestStayScope(user?: { role: string; userId: string }) {
  if (!user || !isGuest(user)) return {};
  return { OR: [{ userId: user.userId }, { participants: { some: { userId: user.userId } } }] };
}
