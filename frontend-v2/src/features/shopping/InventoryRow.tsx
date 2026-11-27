/**
 * InventoryRow.tsx — Řádek zásoby (#223): název a umístění vlevo, štítek stavu a menu ⋮ (Upravit, Smazat, #676)
 * v kartě řádku vpravo, mimo kartu sloupec akcí stejné šířky („+“, „V nákupu“, nebo nic), takže štítky drží
 * svislou linku. Klepnutí na řádek nic neotevírá; host menu nevidí.
 */
import { EllipsisVertical, Pencil, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import type { InventoryItem } from '@/api/shopping'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { INVENTORY_STATUS_LABELS, isMissingStock } from './constants'

interface Props {
  item: InventoryItem
  onEdit: (item: InventoryItem) => void
  onDelete: (item: InventoryItem) => void
  onAddToCart: (item: InventoryItem) => void
}

const STATUS_TONES: Record<InventoryItem['status'], string> = {
  OK: 'bg-(--ok-bg) text-[rgb(var(--ok))]',
  LOW: 'bg-(--low-bg) text-[rgb(var(--low))]',
  EMPTY: 'bg-(--empty-bg) text-[rgb(var(--empty))]',
}

export function InventoryRow({ item, onEdit, onDelete, onAddToCart }: Props) {
  const { user } = useAuth()
  const isGuest = user?.role === 'guest'

  return (
    <li
      className="flex items-center gap-2"
      data-testid="inventory-item-row"
      data-item-id={item.id}
      data-item-status={item.status}
    >
      <div className={`flex min-h-(--touch-target-min) min-w-0 flex-1 items-center gap-2 rounded-xl border border-rule-soft bg-sheet py-2 pl-3 ${isGuest ? 'pr-3' : 'pr-0'}`}>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-body text-(--text-main)">{item.name}</span>
          {item.location && <span className="block text-meta text-(--text-muted)">{item.location}</span>}
        </span>
        <span className={`inline-flex min-w-24 shrink-0 justify-center rounded-full px-2 py-1 text-eyebrow uppercase ${STATUS_TONES[item.status]}`}>
          {INVENTORY_STATUS_LABELS[item.status]}
        </span>
        {!isGuest && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="-my-2 shrink-0" aria-label={`Akce se zásobou ${item.name}`}>
                <EllipsisVertical aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => onEdit(item)}>
                <Pencil aria-hidden="true" />Upravit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="danger" onSelect={() => onDelete(item)}>
                <Trash2 aria-hidden="true" />Smazat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
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
