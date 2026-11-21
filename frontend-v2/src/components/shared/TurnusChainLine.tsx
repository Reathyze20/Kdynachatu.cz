/**
 * components/shared/TurnusChainLine.tsx — řetězec turnusu jako jeden textový řádek
 * „Teď: X → Další: Y (po 14. 12.) → Pak: Z (pá 18. 12.)“ (návrh #1 díl 4 = A, návrh #4 díl 3 = A).
 * Prezentační komponenta sdílená Přehledem (#172) a kalendářem (#211); uzly počítá `buildTurnusChain`.
 * Prázdný řetězec = nic se nevykreslí. Řádek se na úzkém displeji zalomí, dlouhá jména se zkrátí.
 */
import { Fragment } from 'react'
import { ArrowRight } from 'lucide-react'
import type { TurnusChainKind, TurnusChainNode } from '@/lib/turnusChain'
import { formatShortDayDate } from '@/lib/dateUtils'

const KIND_LABEL: Record<TurnusChainKind, string> = { now: 'Teď', next: 'Další', later: 'Pak' }

interface TurnusChainLineProps {
  nodes: TurnusChainNode[]
  /** Klepnutí na uzel s pobytem (kalendář otevře detail); bez něj je řádek jen text. */
  onSelect?: (stayId: string) => void
  className?: string
}

export function TurnusChainLine({ nodes, onSelect, className }: TurnusChainLineProps) {
  if (nodes.length === 0) return null
  return (
    <div role="group" aria-label="Řetězec turnusu" className={className ? `turnus-chain ${className}` : 'turnus-chain'}>
      {nodes.map((node, i) => {
        const name = node.stay ? (node.stay.isMine ? 'Ty' : node.stay.username) : 'Volno'
        const nameNode = node.stay && onSelect ? (
          <button type="button" className="turnus-chain__name turnus-chain__name--button" onClick={() => onSelect(node.stay!.id)}>
            {name}
          </button>
        ) : (
          <strong className="turnus-chain__name">{name}</strong>
        )
        return (
          <Fragment key={node.stay?.id ?? node.kind}>
            {i > 0 && <ArrowRight className="turnus-chain__arrow" aria-hidden="true" />}
            <span className={`turnus-chain__node turnus-chain__node--${node.kind}`}>
              <span className="turnus-chain__label">{KIND_LABEL[node.kind]}:</span> {nameNode}
              {node.kind !== 'now' && node.stay && <span className="turnus-chain__date"> ({formatShortDayDate(node.stay.from)})</span>}
            </span>
          </Fragment>
        )
      })}
    </div>
  )
}
