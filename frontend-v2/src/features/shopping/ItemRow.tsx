/**
 * ItemRow.tsx — Řádek položky v nákupním seznamu (#221): `[stav] ★ Název [Ze zásob] … [avatar] [⋯]`.
 * Ovladač stavu a klepnutí na řádek: Koupit → Koupeno, vyřešená položka → Koupit.
 * „Přivezu z domova“, důležitost a smazání jsou v menu položky. Na desktopu, kde jsou Zásoby vedle Nákupu,
 * má propojená položka ve stavu Koupit navíc „Vrátit do zásob“ (#226): smaže ji z nákupu a zásoba už není v nákupu.
 */
import { memo } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Circle, CircleCheck, EllipsisVertical, House, Star, Trash2, Undo2, type LucideIcon } from 'lucide-react'
import type { ShoppingItem, ItemStatus } from '@/api/shopping'
import { useToggleItemStatus, useDeleteItem, useToggleItemEssential } from './hooks/useShoppingLists'
import { useAuth } from '@/context/AuthContext'
import { useMediaQuery, WIDE_DESKTOP_QUERY } from '@/hooks/useMediaQuery'
import { AnimalAvatar } from '@/components/shared/AnimalAvatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Props {
  item: ShoppingItem
  listCreatedById: string
}

/** Tři podoby ovladače stavu: přístupný název říká stav i to, co klepnutí udělá. */
const STATUS_CONTROL: Record<ItemStatus, { label: string; Icon: LucideIcon; tone: string; next: ItemStatus }> = {
  pending: { label: 'Koupit – označit jako koupené', Icon: Circle, tone: 'text-(--text-muted)', next: 'purchased' },
  bring_from_home: { label: 'Přivezu z domova – vrátit na Koupit', Icon: House, tone: 'text-[rgb(var(--ok))]', next: 'pending' },
  purchased: { label: 'Koupeno – vrátit na Koupit', Icon: CircleCheck, tone: 'text-[rgb(var(--ok))]', next: 'pending' },
}

function ItemRowInner({ item, listCreatedById }: Props) {
  const { user } = useAuth()
  const toggleStatus = useToggleItemStatus()
  const deleteItem = useDeleteItem()
  const toggleEssential = useToggleItemEssential()
  // Stejný práh jako dva sloupce na `ShoppingPage`: zásoby, kam se položka vrací, jsou vidět vedle
  const pantryAlongside = useMediaQuery(WIDE_DESKTOP_QUERY)

  const control = STATUS_CONTROL[item.status]
  const isResolved = item.status !== 'pending'
  const isGuest = user?.role === 'guest'
  const canDelete = item.addedById === user?.userId || listCreatedById === user?.userId || user?.role === 'admin'
  const hasStatusAction = item.status !== 'purchased'
  // Vrácení = existující smazání položky, proto jen pro toho, kdo smí mazat (jinak server vrátí 403)
  const canReturnToPantry = pantryAlongside && canDelete && item.status === 'pending' && !!item.linkedInventoryId
  const hasMenu = hasStatusAction || !isGuest || canDelete
  const arrangedBy = isResolved && item.purchasedBy
    ? `${item.status === 'bring_from_home' ? 'Přiveze' : 'Koupil(a)'} ${item.purchasedBy.username}`
    : null

  const setStatus = (status: ItemStatus) => toggleStatus.mutate({ itemId: item.id, status })

  // Klepnutí do řádku mimo tlačítka; menu je v portálu, jeho kliknutí do řádku v DOM nepatří.
  function handleRowClick(e: React.MouseEvent<HTMLElement>) {
    const target = e.target as HTMLElement
    if (!e.currentTarget.contains(target) || target.closest('button')) return
    setStatus(control.next)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="flex min-h-(--touch-target-min) cursor-pointer select-none items-center gap-2 border-b border-rule-soft px-1 last:border-b-0 hover:bg-(--bg-hover)"
      data-testid="shopping-item-row"
      data-item-id={item.id}
      data-status={item.status}
      data-essential={String(item.isEssential)}
      onClick={handleRowClick}
    >
      <Button variant="ghost" size="icon" className="shrink-0" aria-label={control.label} onClick={() => setStatus(control.next)}>
        <control.Icon aria-hidden="true" className={control.tone} />
      </Button>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 py-2">
        <span className="flex min-w-0 items-start gap-1">
          {item.isEssential && (
            <Star role="img" aria-label="Důležité" fill="currentColor" className="mt-1 size-4 shrink-0 text-[rgb(var(--low))]" />
          )}
          <span className={`min-w-0 break-words text-body ${isResolved ? 'text-(--text-muted)' : 'text-(--text-main)'} ${item.status === 'purchased' ? 'line-through' : ''}`}>
            {item.name}
          </span>
        </span>
        {item.linkedInventoryId && (
          <Badge variant="outline" className="shrink-0 border-rule-soft font-normal text-muted-foreground" title="Po vyřešení se doplní zásoba">
            Ze zásob<span className="sr-only"> – po vyřešení se doplní zásoba</span>
          </Badge>
        )}
      </div>

      {arrangedBy && item.purchasedBy && (
        <span role="img" aria-label={arrangedBy} title={arrangedBy} className="shrink-0">
          <AnimalAvatar icon={item.purchasedBy.animalIcon ?? null} username={item.purchasedBy.username} size={24} />
        </span>
      )}

      {hasMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0" aria-label={`Akce s položkou ${item.name}`}>
              <EllipsisVertical aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {canReturnToPantry && (
              <DropdownMenuItem onSelect={() => deleteItem.mutate(item.id)}>
                <ArrowLeft aria-hidden="true" />Vrátit do zásob
              </DropdownMenuItem>
            )}
            {item.status === 'pending' && (
              <DropdownMenuItem onSelect={() => setStatus('bring_from_home')}>
                <House aria-hidden="true" />Přivezu z domova
              </DropdownMenuItem>
            )}
            {item.status === 'bring_from_home' && (
              <DropdownMenuItem onSelect={() => setStatus('pending')}>
                <Undo2 aria-hidden="true" />Zrušit, nepřivezu
              </DropdownMenuItem>
            )}
            {!isGuest && (
              <DropdownMenuItem onSelect={() => toggleEssential.mutate(item.id)}>
                <Star aria-hidden="true" />{item.isEssential ? 'Zrušit důležitost' : 'Označit jako důležité'}
              </DropdownMenuItem>
            )}
            {canDelete && (hasStatusAction || !isGuest) && <DropdownMenuSeparator />}
            {canDelete && (
              <DropdownMenuItem variant="danger" onSelect={() => deleteItem.mutate(item.id)}>
                <Trash2 aria-hidden="true" />Smazat
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span aria-hidden="true" className="size-(--touch-target-min) shrink-0" />
      )}
    </motion.div>
  )
}

export const ItemRow = memo(ItemRowInner)
