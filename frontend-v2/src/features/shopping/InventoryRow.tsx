/**
 * InventoryRow.tsx — Řádek zásoby (#223): název a umístění vlevo, štítek stavu v kartě řádku vpravo,
 * mimo kartu sloupec akcí stejné šířky („+“, „V nákupu“, nebo nic), takže štítky drží svislou linku.
 */
import { Plus, ShoppingCart } from 'lucide-react'
import type { InventoryItem } from '@/api/shopping'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { INVENTORY_STATUS_LABELS, isMissingStock } from './constants'

interface Props {
  item: InventoryItem
  onEdit: (item: InventoryItem) => void
  onAddToCart: (item: InventoryItem) => void
}

const STATUS_TONES: Record<InventoryItem['status'], string> = {
  OK: 'bg-(--ok-bg) text-[rgb(var(--ok))]',
  LOW: 'bg-(--low-bg) text-[rgb(var(--low))]',
  EMPTY: 'bg-(--empty-bg) text-[rgb(var(--empty))]',
}
const CARD = 'flex min-h-(--touch-target-min) min-w-0 flex-1 items-center gap-3 rounded-xl border border-rule-soft bg-sheet px-4 py-2 text-left'

export function InventoryRow({ item, onEdit, onAddToCart }: Props) {
  const { user } = useAuth()
  const isGuest = user?.role === 'guest'
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-body text-(--text-main)">{item.name}</span>
        {item.location && <span className="block text-meta text-(--text-muted)">{item.location}</span>}
      </span>
      <span className={`inline-flex min-w-28 shrink-0 justify-center rounded-full px-2 py-1 text-eyebrow uppercase ${STATUS_TONES[item.status]}`}>
        {INVENTORY_STATUS_LABELS[item.status]}
      </span>
    </>
  )

  return (
    <li
      className="flex items-center gap-2"
      data-testid="inventory-item-row"
      data-item-id={item.id}
      data-item-status={item.status}
    >
      {isGuest ? (
        <div className={CARD}>{content}</div>
      ) : (
        <button type="button" onClick={() => onEdit(item)} className={`${CARD} hover:bg-(--bg-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}>
          {content}
        </button>
      )}
      <div className="flex size-(--touch-target-min) shrink-0 items-center justify-center">
        {item.inCart ? (
          <ShoppingCart role="img" aria-label="V nákupu" className="size-5 text-[rgb(var(--ok))]" />
        ) : isMissingStock(item) ? (
          <Button variant="secondary" size="icon" aria-label="Přidat do nákupu" onClick={() => onAddToCart(item)}>
            <Plus aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </li>
  )
}
