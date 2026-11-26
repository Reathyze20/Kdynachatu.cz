import { describe, expect, it, vi } from 'vitest'
import {
  formatAmount,
  formatCount,
  formatDate,
  formatDateRange,
  formatDayDate,
  formatLongDate,
  formatPercent,
  formatShortDate,
  formatTime,
  monthName,
  pluralize,
  TIME_ZONE,
  weekdayName,
} from '@/lib/format'
import { formatDateRange as formatLongDateRange } from '@/lib/dateUtils'

/**
 * Formáty z DESIGN.md §9 (#455). Pevná data: kalendářní den „YYYY-MM-DD“ se nikdy neposouvá,
 * okamžik (Date, číslo, ISO s časem) se zobrazí v pražském čase bez ohledu na zónu stroje.
 * Intl dává u čísel nezlomitelnou mezeru (U+00A0).
 */
const NBSP = ' '

describe('lib/format', () => {
  it('pracuje v cs-CZ a v zóně Europe/Prague', () => {
    expect(TIME_ZONE).toBe('Europe/Prague')
  })

  it('plné, krátké datum a datum se dnem', () => {
    expect(formatDate('2026-03-21')).toBe('21. 3. 2026')
    expect(formatShortDate('2026-03-21')).toBe('21. 3.')
    expect(formatDayDate('2026-03-23')).toBe('po 23. 3.')
    expect(formatDayDate('2026-03-21')).toBe('so 21. 3.')
  })

  it('kalendářní den se neposune, okamžik se zobrazí v pražském čase', () => {
    expect(formatDate('2026-12-31')).toBe('31. 12. 2026')
    // 23:30 UTC na Silvestra = 0:30 v Praze 1. ledna
    expect(formatDate('2026-12-31T23:30:00.000Z')).toBe('1. 1. 2027')
    expect(formatDate(new Date(Date.UTC(2026, 11, 31, 23, 30)))).toBe('1. 1. 2027')
    expect(formatShortDate(Date.UTC(2026, 6, 14, 22, 30))).toBe('15. 7.') // léto +2 h
    expect(formatShortDate(Date.UTC(2026, 0, 14, 22, 30))).toBe('14. 1.') // zima +1 h
  })

  it('výsledek nezávisí na zóně zařízení (testy jinak běží v Europe/Prague, #456)', () => {
    const midnightUtcHour = { UTC: 0, 'America/Los_Angeles': 16, 'Pacific/Kiritimati': 14 }
    for (const [zone, hour] of Object.entries(midnightUtcHour)) {
      vi.stubEnv('TZ', zone)
      try {
        expect(new Date(Date.UTC(2026, 0, 1)).getHours()).toBe(hour) // zóna zařízení se opravdu přepnula
        expect(formatDate('2026-12-31T23:30:00.000Z')).toBe('1. 1. 2027')
        expect(formatTime(Date.UTC(2026, 2, 21, 8, 40))).toBe('9:40')
        expect(formatDate('2026-03-21')).toBe('21. 3. 2026')
        expect(weekdayName('2026-03-23')).toBe('po')
      } finally {
        vi.unstubAllEnvs()
      }
    }
  })

  it('čas 24 h včetně půlnoci a přechodu na letní a zimní čas', () => {
    expect(formatTime(Date.UTC(2026, 2, 21, 8, 40))).toBe('9:40')
    expect(formatTime('2026-07-14T22:00:00Z')).toBe('0:00')
    expect(formatTime('2026-01-14T23:00:00Z')).toBe('0:00')
    expect(formatTime('2026-01-14T22:59:00Z')).toBe('23:59')
    // 29. 3. 2026 v 1:00 UTC se ručičky posunou ze 2:00 na 3:00
    expect(formatTime('2026-03-29T00:30:00Z')).toBe('1:30')
    expect(formatTime('2026-03-29T01:30:00Z')).toBe('3:30')
    // 25. 10. 2026 v 1:00 UTC se ručičky vrátí ze 3:00 na 2:00, 2:30 je dvakrát
    expect(formatTime('2026-10-25T00:30:00Z')).toBe('2:30')
    expect(formatTime('2026-10-25T01:30:00Z')).toBe('2:30')
  })

  it('čas se sekundami pro logy a podporu (#456)', () => {
    expect(formatTime('2026-03-21T08:40:05Z', { seconds: true })).toBe('9:40:05')
    expect(formatTime('2026-07-14T22:00:00Z', { seconds: true })).toBe('0:00:00')
  })

  describe('rozsah', () => {
    it('v jednom měsíci jen jedno číslo měsíce, pomlčka bez mezer', () => {
      expect(formatDateRange('2026-07-12', '2026-07-14')).toBe('12.–14. 7.')
    })

    it('přes měsíc pomlčka s mezerami (víceslovné části)', () => {
      expect(formatDateRange('2026-06-30', '2026-07-02')).toBe('30. 6. – 2. 7.')
    })

    it('přes rok s oběma roky', () => {
      expect(formatDateRange('2026-12-30', '2027-01-02')).toBe('30. 12. 2026 – 2. 1. 2027')
    })

    it('jeden den je jedno datum', () => {
      expect(formatDateRange('2026-07-12', '2026-07-12')).toBe('12. 7.')
    })

    it('s rokem', () => {
      const withYear = { year: true }
      expect(formatDateRange('2025-07-12', '2025-07-14', withYear)).toBe('12.–14. 7. 2025')
      expect(formatDateRange('2025-06-30', '2025-07-02', withYear)).toBe('30. 6. – 2. 7. 2025')
      expect(formatDateRange('2025-12-30', '2026-01-02', withYear)).toBe('30. 12. 2025 – 2. 1. 2026')
      expect(formatDateRange('2026-03-21', '2026-03-21', withYear)).toBe('21. 3. 2026')
    })

    it('okamžiky porovná podle pražského dne', () => {
      // 30. 6. 22:30 UTC = 1. 7. 0:30 v Praze, takže pobyt je celý v červenci
      expect(formatDateRange('2026-06-30T22:30:00Z', '2026-07-03T10:00:00Z')).toBe('1.–3. 7.')
    })
  })

  it('dlouhé datum s názvem měsíce', () => {
    expect(formatLongDate('2026-12-10')).toBe('10. prosince')
    expect(formatLongDate('2026-12-10', { weekday: true })).toBe('čtvrtek 10. prosince')
    expect(formatLongDate('2027-03-27', { weekday: true, year: true })).toBe('sobota 27. března 2027')
  })

  it('názvy měsíců a dnů', () => {
    expect(monthName(0)).toBe('leden')
    expect(monthName(2, 'genitive')).toBe('března')
    expect(monthName(11, 'genitive')).toBe('prosince')
    expect(Array.from({ length: 12 }, (_, i) => monthName(i))).toEqual([
      'leden', 'únor', 'březen', 'duben', 'květen', 'červen',
      'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec',
    ])
    // 3. pád jako v „Poznámka k březnu“ (#456)
    expect(Array.from({ length: 12 }, (_, i) => monthName(i, 'dative'))).toEqual([
      'lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu',
      'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci',
    ])
    expect(weekdayName('2026-03-23')).toBe('po')
    expect(weekdayName('2026-03-22', 'long')).toBe('neděle')
  })

  it('částka v celých korunách včetně nuly a záporné částky', () => {
    expect(formatAmount(1234)).toBe(`1${NBSP}234${NBSP}Kč`)
    expect(formatAmount(1234.6)).toBe(`1${NBSP}235${NBSP}Kč`)
    expect(formatAmount(0)).toBe(`0${NBSP}Kč`)
    expect(formatAmount(-0.4)).toBe(`0${NBSP}Kč`)
    expect(formatAmount(-1234)).toBe(`-1${NBSP}234${NBSP}Kč`)
    expect(formatAmount(999)).toBe(`999${NBSP}Kč`)
  })

  it('neplatné nebo prázdné datum dá prázdný řetězec místo pádu', () => {
    expect(formatDate('')).toBe('')
    expect(formatTime('nesmysl')).toBe('')
    expect(formatDayDate(Number.NaN)).toBe('')
  })

  it('dlouhý rozsah z dateUtils má přes přelom roku rok u obou dnů', () => {
    expect(formatLongDateRange('2026-12-30', '2027-01-02')).toBe('30. prosince 2026 – 2. ledna 2027')
    expect(formatLongDateRange('2026-06-30', '2026-07-02')).toBe('30. června – 2. července 2026')
    expect(formatLongDateRange('2026-03-12', '2026-03-14')).toBe('12. – 14. března 2026')
  })

  it('procenta z hodnoty v procentech, celá čísla', () => {
    expect(formatPercent(12)).toBe(`12${NBSP}%`)
    expect(formatPercent(12.4)).toBe(`12${NBSP}%`)
    expect(formatPercent(0)).toBe(`0${NBSP}%`)
    expect(formatPercent(-5)).toBe(`-5${NBSP}%`)
  })

  it('plurál podle počtu: 1 / 2–4 / ostatní, i 21 a 22 jsou „5+“ (#509)', () => {
    const fotka = (count: number) => pluralize(count, 'fotka', 'fotky', 'fotek')
    expect(fotka(0)).toBe('fotek')
    expect(fotka(1)).toBe('fotka')
    expect(fotka(2)).toBe('fotky')
    expect(fotka(4)).toBe('fotky')
    expect(fotka(5)).toBe('fotek')
    expect(fotka(21)).toBe('fotek')
    expect(fotka(22)).toBe('fotek')
    expect(fotka(-2)).toBe('fotky')
  })

  it('počet s tvarem slova „2 rezervace“ (#509)', () => {
    const rezervace = (count: number) => formatCount(count, 'rezervace', 'rezervace', 'rezervací')
    expect(rezervace(0)).toBe('0 rezervací')
    expect(rezervace(1)).toBe('1 rezervace')
    expect(rezervace(4)).toBe('4 rezervace')
    expect(rezervace(21)).toBe('21 rezervací')
  })
})
