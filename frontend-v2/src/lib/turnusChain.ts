/**
 * lib/turnusChain.ts — řetězec turnusu „teď → další → pak“ (návrh #1 díl 4 = A, návrh #4 díl 3 = A).
 * Čistá funkce sdílená Přehledem (#172) a kalendářem (#211). Počítá jen pevné pobyty (`primary`),
 * předběžné a záložní ne. Data jsou kalendářní dny "YYYY-MM-DD" porovnávané jako řetězce (dateUtils).
 */

export interface ChainStay {
  id: string
  from: string
  to: string
  /** `primary` = pevná rezervace; ostatní stavy se do řetězce nepočítají. */
  status: string
  username: string
  /** Pobyt přihlášeného uživatele, zobrazí se jako „Ty“. */
  isMine: boolean
}

export type TurnusChainKind = 'now' | 'next' | 'later'

export interface TurnusChainNode {
  kind: TurnusChainKind
  /** `null` jen u uzlu „teď“, když na chatě nikdo není (Volno). */
  stay: ChainStay | null
}

const FOLLOWING_KINDS: TurnusChainKind[] = ['next', 'later']

/**
 * Uzel „teď“ = pevný pobyt přes dnešek (i ten, který dnes končí nebo začíná), jinak Volno.
 * Ve střídací den je „teď“ ten, kdo přijel dřív (dnes odjíždí); kdo dnes přijíždí, jde jako další.
 * Další dva uzly jsou následující pevné pobyty podle data příjezdu.
 * Bez aktuálního i budoucího pobytu vrací prázdné pole (řádek se nevykreslí).
 */
export function buildTurnusChain(stays: ChainStay[], today: string): TurnusChainNode[] {
  const byId = new Map<string, ChainStay>()
  for (const s of stays) {
    if (s.status === 'primary' && s.to >= today && !byId.has(s.id)) byId.set(s.id, s)
  }
  const firm = [...byId.values()].sort((a, b) => (a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from)))

  const current = firm.find((s) => s.from <= today) ?? null
  const following = firm.filter((s) => s !== current).slice(0, FOLLOWING_KINDS.length)
  if (!current && following.length === 0) return []

  return [
    { kind: 'now', stay: current },
    ...following.map((stay, i) => ({ kind: FOLLOWING_KINDS[i], stay })),
  ]
}
