/**
 * Jediný formátovací modul (DESIGN.md §9, #455): data, časy, částky a procenta přes `Intl` v `cs-CZ`, plurál podle počtu (#509).
 * Mimo tento soubor se `toLocale*String`, `Intl.*Format` ani pole s názvy měsíců nepíšou (guard `localFormatter`).
 * `date-fns` zůstává jen pro aritmetiku dat.
 *
 * Vstup data:
 * - kalendářní den `"YYYY-MM-DD"` (rezervace, pobyty) se zobrazí přesně tak, nikdy se neposune o den,
 * - okamžik (`Date`, číslo, ISO řetězec s časem) se zobrazí v pražském čase bez ohledu na zónu zařízení.
 */

export const LOCALE = 'cs-CZ'
export const TIME_ZONE = 'Europe/Prague'

export type DateInput = string | number | Date

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/
const formatters = new Map<string, Intl.DateTimeFormat>()

/** Neplatné nebo prázdné datum dá prázdný řetězec; `Intl` by vyhodil RangeError a shodil vykreslení. */
function dateFormat(options: Intl.DateTimeFormatOptions, input: DateInput): string {
  const day = typeof input === 'string' && CALENDAR_DAY.test(input)
  const time = day ? Date.parse(`${input}T00:00:00Z`) : new Date(input).getTime()
  if (Number.isNaN(time)) return ''
  const timeZone = day ? 'UTC' : TIME_ZONE
  const key = timeZone + JSON.stringify(options)
  let formatter = formatters.get(key)
  if (!formatter) formatters.set(key, (formatter = new Intl.DateTimeFormat(LOCALE, { ...options, timeZone })))
  return formatter.format(time)
}

/** Plné datum „21. 3. 2026“. */
export const formatDate = (input: DateInput) => dateFormat({ day: 'numeric', month: 'numeric', year: 'numeric' }, input)

/** Krátké datum „21. 3.“. */
export const formatShortDate = (input: DateInput) => dateFormat({ day: 'numeric', month: 'numeric' }, input)

/** Datum se dnem „po 21. 3.“. */
export const formatDayDate = (input: DateInput) => dateFormat({ weekday: 'short', day: 'numeric', month: 'numeric' }, input)

/** Datum s názvem měsíce „10. prosince“, s `weekday` „čtvrtek 10. prosince“, s `year` „… 2026“. */
export function formatLongDate(input: DateInput, { weekday = false, year = false } = {}): string {
  return dateFormat({ day: 'numeric', month: 'long', ...(weekday && { weekday: 'long' }), ...(year && { year: 'numeric' }) }, input)
}

/** Čas 24 h „9:40“, půlnoc „0:00“. */
export const formatTime = (input: DateInput) => dateFormat({ hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }, input)

/** Den v týdnu „po“ / „pondělí“. */
export const weekdayName = (input: DateInput, style: 'short' | 'long' = 'short') => dateFormat({ weekday: style }, input)

/** Název měsíce podle indexu 0–11 (jako `Date#getMonth`): „březen“, ve 2. pádě „března“ (jako v „21. března“). */
export function monthName(month: number, form: 'nominative' | 'genitive' = 'nominative'): string {
  const day = `2000-${String(month + 1).padStart(2, '0')}-01`
  return form === 'nominative' ? dateFormat({ month: 'long' }, day) : formatLongDate(day).replace(/^\d+\.\s*/, '')
}

/**
 * Rozsah dnů: „12.–14. 7.“, přes měsíc „30. 6. – 2. 7.“, přes rok „30. 12. 2026 – 2. 1. 2027“.
 * Pomlčka je bez mezer mezi jednoslovnými částmi, s mezerami mezi víceslovnými. `year` přidá rok i bez přelomu roku.
 */
export function formatDateRange(from: DateInput, to: DateInput, { year = false } = {}): string {
  const [fd, fm, fy] = formatDate(from).split(/\.\s*/)
  const [td, tm, ty] = formatDate(to).split(/\.\s*/)
  const end = year || fy !== ty ? formatDate(to) : formatShortDate(to)
  if (fy !== ty) return `${formatDate(from)} – ${end}`
  if (fm !== tm) return `${formatShortDate(from)} – ${end}`
  return fd === td ? end : `${fd}.–${end}`
}

const amountFormat = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 })
const percentFormat = new Intl.NumberFormat(LOCALE, { style: 'unit', unit: 'percent', maximumFractionDigits: 0 })

/** Částka v celých korunách „1 234 Kč“ (mezery nezlomitelné), záporná „-1 234 Kč“; `+ 0` udělá z -0 nulu bez znaménka. */
export const formatAmount = (crowns: number) => amountFormat.format(Math.round(crowns) + 0)

/** Procenta z hodnoty v procentech (12 → „12 %“), zaokrouhlená na celá čísla. */
export const formatPercent = (percent: number) => percentFormat.format(Math.round(percent) + 0)

/**
 * Tvar slova podle počtu (#509): 1 → `one`, 2–4 → `few`, jinak (0, 5+, i 21 a 22) → `many`.
 * Čeština po číslici nad 20 neskloňuje podle poslední cifry („21 fotek“), proto ne `Intl.PluralRules`
 * kategorie jako v polštině. Záporný počet se skloňuje jako kladný.
 */
export function pluralize(count: number, one: string, few: string, many: string): string {
  const normalized = Math.abs(count)
  if (normalized === 1) return one
  if (normalized >= 2 && normalized <= 4) return few
  return many
}

/** Počet s tvarem slova „1 fotka“, „2 fotky“, „5 fotek“. */
export const formatCount = (count: number, one: string, few: string, many: string) => `${count} ${pluralize(count, one, few, many)}`
