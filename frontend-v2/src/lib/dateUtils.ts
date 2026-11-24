import { formatDateRange as formatRange, formatDayDate, formatLongDate, formatShortDate, weekdayName } from "./format";

// Formátovače níž jen delegují na lib/format.ts (DESIGN.md §9) a drží tvar, na který jsou zvyklí volající.

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const dayOf = (iso: string) => Number(iso.slice(8, 10));

/** „12. – 14. března 2026“, přes měsíc „30. června – 2. července 2026“. Vstup YYYY-MM-DD. */
export function formatDateRange(from: string, to: string): string {
  const start = from.slice(0, 7) === to.slice(0, 7) ? `${dayOf(from)}.` : formatLongDate(from);
  return `${start} – ${formatLongDate(to, { year: true })}`;
}

/**
 * Rozsah pobytu číselně i s rokem: „12.–14. 7. 2025“, „30. 6. – 2. 7. 2025“,
 * přes Nový rok „30. 12. 2025 – 2. 1. 2026“. Vstup je kalendářní den YYYY-MM-DD
 * (i začátek ISO razítka), takže se den neposune v žádném časovém pásmu.
 */
export function formatStayRange(from: string, to?: string | null): string {
  return formatRange(from.slice(0, 10), (to || from).slice(0, 10), { year: true });
}

/** „So 21. – Ne 22. března“. Vstup YYYY-MM-DD. */
export function formatWeekendRange(start: string, end: string): string {
  return `${capitalize(weekdayName(start))} ${dayOf(start)}. – ${capitalize(weekdayName(end))} ${formatLongDate(end)}`;
}

export function nightsBetween(from: string, to: string): number {
  const d1 = new Date(from + "T12:00:00");
  const d2 = new Date(to + "T12:00:00");
  return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / 86400000));
}

export function nightsLabel(n: number): string {
  if (n === 1) return "noc";
  if (n <= 4) return "noci";
  return "nocí";
}

export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86400000));
}

/** Krátké datum „po 14. 12.“ (den v týdnu malým písmenem + den a měsíc). */
export function formatShortDayDate(iso: string): string {
  return formatDayDate(iso);
}

/** Den a měsíc „15. 11.“ z ISO časového razítka, v pražském čase. */
export function formatDayMonth(isoTimestamp: string): string {
  return formatShortDate(isoTimestamp);
}

/** Dnešek „Čtvrtek 10. prosince“. */
export function getTodayFormatted(): string {
  return capitalize(formatLongDate(new Date(), { weekday: true }));
}

// ─── Kalendářní datum rezervací ──────────────────────────────────────
// Rezervace jsou celodenní: API posílá a přijímá "YYYY-MM-DD" bez času a zóny.
// Jedna konvence pro celý frontend: datum je řetězec "YYYY-MM-DD" a porovnává
// se jako řetězec. Date objekt vzniká jen z lokálních složek (nikdy přes
// toISOString/UTC) a jen kvůli zobrazení.

/** "YYYY-MM-DD" z lokálních složek data (ne z UTC). */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Dnešní lokální kalendářní den. `new Date().toISOString()` by po půlnoci v Praze vrátil včerejšek. */
export function getLocalTodayIso(): string {
  return toIsoDate(new Date());
}

/** Leží den v uzavřeném intervalu [from, to]? */
export function isIsoDateInRange(day: string, from: string, to: string): boolean {
  return from <= day && day <= to;
}

/** Překrývají se dva uzavřené intervaly kalendářních dnů? */
export function isoRangesOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}

/** Posun kalendářního dne YYYY-MM-DD o `n` dní (počítá se v UTC, takže bez posunu času). */
export function addIsoDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Date v lokální poledne daného dne – jen pro zobrazení (den v týdnu, měsíc). */
export function isoDateToLocalNoon(day: string): Date {
  return new Date(day + "T12:00:00");
}
