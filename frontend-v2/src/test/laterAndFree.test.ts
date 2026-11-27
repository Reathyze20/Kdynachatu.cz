import { describe, expect, it } from 'vitest'
import { buildLaterAndFree } from '@/features/dashboard/laterAndFree'

// Potom a volno (#273, spec #677, šev 3). Fiktivní pobyty, hodiny v místním čase (testy běží v Europe/Prague).
const NOW = new Date(2026, 11, 10, 10, 0) // čt 10. 12. 2026 10:00

const stay = (id: string, from: string, to: string, status: 'primary' | 'soft' | 'backup' = 'primary') => ({ id, username: id, from, to, status })
const kinds = (items: ReturnType<typeof buildLaterAndFree>) =>
  items.map((i) => (i.kind === 'stay' ? i.stay.id : `volno ${i.from}..${i.to} (${i.nights})`))

describe('buildLaterAndFree', () => {
  it('mezera na začátku: po „příště“ je volno a za ním další pobyt', () => {
    const items = buildLaterAndFree([stay('Jana', '2026-12-12', '2026-12-14'), stay('Petr', '2026-12-20', '2026-12-22')], NOW)
    expect(kinds(items)).toEqual(['volno 2026-12-15..2026-12-19 (4)', 'Petr'])
  })

  it('teď a příště z karty Kdo jede se neopakují, blok začíná po příštím odjezdu', () => {
    const items = buildLaterAndFree([stay('Teď', '2026-12-08', '2026-12-12'), stay('Jana', '2026-12-14', '2026-12-16'), stay('Petr', '2026-12-19', '2026-12-21')], NOW)
    expect(kinds(items)).toEqual(['volno 2026-12-17..2026-12-18 (1)', 'Petr'])
  })

  it('žádná mezera: navazující pobyty a jediný volný den volno nedají', () => {
    const items = buildLaterAndFree([
      stay('Jana', '2026-12-12', '2026-12-14'),
      stay('Petr', '2026-12-15', '2026-12-17'),
      stay('Ota', '2026-12-19', '2026-12-21'),
    ], NOW)
    expect(kinds(items)).toEqual(['Petr', 'Ota'])
  })

  it('předběžný pobyt mezeru přeruší, záložní ne', () => {
    const items = buildLaterAndFree([
      stay('Jana', '2026-12-12', '2026-12-14'),
      stay('Ida', '2026-12-17', '2026-12-18', 'soft'),
      stay('Záloha', '2026-12-20', '2026-12-22', 'backup'),
      stay('Petr', '2026-12-24', '2026-12-26'),
    ], NOW)
    expect(kinds(items)).toEqual(['volno 2026-12-15..2026-12-16 (1)', 'Ida', 'volno 2026-12-19..2026-12-23 (4)', 'Petr'])
  })

  it('můj pobyt, který karta ukazuje jako „Tvůj pobyt“, se neopakuje, ale volno přeruší', () => {
    const stays = [stay('Jana', '2026-12-12', '2026-12-14'), stay('Eva', '2026-12-18', '2026-12-20'), stay('Petr', '2026-12-24', '2026-12-26')]
    expect(kinds(buildLaterAndFree(stays, NOW, 'Eva'))).toEqual(['volno 2026-12-15..2026-12-17 (2)', 'volno 2026-12-21..2026-12-23 (2)', 'Petr'])
    // Předběžný pobyt karta jako „Tvůj pobyt“ neukazuje, v bloku tedy zůstane
    const soft = [stay('Jana', '2026-12-12', '2026-12-14'), stay('Eva', '2026-12-18', '2026-12-20', 'soft')]
    expect(kinds(buildLaterAndFree(soft, NOW, 'Eva'))).toEqual(['volno 2026-12-15..2026-12-17 (2)', 'Eva'])
  })

  it('bez pevného pobytu začíná volno dneškem, a to místním: po půlnoci už platí nový den, i když v UTC je ještě včera', () => {
    // 10. 12. 0:30 v Praze = 9. 12. 23:30 UTC
    const items = buildLaterAndFree([stay('Ida', '2026-12-14', '2026-12-16', 'soft')], new Date('2026-12-09T23:30:00Z'))
    expect(kinds(items)).toEqual(['volno 2026-12-10..2026-12-13 (3)', 'Ida'])
  })

  it('nejvýš 4 položky, zbytek je v kalendáři', () => {
    const items = buildLaterAndFree([
      stay('Jana', '2026-12-12', '2026-12-13'),
      stay('A', '2026-12-16', '2026-12-17'),
      stay('B', '2026-12-20', '2026-12-21'),
      stay('C', '2026-12-24', '2026-12-25'),
    ], NOW)
    expect(kinds(items)).toEqual(['volno 2026-12-14..2026-12-15 (1)', 'A', 'volno 2026-12-18..2026-12-19 (1)', 'B'])
  })
})
