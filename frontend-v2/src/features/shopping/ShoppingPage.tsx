/**
 * ShoppingPage.tsx — Zásoby a nákupy: přepínač „Zásoby / Nákup · N“ (#224), režim v URL (`?view=pantry|shopping`),
 * bez parametru Nákup. Nákup = rovnou aktuální seznam s hlavičkou a menu ⋮, Zásoby = spíž na chatě.
 */
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { ViewSwitcher, type ActiveView } from './ViewSwitcher'
import type { ShoppingList } from '@/api/shopping'
import {
  useShoppingLists,
  useCreateList,
  useDeleteList,
  useArchiveList,
  useRenameList,
} from './hooks/useShoppingLists'
import { ListHeader } from './ListHeader'
import { ListDetail } from './ListDetail'
import { PantryView } from './PantryView'
import { ShareListDialog } from './ShareListDialog'
import { showToast } from '@/lib/toast'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PromptDialog } from '@/components/shared/PromptDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/shared/Card'
import { EmptyState } from '@/components/shared/EmptyState'
import dormouseBasket from '@/features/dashboard/scene/dormouse-basket.png'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import {
  ShoppingErrorState,
  getShoppingActionErrorMessage,
} from './ShoppingErrorState'

/** Aktuální seznam se pamatuje v tomto prohlížeči (#224). */
const SELECTED_LIST_KEY = 'shoppingSelectedListId'

function readSelectedListId(): string | null {
  try {
    return localStorage.getItem(SELECTED_LIST_KEY)
  } catch {
    return null
  }
}

export function ShoppingPage() {
  useDocumentTitle('Zásoby a nákupy');
  const [searchParams, setSearchParams] = useSearchParams()
  const activeView: ActiveView = searchParams.get('view') === 'pantry' ? 'pantry' : 'shopping'
  const {
    data: lists = [],
    isLoading,
    isError,
    error: listsError,
    refetch: refetchLists,
  } = useShoppingLists()
  const createList = useCreateList()
  const deleteList = useDeleteList()
  const archiveList = useArchiveList()
  const renameList = useRenameList()

  // Položky ve stavu Koupit ve všech aktivních seznamech; dokud se seznamy nenačtou, bez čísla
  const pendingCount = isLoading || isError
    ? undefined
    : lists.reduce((sum, list) => sum + list.items.filter(i => i.status === 'pending').length, 0)

  const [selectedListId, setSelectedListId] = useState<string | null>(readSelectedListId)
  const [shareList, setShareList] = useState<ShoppingList | null>(null)
  const [renameTarget, setRenameTarget] = useState<ShoppingList | null>(null)
  /** Předvyplněný název otevřeného dialogu „Nový nákupní seznam“; `null` = zavřený. */
  const [newListName, setNewListName] = useState<string | null>(null)
  const [deleteListId, setDeleteListId] = useState<string | null>(null)
  const [archiveListId, setArchiveListId] = useState<string | null>(null)
  const [newListError, setNewListError] = useState<string | null>(null)
  const [deleteListError, setDeleteListError] = useState<string | null>(null)
  const [archiveListError, setArchiveListError] = useState<string | null>(null)

  // Bez volby, nebo když zapamatovaný seznam zmizel (smazaný, uzavřený), platí nejnovější aktivní (API řadí od nejnovějšího)
  const selectedList = lists.find(l => l.id === selectedListId) ?? lists[0] ?? null

  function rememberList(id: string | null) {
    setSelectedListId(id)
    try {
      if (id) localStorage.setItem(SELECTED_LIST_KEY, id)
      else localStorage.removeItem(SELECTED_LIST_KEY)
    } catch {
      // Bez úložiště platí volba jen do obnovení stránky
    }
  }

  // Náhradní volbu zapíše i do prohlížeče (také po smazání nebo uzavření seznamu), ať se příště neotevře zmizelý seznam
  const shownListId = selectedList?.id ?? null
  useEffect(() => {
    if (!isLoading && !isError && shownListId !== selectedListId) rememberList(shownListId)
  }, [isLoading, isError, shownListId, selectedListId])

  function handleChangeView(view: ActiveView) {
    if (view === activeView) return
    setSearchParams({ view }, { replace: true })
  }

  function handleDeleteList(id: string) {
    setDeleteListError(null)
    setDeleteListId(id)
  }

  async function confirmDeleteList() {
    if (!deleteListId) return
    setDeleteListError(null)
    try {
      await deleteList.mutateAsync(deleteListId)
      showToast('Seznam smazán.', 'success')
      setDeleteListId(null)
    } catch (error) {
      setDeleteListError(
        getShoppingActionErrorMessage(
          error,
          'Seznam se nepodařilo smazat. Zkus to znovu.',
          'Spojení vypadlo dřív, než se seznam stihl smazat. Zkus to znovu po obnovení připojení.',
        ),
      )
    }
  }

  function handleArchiveList(id: string) {
    setArchiveListError(null)
    setArchiveListId(id)
  }

  async function confirmArchiveList() {
    if (!archiveListId) return
    setArchiveListError(null)
    try {
      await archiveList.mutateAsync(archiveListId)
      showToast('Seznam archivován.', 'success')
      setArchiveListId(null)
    } catch (error) {
      setArchiveListError(
        getShoppingActionErrorMessage(
          error,
          'Seznam se nepodařilo uzavřít. Zkus to znovu.',
          'Spojení vypadlo dřív, než se seznam stihl uzavřít. Zkus to znovu po obnovení připojení.',
        ),
      )
    }
  }

  async function handleCreateList(name: string) {
    const cleanName = name.trim()
    if (!cleanName) return
    if (cleanName.length > 100) {
      showToast('Název seznamu je příliš dlouhý (max 100 znaků).', 'error')
      return
    }
    setNewListError(null)
    try {
      const created = await createList.mutateAsync(cleanName)
      setNewListName(null)
      showToast('Nákupní seznam vytvořen.', 'success')
      rememberList(created.id)
    } catch (error) {
      setNewListError(
        getShoppingActionErrorMessage(
          error,
          'Nový nákupní seznam se nepodařilo vytvořit. Zkus to znovu.',
          'Spojení vypadlo dřív, než se seznam stihl vytvořit. Zkus to znovu po obnovení připojení.',
        ),
      )
    }
  }

  function handleRenameList(name: string) {
    if (renameTarget && name !== renameTarget.name) renameList.mutate({ id: renameTarget.id, name })
    setRenameTarget(null)
  }

  return (
    <div className="shopping-page" id="shopping-page" data-testid="shopping-page">
      {/* Page header inside the legacy master-detail frame, so it pads like the cards below it */}
      <div className="shrink-0 p-3 pb-0 md:p-6 md:pb-0">
        <Card className="flex flex-col gap-4">
          <PageHeader
            title="Zásoby a nákupy"
            primaryAction={activeView === 'shopping' ? { label: 'Nový seznam', icon: Plus, onClick: () => setNewListName('') } : undefined}
          />
          <ViewSwitcher activeView={activeView} onChange={handleChangeView} pendingCount={pendingCount} />
        </Card>
      </div>

      {/* Obsah: Zásoby, nebo rovnou aktuální nákupní seznam */}
      <div className="shopping-layout" id="shopping-layout">
        <div className="shopping-right-col">
          {activeView === 'pantry' ? (
            <PantryView />
          ) : selectedList ? (
            <ListDetail
              list={selectedList}
              header={
                <ListHeader
                  list={selectedList}
                  lists={lists}
                  onSelect={rememberList}
                  onRename={setRenameTarget}
                  onShare={setShareList}
                  onArchive={handleArchiveList}
                  onDelete={handleDeleteList}
                />
              }
            />
          ) : (
            <div className="p-3 md:p-6">
              <Card>
                {isLoading ? (
                  [1, 2, 3].map((i) => (
                    <div key={i} className="skeleton-list-item">
                      <div className="skeleton skeleton-text medium"></div>
                    </div>
                  ))
                ) : isError ? (
                  <ShoppingErrorState
                    title="Seznamy se nepodařilo načíst"
                    error={listsError}
                    onRetry={() => {
                      void refetchLists()
                    }}
                  />
                ) : (
                  <EmptyState
                    image={dormouseBasket}
                    message="Zatím tu není žádný nákupní seznam."
                    action={{ label: 'Založit nákupní seznam', icon: Plus, onClick: () => setNewListName('Nákup') }}
                  />
                )}
              </Card>
            </div>
          )}
        </div>
      </div>

      <PromptDialog
        isOpen={newListName !== null}
        title="Nový nákupní seznam"
        label="Název seznamu"
        placeholder="Název seznamu…"
        initialValue={newListName ?? ''}
        maxLength={100}
        submitLabel="Vytvořit"
        loading={createList.isPending}
        errorMessage={newListError}
        onSubmit={handleCreateList}
        onCancel={() => {
          setNewListName(null)
          setNewListError(null)
        }}
      />

      <PromptDialog
        isOpen={renameTarget !== null}
        title="Přejmenovat seznam"
        label="Název seznamu"
        initialValue={renameTarget?.name ?? ''}
        maxLength={100}
        submitLabel="Uložit"
        onSubmit={handleRenameList}
        onCancel={() => setRenameTarget(null)}
      />

      {/* Share dialog */}
      {shareList && (
        <ShareListDialog
          listId={shareList.id}
          listName={shareList.name}
          onClose={() => setShareList(null)}
        />
      )}

      {/* Delete list confirmation */}
      <ConfirmDialog
        isOpen={deleteListId !== null}
        title="Smazat seznam"
        message="Opravdu chceš smazat tento nákupní seznam? Přijdeš o všechny jeho položky."
        confirmLabel="Smazat"
        danger
        loading={deleteList.isPending}
        errorMessage={deleteListError}
        onConfirm={confirmDeleteList}
        onCancel={() => {
          setDeleteListId(null)
          setDeleteListError(null)
        }}
      />

      {/* Archive list confirmation */}
      <ConfirmDialog
        isOpen={archiveListId !== null}
        title="Uzavřít seznam"
        message="Všechny položky jsou hotové. Chceš seznam uzavřít? Zmizí z přehledu."
        confirmLabel="Uzavřít"
        loading={archiveList.isPending}
        errorMessage={archiveListError}
        onConfirm={confirmArchiveList}
        onCancel={() => {
          setArchiveListId(null)
          setArchiveListError(null)
        }}
      />
    </div>
  )
}
