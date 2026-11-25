/**
 * features/reconstruction/KanbanColumn.tsx
 * Single kanban column (Nápady / Firmy / Úkoly) + individual TaskCard.
 */
import type { RecItem, RecCategory, RecStatus } from '@/api/reconstruction'
import { useVoteRecItem, useUpdateRecStatus, useDeleteRecItem } from './hooks/useReconstruction'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { DRAGGABLE_TOUCH_ACTION } from './dndSensors'
import { Card } from '@/components/shared/Card'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { formatAmount, formatDate } from '@/lib/format'
import { cn, escapeHtml, formatCount } from '@/lib/utils'
import { getNetworkAwareActionMessage } from '@/lib/networkError'
import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  CalendarDays,
  EllipsisVertical,
  ExternalLink,
  Globe,
  Lightbulb,
  ListTodo,
  Mail,
  Pencil,
  Phone,
  Plus,
  ThumbsUp,
  Trash2,
} from 'lucide-react'

const MOTION_EASE = [0.22, 1, 0.36, 1] as const

const COLUMN_VARIANTS = {
  hidden: { opacity: 0, y: 14, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.24,
      ease: MOTION_EASE,
    },
  },
}

const ITEM_MOTION = {
  initial: { opacity: 0, y: 10, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.98 },
  transition: { duration: 0.2, ease: MOTION_EASE },
}

const EMPTY_MOTION = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.18, ease: MOTION_EASE },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDeadlineNear(deadline: string): boolean {
  const d = new Date(deadline)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000
}

const byVotes = (a: RecItem, b: RecItem) => (b.votes?.length ?? 0) - (a.votes?.length ?? 0)

// ─── ItemMenu ─────────────────────────────────────────────────────────────────

/** Kebab menu Upravit / Smazat (DESIGN.md §7 „Akce nad položkou“), vidět i bez najetí myší. */
function ItemMenu({ title, onEdit, onDelete }: { title: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="-my-3 -mr-3 shrink-0" aria-label={`Akce s položkou ${title}`} data-testid="reconstruction-item-menu">
          <EllipsisVertical aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onEdit} data-testid="reconstruction-item-edit-button">
          <Pencil aria-hidden="true" />
          Upravit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="danger" onSelect={onDelete} data-testid="reconstruction-item-delete-button">
          <Trash2 aria-hidden="true" />
          Smazat
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const CARD_CLASS = 'kanban-item overflow-hidden rounded-xl'
const TITLE_ROW_CLASS = 'flex items-start gap-2'
// Hustší karta v kanban sloupci než běžná Card (p-4 md:p-6). Záporné okraje kebabu a políčka (-m*-3) počítají s p-3.
const BODY_CLASS = 'flex flex-col gap-2 p-3'
const META_CLASS = 'text-meta text-(--text-muted)'

// ─── TaskCard ─────────────────────────────────────────────────────────────────

interface TaskCardProps {
  item: RecItem
  currentUserId: string
  isGuest?: boolean
  onEdit: (item: RecItem) => void
}

function TaskCard({ item, currentUserId, isGuest = false, onEdit }: TaskCardProps) {
  const vote = useVoteRecItem()
  const updateStatus = useUpdateRecStatus()
  const deleteItem = useDeleteRecItem()

  const hasVoted = item.votes?.includes(currentUserId)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function handleVote() {
    vote.mutate({ id: item.id, currentUserId })
  }

  function handleStatusChange(status: RecStatus) {
    updateStatus.mutate({ id: item.id, status })
  }

  function handleDelete() {
    setDeleteError(null)
    setShowDeleteConfirm(true)
  }

  function confirmDelete() {
    setDeleteError(null)
    deleteItem.mutate(item.id, {
      onSuccess: () => {
        setDeleteError(null)
        setShowDeleteConfirm(false)
      },
      onError: (error) => {
        setDeleteError(
          getNetworkAwareActionMessage(
            error,
            'Položku se nepodařilo smazat. Zkus to znovu.',
            'Spojení vypadlo dřív, než se položka stihla smazat. Zkus to znovu po obnovení připojení.',
          ),
        )
      },
    })
  }

  // ── Idea card ──────────────────────────────────────────────────────────────

  if (item.category === 'idea') {
    return (
      <Card as="article" flush className={CARD_CLASS} data-testid="reconstruction-item-card" data-item-id={item.id} data-item-category={item.category}>
        {item.thumbnail && (
          <div className="idea-thumbnail">
            <img src={item.thumbnail} alt="" loading="lazy" />
          </div>
        )}
        <div className={BODY_CLASS}>
          <div className={TITLE_ROW_CLASS}>
            <div className="kanban-item-title">{item.title}</div>
            {!isGuest && <ItemMenu title={item.title} onEdit={() => onEdit(item)} onDelete={handleDelete} />}
          </div>
          {item.description && (
            <div
              className="kanban-item-desc"
              dangerouslySetInnerHTML={{ __html: escapeHtml(item.description).replace(/\n/g, '<br>') }}
            />
          )}
          {item.link && (
            <a href={item.link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-(--touch-target-min) items-center gap-1 self-start text-label text-primary underline-offset-4 hover:underline">
              Otevřít odkaz
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className={META_CLASS}>
              {item.cost != null && `${formatAmount(item.cost)} · `}
              {formatCount(item.votes?.length ?? 0, 'hlas', 'hlasy', 'hlasů')}
            </span>
            <Button
              variant={hasVoted ? 'ghost' : 'secondary'}
              size="sm"
              onClick={handleVote}
              disabled={vote.isPending}
              data-testid="reconstruction-item-vote-button"
            >
              <ThumbsUp aria-hidden="true" />
              {hasVoted ? 'Beru hlas zpět' : 'Chci to'}
            </Button>
          </div>
        </div>
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="Smazat položku"
          message="Opravdu chceš smazat tuto položku?"
          confirmLabel="Smazat"
          danger
          loading={deleteItem.isPending}
          errorMessage={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => {
            setShowDeleteConfirm(false)
            setDeleteError(null)
          }}
        />
      </Card>
    )
  }

  // ── Company card ───────────────────────────────────────────────────────────

  if (item.category === 'company') {
    return (
      <Card as="article" flush className={cn(CARD_CLASS, BODY_CLASS)} data-testid="reconstruction-item-card" data-item-id={item.id} data-item-category={item.category}>
        <div className={TITLE_ROW_CLASS}>
          <div className="kanban-item-title">{item.title}</div>
          {!isGuest && <ItemMenu title={item.title} onEdit={() => onEdit(item)} onDelete={handleDelete} />}
        </div>
        {item.description && (
          <div
            className="kanban-item-desc"
            dangerouslySetInnerHTML={{ __html: escapeHtml(item.description).replace(/\n/g, '<br>') }}
          />
        )}
        {(item.phone || item.email || item.link) && (
          <div className="flex flex-wrap gap-2 border-t border-rule-soft pt-2">
            {item.phone && (
              <Button asChild variant="secondary" size="sm">
                <a href={`tel:${item.phone}`}>
                  <Phone aria-hidden="true" />
                  Zavolat
                </a>
              </Button>
            )}
            {item.email && (
              <Button asChild variant="secondary" size="sm">
                <a href={`mailto:${item.email}`}>
                  <Mail aria-hidden="true" />
                  Napsat
                </a>
              </Button>
            )}
            {item.link && (
              <Button asChild variant="secondary" size="sm">
                <a href={item.link} target="_blank" rel="noopener noreferrer">
                  <Globe aria-hidden="true" />
                  Web
                </a>
              </Button>
            )}
          </div>
        )}
        {/* Stav je na kartě jen jednou: select s popiskem, bez štítku navíc. */}
        <label className="flex flex-col gap-1 text-label text-(--text-muted)">
          Stav
          <select
            className="company-status-select"
            value={item.status ?? 'pending'}
            onChange={(e) => handleStatusChange(e.target.value as RecStatus)}
            disabled={updateStatus.isPending}
            data-testid="reconstruction-item-status-select"
          >
            <option value="pending">Čeká na kontakt</option>
            <option value="contacted">Kontaktováno</option>
            <option value="approved">Schváleno</option>
            <option value="rejected">Zamítnuto</option>
          </select>
        </label>
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="Smazat položku"
          message="Opravdu chceš smazat tuto položku?"
          confirmLabel="Smazat"
          danger
          loading={deleteItem.isPending}
          errorMessage={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => {
            setShowDeleteConfirm(false)
            setDeleteError(null)
          }}
        />
      </Card>
    )
  }

  // ── Task card ──────────────────────────────────────────────────────────────

  const isDone = item.status === 'done'
  return (
    <Card as="article" flush className={cn(CARD_CLASS, BODY_CLASS, isDone && 'task-done')} data-testid="reconstruction-item-card" data-item-id={item.id} data-item-category={item.category}>
      <div className={TITLE_ROW_CLASS}>
        {/* Dotyková plocha 48 px přes okraj karty, samotné políčko 20 px. */}
        <label className="-my-3 -ml-3 flex size-12 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            className="size-5 cursor-pointer accent-(--brand-primary)"
            checked={isDone}
            onChange={(e) => handleStatusChange(e.target.checked ? 'done' : 'pending')}
            disabled={updateStatus.isPending}
            aria-label={`Hotovo: ${item.title}`}
            data-testid="reconstruction-item-toggle-done"
          />
        </label>
        <div className="kanban-item-title">{item.title}</div>
        {!isGuest && <ItemMenu title={item.title} onEdit={() => onEdit(item)} onDelete={handleDelete} />}
      </div>
      {item.description && (
        <div
          className="kanban-item-desc"
          dangerouslySetInnerHTML={{ __html: escapeHtml(item.description).replace(/\n/g, '<br>') }}
        />
      )}
      {(item.cost != null || item.deadline) && (
        <div className={`flex items-center justify-between gap-2 ${META_CLASS}`}>
          <span>{item.cost != null && formatAmount(item.cost)}</span>
          {item.deadline && (
            <span className={cn('flex items-center gap-1', isDeadlineNear(item.deadline) && 'font-semibold text-(--status-error-dark)')}>
              <CalendarDays aria-hidden="true" className="size-4" />
              {formatDate(item.deadline)}
            </span>
          )}
        </div>
      )}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Smazat položku"
        message="Opravdu chceš smazat tuto položku?"
        confirmLabel="Smazat"
        danger
        loading={deleteItem.isPending}
        errorMessage={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => {
          setShowDeleteConfirm(false)
          setDeleteError(null)
        }}
      />
    </Card>
  )
}

// ─── DraggableCard ────────────────────────────────────────────────────────────

interface DraggableCardProps {
  id: string
  disabled: boolean
  children: React.ReactNode
}

function DraggableCard({ id, disabled, children }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled })

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.35 : 1, touchAction: DRAGGABLE_TOUCH_ACTION, cursor: disabled ? 'default' : 'grab' }}
      {...(disabled ? {} : { ...listeners, ...attributes })}
    >
      {children}
    </div>
  )
}

// ─── Column config ────────────────────────────────────────────────────────────

const COLUMN_CONFIG: Record<
  RecCategory,
  {
    title: string
    icon: LucideIcon
    cssClass: string
    listId: string
    emptyMessage: string
    addLabel: string
  }
> = {
  idea: {
    title: 'Nápady & Inspirace',
    icon: Lightbulb,
    cssClass: 'col-navrzeno',
    listId: 'list-idea',
    emptyMessage: 'Zatím tu nejsou žádné nápady.',
    addLabel: 'Nový nápad',
  },
  company: {
    title: 'Firmy & Kontakty',
    icon: Building2,
    cssClass: 'col-schvaleno',
    listId: 'list-company',
    emptyMessage: 'Zatím tu nejsou žádné firmy.',
    addLabel: 'Nová firma',
  },
  task: {
    title: 'Úkoly & Práce',
    icon: ListTodo,
    cssClass: 'col-probehlo',
    listId: 'list-task',
    emptyMessage: 'Zatím tu nejsou žádné úkoly.',
    addLabel: 'Nový úkol',
  },
}

// ─── KanbanColumn ─────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  category: RecCategory
  items: RecItem[]
  currentUserId: string
  isGuest?: boolean
  onAdd: (category: RecCategory) => void
  onEdit: (item: RecItem) => void
}

export function KanbanColumn({ category, items, currentUserId, isGuest = false, onAdd, onEdit }: KanbanColumnProps) {
  const cfg = COLUMN_CONFIG[category]
  const Icon = cfg.icon
  const { setNodeRef, isOver } = useDroppable({ id: category })
  // Nápady s víc hlasy nahoře, při shodě zůstává pořadí ze serveru.
  const sorted = category === 'idea' ? [...items].sort(byVotes) : items

  return (
    <motion.section className={`kanban-column ${cfg.cssClass}`} variants={COLUMN_VARIANTS}>
      <div className="kanban-column-header">
        <span>
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          {cfg.title}
        </span>
        <span className="kanban-count">{items.length}</span>
        {!isGuest && (
          <Button variant="ghost" size="icon" className="-my-2 -mr-2" data-category={category} onClick={() => onAdd(category)} aria-label={cfg.addLabel}>
            <Plus aria-hidden="true" />
          </Button>
        )}
      </div>

      <motion.div
        ref={setNodeRef}
        className={`kanban-column-body${isOver ? ' kanban-drop-over' : ''}`}
        id={cfg.listId}
        layout
      >
        <AnimatePresence initial={false} mode="popLayout">
          {items.length === 0 ? (
            <motion.div key={`${category}-empty`} {...EMPTY_MOTION}>
              <EmptyState
                icon={Icon}
                message={cfg.emptyMessage}
                action={isGuest ? undefined : { label: cfg.addLabel, icon: Plus, onClick: () => onAdd(category) }}
              />
            </motion.div>
          ) : (
            sorted.map((item) => (
              <motion.div key={item.id} layout {...ITEM_MOTION}>
                <DraggableCard id={item.id} disabled={isGuest}>
                  <TaskCard
                    item={item}
                    currentUserId={currentUserId}
                    isGuest={isGuest}
                    onEdit={onEdit}
                  />
                </DraggableCard>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </motion.div>
    </motion.section>
  )
}
