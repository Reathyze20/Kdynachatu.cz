/**
 * features/reconstruction/ReconstructionPage.tsx
 * Kanban board for renovation ideas, companies, and tasks.
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Building2, Lightbulb, ListTodo } from 'lucide-react'
import { DndContext, type DragEndEvent } from '@dnd-kit/core'
import { Card } from '@/components/shared/Card'
import { FeatureErrorFallback } from '@/components/shared/FeatureErrorFallback'
import { PageHeader } from '@/components/shared/PageHeader'
import { useAuth } from '@/context/AuthContext'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useReconstruction, useCreateRecItem, useUpdateRecItem } from './hooks/useReconstruction'
import { KanbanColumn } from './KanbanColumn'
import { useReconstructionSensors } from './dndSensors'
import { ReconstructionSkeleton } from './ReconstructionSkeleton'
import { TaskFormModal } from './TaskFormModal'
import { showToast } from '@/lib/toast'
import type { RecCategory, RecItem, RecItemCreate } from '@/api/reconstruction'
import { getNetworkAwareActionMessage } from '@/lib/networkError'
import { formatAmount, formatPercent } from '@/lib/format'

const BOARD_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
    },
  },
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ReconstructionPage() {
  useDocumentTitle('Rekonstrukce');
  const { user, isGuest } = useAuth()
  const queryClient = useQueryClient()
  const { data: items = [], isLoading, isError, error } = useReconstruction()

  const [showModal, setShowModal] = useState(false)
  const [modalCategory, setModalCategory] = useState<RecCategory>('idea')
  const [editItem, setEditItem] = useState<RecItem | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const createItem = useCreateRecItem()
  const updateItem = useUpdateRecItem()

  // ── Computed ──────────────────────────────────────────────────────────────

  const ideaItems = items.filter((i) => i.category === 'idea')
  const companyItems = items.filter((i) => i.category === 'company')
  const taskItems = items.filter((i) => i.category === 'task')

  // Budget bar (tasks only)
  const totalBudget = taskItems.reduce((s, t) => s + (t.cost ?? 0), 0)
  const spentBudget = taskItems
    .filter((t) => t.status === 'done')
    .reduce((s, t) => s + (t.cost ?? 0), 0)
  const budgetPercent = totalBudget > 0 ? Math.min((spentBudget / totalBudget) * 100, 100) : 0
  const hasBudget = totalBudget > 0
  const summary = [
    { label: 'Nápady', value: ideaItems.length, icon: Lightbulb },
    { label: 'Firmy', value: companyItems.length, icon: Building2 },
    { label: 'Úkoly', value: taskItems.length, icon: ListTodo },
  ]

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openAdd(cat: RecCategory) {
    setSubmitError(null)
    setEditItem(null)
    setModalCategory(cat)
    setShowModal(true)
  }

  function openEdit(item: RecItem) {
    setSubmitError(null)
    setEditItem(item)
    setModalCategory(item.category)
    setShowModal(true)
  }

  function handleClose() {
    setSubmitError(null)
    setShowModal(false)
    setEditItem(null)
  }

  function handleSubmit(data: RecItemCreate) {
    setSubmitError(null)
    if (editItem) {
      updateItem.mutate(
        { id: editItem.id, data },
        {
          onSuccess: () => {
            setSubmitError(null)
            setShowModal(false)
            setEditItem(null)
            showToast('Položka upravena.', 'success')
          },
          onError: (error) => {
            setSubmitError(
              getNetworkAwareActionMessage(
                error,
                'Položku se nepodařilo uložit. Zkus to znovu.',
                'Spojení vypadlo dřív, než se položka stihla uložit. Zkus to znovu po obnovení připojení.',
              ),
            )
          },
        },
      )
    } else {
      createItem.mutate(data, {
        onSuccess: () => {
          setSubmitError(null)
          setShowModal(false)
          showToast('Položka přidána.', 'success')
        },
        onError: (error) => {
          setSubmitError(
            getNetworkAwareActionMessage(
              error,
              'Položku se nepodařilo přidat. Zkus to znovu.',
              'Spojení vypadlo dřív, než se položka stihla přidat. Zkus to znovu po obnovení připojení.',
            ),
          )
        },
      })
    }
  }

  const isSubmitting = createItem.isPending || updateItem.isPending
  const currentUserId = user?.userId ?? ''

  // ── DnD ───────────────────────────────────────────────────────────────────

  const sensors = useReconstructionSensors()

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const draggedItem = items.find((i) => i.id === active.id)
    if (!draggedItem) return
    const newCategory = over.id as RecCategory
    if (newCategory === draggedItem.category) return
    updateItem.mutate(
      {
        id: draggedItem.id,
        data: {
          category: newCategory,
          title: draggedItem.title,
          description: draggedItem.description ?? undefined,
          link: draggedItem.link ?? undefined,
          thumbnail: draggedItem.thumbnail ?? undefined,
          cost: draggedItem.cost,
          phone: draggedItem.phone ?? undefined,
          email: draggedItem.email ?? undefined,
          status: draggedItem.status ?? undefined,
          deadline: draggedItem.deadline ?? undefined,
        },
      },
      { onError: () => showToast('Přesun se nepodařilo uložit.', 'error') },
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="main-content-reconstruction" data-testid="reconstruction-page" data-reconstruction-state="loading">
        <ReconstructionSkeleton />
      </div>
    )
  }

  const header = <PageHeader title="Rekonstrukce a plány" subtitle="Nápady, firmy a úkoly na jedno místo" />

  if (isError) {
    return (
      <div className="main-content-reconstruction" data-testid="reconstruction-page" data-reconstruction-state="error">
        <Card flush className="reconstruction-card flex min-h-0 flex-1 flex-col">
          <div className="border-b border-rule-soft p-4 md:p-6">{header}</div>
          <div className="p-4 md:p-6">
            <FeatureErrorFallback
              error={error instanceof Error ? error : new Error('Nepodařilo se načíst rekonstrukce')}
              resetErrorBoundary={() => queryClient.invalidateQueries({ queryKey: ['reconstruction'] })}
              title="Rekonstrukce se nepodařilo načíst"
            />
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="main-content-reconstruction" data-testid="reconstruction-page" data-reconstruction-state="ready">
      {/* .reconstruction-card: fixed height in the desktop frame, natural flow on mobile (up to 767 px, layout.css); its surface duplicates Card, pinned by lightSurfaces.test. */}
      <Card flush className="reconstruction-card flex min-h-0 flex-1 flex-col">
        <div className="grid gap-4 border-b border-rule-soft p-4 md:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          {header}
          <dl className="grid grid-cols-3 gap-2 md:gap-3" aria-label="Souhrn rekonstrukcí" data-testid="reconstruction-summary">
            {summary.map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex flex-col-reverse gap-1 rounded-xl bg-inset p-3 lg:min-w-28">
                <dt className="flex items-center gap-2 text-label text-(--text-muted)">
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  {label}
                </dt>
                <dd className="text-card-title text-(--text-main)">{value}</dd>
              </div>
            ))}
          </dl>

          {hasBudget && (
            <section aria-labelledby="reconstruction-budget-title" className="grid gap-2 rounded-xl bg-inset p-3 md:p-4 lg:col-span-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h2 id="reconstruction-budget-title" className="text-card-title text-(--text-main)">Celkový rozpočet</h2>
                <span className="text-card-title text-(--text-main)">{formatAmount(totalBudget)}</span>
              </div>
              <progress
                value={spentBudget}
                max={totalBudget}
                aria-label="Hotovo z rozpočtu"
                className="h-2 w-full appearance-none overflow-hidden rounded-full border-0 bg-sheet [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-sheet [&::-webkit-progress-value]:bg-primary"
              />
              <div className="flex flex-wrap justify-between gap-x-3 text-meta text-(--text-muted)">
                <span>Hotovo: {formatAmount(spentBudget)} ({formatPercent(budgetPercent)})</span>
                <span>Zbývá: {formatAmount(totalBudget - spentBudget)}</span>
              </div>
            </section>
          )}
        </div>

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <motion.div className="kanban-board" variants={BOARD_VARIANTS} initial="hidden" animate="visible" data-testid="reconstruction-board">
            <KanbanColumn
              category="idea"
              items={ideaItems}
              currentUserId={currentUserId}
              isGuest={isGuest}
              onAdd={openAdd}
              onEdit={openEdit}
            />
            <KanbanColumn
              category="company"
              items={companyItems}
              currentUserId={currentUserId}
              isGuest={isGuest}
              onAdd={openAdd}
              onEdit={openEdit}
            />
            <KanbanColumn
              category="task"
              items={taskItems}
              currentUserId={currentUserId}
              isGuest={isGuest}
              onAdd={openAdd}
              onEdit={openEdit}
            />
          </motion.div>
        </DndContext>
      </Card>

      {showModal && (
        <TaskFormModal
          initialCategory={modalCategory}
          editItem={editItem}
          onClose={handleClose}
          onSubmit={handleSubmit}
          isLoading={isSubmitting}
          errorMessage={submitError}
          onDirty={() => {
            if (submitError) setSubmitError(null)
          }}
        />
      )}
    </div>
  )
}
