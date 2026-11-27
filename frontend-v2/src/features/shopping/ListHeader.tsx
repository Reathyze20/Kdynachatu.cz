/**
 * ListHeader.tsx — Hlavička aktuálního nákupního seznamu (#224): název, nebo výběr seznamu (jen při víc aktivních,
 * u každého počet ke koupi), postup x/y a menu ⋮ seznamu (DESIGN.md §7). Přejmenovat a Smazat jen zakladatel
 * nebo správce (server vrací jinak 403), Uzavřít jen když je všechno vyřešené.
 */
import { Archive, EllipsisVertical, Pencil, Send, Trash2 } from 'lucide-react'
import type { ShoppingList } from '@/api/shopping'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export interface ListHeaderActions {
  onSelect: (id: string) => void
  onRename: (list: ShoppingList) => void
  onShare: (list: ShoppingList) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
}

interface Props extends ListHeaderActions {
  list: ShoppingList
  lists: ShoppingList[]
}

const pendingCount = (list: ShoppingList) => list.items.filter(i => i.status === 'pending').length

export function ListHeader({ list, lists, onSelect, onRename, onShare, onArchive, onDelete }: Props) {
  const { user, isAdmin } = useAuth()
  const canEdit = list.createdById === user?.userId || isAdmin
  const total = list.items.length
  const done = total - pendingCount(list)
  const canArchive = total > 0 && done === total && !list.isResolved

  return (
    <div className="flex items-center gap-2">
      {lists.length > 1 ? (
        <Select aria-label="Nákupní seznam" className="min-w-0 flex-1" value={list.id} onChange={e => onSelect(e.target.value)}>
          {lists.map(l => <option key={l.id} value={l.id}>{`${l.name} · ${pendingCount(l)} ke koupi`}</option>)}
        </Select>
      ) : (
        <h2 className="min-w-0 flex-1 text-card-title text-(--text-main) [overflow-wrap:anywhere]">{list.name}</h2>
      )}
      <span className="shrink-0 text-meta text-(--text-muted)">{done}/{total}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0" aria-label={`Akce se seznamem ${list.name}`}>
            <EllipsisVertical aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {canEdit && <DropdownMenuItem onSelect={() => onRename(list)}><Pencil aria-hidden="true" />Přejmenovat</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => onShare(list)}><Send aria-hidden="true" />Sdílet na nástěnku</DropdownMenuItem>
          {canArchive && <DropdownMenuItem onSelect={() => onArchive(list.id)}><Archive aria-hidden="true" />Uzavřít</DropdownMenuItem>}
          {canEdit && <DropdownMenuSeparator />}
          {canEdit && <DropdownMenuItem variant="danger" onSelect={() => onDelete(list.id)}><Trash2 aria-hidden="true" />Smazat</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
