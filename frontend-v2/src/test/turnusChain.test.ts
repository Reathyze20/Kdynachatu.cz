import { describe, expect, it } from 'vitest'
import { buildTurnusChain, type ChainStay } from '@/lib/turnusChain'

const stay = (id: string, from: string, to: string, extra: Partial<ChainStay> = {}): ChainStay => ({
  id,
  from,
  to,
  status: 'primary',
  username: `user-${id}`,
  isMine: false,
  ...extra,
})

const summary = (nodes: ReturnType<typeof buildTurnusChain>) =>
  nodes.map((n) => `${n.kind}:${n.stay ? n.stay.id : 'volno'}`)

describe('řetězec turnusu teď → další → pak', () => {
  const today = '2026-12-10'

  it('pevný pobyt přes dnešek a dva další dají tři uzly v pořadí příjezdu', () => {
    const nodes = buildTurnusChain(
      [stay('c', '2026-12-28', '2026-12-30'), stay('a', '2026-12-08', '2026-12-12'), stay('b', '2026-12-14', '2026-12-16'), stay('d', '2027-01-05', '2027-01-07')],
      today,
    )
    expect(summary(nodes)).toEqual(['now:a', 'next:b', 'later:c'])
  })

  it('bez pobytu přes dnešek je první uzel Volno', () => {
    expect(summary(buildTurnusChain([stay('b', '2026-12-14', '2026-12-16')], today))).toEqual(['now:volno', 'next:b'])
  })

  it('bez aktuálního i budoucího pobytu je řetězec prázdný', () => {
    expect(buildTurnusChain([stay('old', '2026-11-01', '2026-11-03')], today)).toEqual([])
    expect(buildTurnusChain([], today)).toEqual([])
  })

  it('předběžné a záložní rezervace do řetězce nepatří', () => {
    const nodes = buildTurnusChain(
      [stay('t', '2026-12-09', '2026-12-11', { status: 'tentative' }), stay('bk', '2026-12-14', '2026-12-16', { status: 'backup' }), stay('p', '2026-12-20', '2026-12-22')],
      today,
    )
    expect(summary(nodes)).toEqual(['now:volno', 'next:p'])
  })

  it('pobyt, který dnes končí, je pořád teď', () => {
    expect(summary(buildTurnusChain([stay('a', '2026-12-07', today), stay('b', '2026-12-14', '2026-12-16')], today))).toEqual(['now:a', 'next:b'])
  })

  it('pobyt, který dnes začíná, je teď, ne další', () => {
    expect(summary(buildTurnusChain([stay('a', today, '2026-12-12')], today))).toEqual(['now:a'])
  })

  it('ve střídací den je teď ten, kdo dnes odjíždí, a kdo dnes přijíždí, jde jako další', () => {
    const nodes = buildTurnusChain([stay('arr', today, '2026-12-13'), stay('dep', '2026-12-06', today)], today)
    expect(summary(nodes)).toEqual(['now:dep', 'next:arr'])
  })

  it('stejný pobyt v datech dvakrát se v řetězci neopakuje', () => {
    const a = stay('a', today, '2026-12-12')
    expect(summary(buildTurnusChain([a, { ...a }, stay('b', '2026-12-14', '2026-12-16')], today))).toEqual(['now:a', 'next:b'])
  })
})
