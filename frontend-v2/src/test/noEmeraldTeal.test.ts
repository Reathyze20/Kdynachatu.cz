import { describe, it, expect } from 'vitest'

/**
 * Žádné natvrdo `emerald-*` ani `teal-*` třídy (#429).
 *
 * Tailwind emerald a teal táhnou do tyrkysova a na teplém papíře vypadají mátově, vedle
 * značkové Jedle (#427) působí cize. Zelená jde přes tokeny: hlavní akce `bg-primary`,
 * hover `hover:bg-(--brand-primary-hover)`, vybraná/aktivní plocha `bg-accent`
 * (`--brand-primary-light`), zelený text `text-primary`. Kontrast těchto ploch hlídá
 * brandGreen.test.ts.
 *
 * `green-*` se nehlídá: znamená stav úspěchu (`FeedbackField` „Díky, uloženo“), ne značku.
 */

const SOURCES = import.meta.glob<string>(
  ['../**/*.{ts,tsx,css}', '!../test/**', '!../**/*.test.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true },
)

/** `bg-emerald-50`, `hover:text-teal-700`, `ring-emerald-200/50`, `var(--color-teal-500)` … */
const EMERALD_OR_TEAL = /\b(emerald|teal)-\d+/

describe('žádné emerald/teal třídy, zelená jde přes značkové tokeny (#429)', () => {
  it('najde TS, TSX i CSS (glob nemíří do prázdna)', () => {
    expect(Object.keys(SOURCES)).toContain('../features/reservations/ui/ReservationList.tsx')
    expect(Object.keys(SOURCES)).toContain('../styles/variables.css')
    expect(Object.keys(SOURCES)).toContain('../main.tsx')
  })

  it('zdroják neobsahuje emerald-* ani teal-*', () => {
    const offenders: string[] = []
    for (const [path, source] of Object.entries(SOURCES)) {
      source.split('\n').forEach((line, i) => {
        if (EMERALD_OR_TEAL.test(line)) offenders.push(`${path.slice(3)}:${i + 1}  ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
