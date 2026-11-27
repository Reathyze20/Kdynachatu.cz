/**
 * Potom a volno na Přehledu (#273, spec #677): pobyty po „příště“ a mezi nimi mezery volna k zabrání.
 * Čistá funkce. Pobyt je uzavřený interval kalendářních dnů [from, to] jako v kolizi rezervací
 * (`isoRangesOverlap`), takže volno jsou až dny mezi odjezdem a dalším příjezdem. Dnešek je místní den zařízení.
 */
import { addIsoDays, nightsBetween, toIsoDate } from "@/lib/dateUtils";
import { buildTurnusChain } from "@/lib/turnusChain";

/** Nejvýš tolik položek (pobytů i mezer dohromady), zbytek je v kalendáři. */
export const LATER_AND_FREE_LIMIT = 4;

interface Stay { id: string; username: string; from: string; to: string; status?: "primary" | "backup" | "soft" }

export type LaterAndFreeItem<S extends Stay = Stay> =
  | { kind: "stay"; stay: S }
  | { kind: "free"; from: string; to: string; nights: number };

/**
 * Teď a příště ukazuje karta Kdo jede, blok začíná den po jejich konci (bez nich dneškem). Můj nejbližší
 * pobyt, když je pevný, ukazuje karta jako „Tvůj pobyt“: v bloku se neopakuje, volno ale přeruší.
 * Volno přeruší pevný i předběžný pobyt. Záložní ne: leží přes jiný a server ani formulář s ním kolizi nepočítají.
 * Mezera bez celé noci (jediný volný den) se nevypíše.
 */
export function buildLaterAndFree<S extends Stay>(stays: S[], now: Date, myUsername?: string): LaterAndFreeItem<S>[] {
  const today = toIsoDate(now);
  const blocking = stays.filter((s) => s.status !== "backup" && s.from <= s.to && s.to >= today);
  const chain = buildTurnusChain(
    blocking.map((s) => ({ id: s.id, from: s.from, to: s.to, status: s.status ?? "primary", username: s.username, isMine: false })),
    today,
  );
  const shown = new Set(chain.filter((n) => n.kind !== "later").map((n) => n.stay?.id));
  let cursor = today;
  for (const s of blocking) if (shown.has(s.id) && s.to >= cursor) cursor = addIsoDays(s.to, 1);
  const [mine] = stays.filter((s) => s.username === myUsername && s.from >= today).sort((a, b) => a.from.localeCompare(b.from));
  const inCard = (s: S) => s === mine && (s.status ?? "primary") === "primary";

  const later = blocking
    .filter((s) => !shown.has(s.id) && s.to >= cursor)
    .sort((a, b) => (a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from)));
  const items: LaterAndFreeItem<S>[] = [];
  for (const stay of later) {
    const lastFree = addIsoDays(stay.from, -1);
    const nights = nightsBetween(cursor, lastFree);
    if (nights > 0) items.push({ kind: "free", from: cursor, to: lastFree, nights });
    if (!inCard(stay)) items.push({ kind: "stay", stay });
    if (stay.to >= cursor) cursor = addIsoDays(stay.to, 1);
  }
  return items.slice(0, LATER_AND_FREE_LIMIT);
}
