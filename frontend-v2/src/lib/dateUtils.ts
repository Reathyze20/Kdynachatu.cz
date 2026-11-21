const MONTH_NAMES_CZ = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];
const DAY_NAMES_CZ = ["Neděle", "Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota"];
const DAY_NAMES_SHORT_CZ = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];

export function formatDateRange(from: string, to: string): string {
  const f = new Date(from + "T12:00:00");
  const t = new Date(to + "T12:00:00");
  if (f.getMonth() === t.getMonth() && f.getFullYear() === t.getFullYear()) {
    return `${f.getDate()}. – ${t.getDate()}. ${MONTH_NAMES_CZ[t.getMonth()]} ${t.getFullYear()}`;
  }
  return `${f.getDate()}. ${MONTH_NAMES_CZ[f.getMonth()]} – ${t.getDate()}. ${MONTH_NAMES_CZ[t.getMonth()]} ${t.getFullYear()}`;
}

export function formatWeekendRange(start: string, end: string): string {
  const s = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  return `${DAY_NAMES_SHORT_CZ[s.getDay()]} ${s.getDate()}. – ${DAY_NAMES_SHORT_CZ[e.getDay()]} ${e.getDate()}. ${MONTH_NAMES_CZ[e.getMonth()]}`;
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
  const d = new Date(iso + "T12:00:00");
  return `${DAY_NAMES_SHORT_CZ[d.getDay()].toLowerCase()} ${d.getDate()}. ${d.getMonth() + 1}.`;
}

export function getTodayFormatted(): string {
  const today = new Date();
  const dayName = DAY_NAMES_CZ[today.getDay()];
  const dayNum = today.getDate();
  const monthName = MONTH_NAMES_CZ[today.getMonth()];
  return `${dayName} ${dayNum}. ${monthName}`;
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

/** Date v lokální poledne daného dne – jen pro zobrazení (den v týdnu, měsíc). */
export function isoDateToLocalNoon(day: string): Date {
  return new Date(day + "T12:00:00");
}
