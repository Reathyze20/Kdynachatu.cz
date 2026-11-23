import { describe, expect, it } from 'vitest'
import { attentionWhatsApp, buildAttention } from '@/features/dashboard/attention'
import type { AttentionItem, HandoverFault } from '@/api/dashboard'

// „Potřebuje pozornost“ (#275). Fiktivní zásoby, žádná reálná data chaty.
const item = (name: string, isEmpty = false): AttentionItem =>
  ({ name, isEmpty, isEssential: false, inventoryId: `inv-${name}`, shoppingItemId: null })

const FAULT: HandoverFault = { text: 'Kape kohoutek', reportedBy: 'Petr', reportedAt: '2026-11-15T12:00:00.000Z' }
const names = (rows: ReturnType<typeof buildAttention>['rows']) => rows.map((r) => (r.kind === 'fault' ? r.text : r.name))

describe('buildAttention', () => {
  it('ukáže nejvýš tři věci v pořadí ze serveru a zbytek spočítá', () => {
    const a = buildAttention([item('Toaleťák', true), item('Káva'), item('Sůl'), item('Cukr'), item('Mléko')])
    expect(names(a.rows)).toEqual(['Toaleťák', 'Káva', 'Sůl'])
    expect(a.more).toBe(2)
    expect(a.all).toHaveLength(5)
  })

  it('závada z předávky je vždy vidět jako poslední řádek, souhrn počítá jen zásoby', () => {
    const a = buildAttention([item('Toaleťák', true), item('Plynová bomba'), item('Mléko')], FAULT)
    expect(names(a.rows)).toEqual(['Toaleťák', 'Plynová bomba', 'Kape kohoutek'])
    expect(a.more).toBe(1)
  })

  it('bez zásob a závady je prázdná', () => {
    expect(buildAttention([], null)).toEqual({ rows: [], more: 0, all: [] })
    expect(buildAttention(undefined, undefined).rows).toEqual([])
  })
})

describe('attentionWhatsApp', () => {
  it('vypíše všechny věci se stavem slovem a závadu s autorem a datem', () => {
    const { all } = buildAttention([item('Toaleťák', true), item('Plynová bomba')], FAULT)
    expect(attentionWhatsApp(all)).toBe(
      'Na chatě potřebuje pozornost:\n- Došlo: Toaleťák\n- Dochází: Plynová bomba\n- Závada: Kape kohoutek (Petr, 15. 11.)',
    )
  })
})
