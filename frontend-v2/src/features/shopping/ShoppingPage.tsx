/**
 * ShoppingPage.tsx — Zásoby a nákupy: přepínač „Zásoby / Nákup · N“ (#224), režim v URL (`?view=pantry|shopping`),
 * bez parametru Nákup. Nákup = nákupní seznamy, Zásoby = spíž na chatě.
 */
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ViewSwitcher, type ActiveView } from './ViewSwitcher'
import type { ShoppingList } from '@/api/shopping'
import {
  useShoppingLists,
  useCreateList,
  useDeleteList,
  useArchiveList,
} from './hooks/useShoppingLists'
import { ListMaster } from './ListMaster'
import { ListDetail } from './ListDetail'
import { PantryView } from './PantryView'
import { ShareListDialog } from './ShareListDialog'
import { showToast } from '@/lib/toast'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PromptDialog } from '@/components/shared/PromptDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/shared/Card'
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

  // Položky ve stavu Koupit ve všech aktivních seznamech; dokud se seznamy nenačtou, bez čísla
  const pendingCount = isLoading || isError
    ? undefined
    : lists.reduce((sum, list) => sum + list.items.filter(i => i.status === 'pending').length, 0)

  const [selectedListId, setSelectedListId] = useState<string | null>(readSelectedListId)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [shareList, setShareList] = useState<ShoppingList | null>(null)
  const [showNewListModal, setShowNewListModal] = useState(false)
  const [deleteListId, setDeleteListId] = useState<string | null>(null)
  const [archiveListId, setArchiveListId] = useState<string | null>(null)
  const [newListError, setNewListError] = useState<string | null>(null)
  const [deleteListError, setDeleteListError] = useState<string | null>(null)
  const [archiveListError, setArchiveListError] = useState<string | null>(null)

  // Bez volby, nebo když zapamatovaný seznam zmizel (smazaný, uzavřený), platí nejnovější aktivní (API řadí od nejnovějšího)
  useEffect(() => {
    if (activeView === 'shopping' && !selectedListId && lists.length > 0) {
      setSelectedListId(lists[0].id)
    }
    if (selectedListId && !lists.find(l => l.id === selectedListId) && lists.length > 0) {
      setSelectedListId(lists[0].id)
    }
  }, [lists, selectedListId, activeView])

  const selectedList = lists.find(l => l.id === selectedListId) ?? null

  function rememberList(id: string) {
    setSelectedListId(id)
    try {
      localStorage.setItem(SELECTED_LIST_KEY, id)
    } catch {
      // Bez úložiště platí volba jen do obnovení stránky
    }
  }

  function handleSelectList(id: string) {
    rememberList(id)
    setMobileDetailOpen(true)
  }

  function handleChangeView(view: ActiveView) {
    if (view === activeView) return
    setSearchParams({ view }, { replace: true })
    setMobileDetailOpen(false)
  }

  function handleBack() {
    setMobileDetailOpen(false)
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
      if (selectedListId === deleteListId) {
        setSelectedListId(null)
        setMobileDetailOpen(false)
      }
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
      setShowNewListModal(false)
      showToast('Nákupní seznam vytvořen.', 'success')
      rememberList(created.id)
      setMobileDetailOpen(true)
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

  return (
    <div className="shopping-page" id="shopping-page" data-testid="shopping-page">
      {/* Page header inside the legacy master-detail frame, so it pads like the cards below it */}
      <div className="shrink-0 p-3 pb-0 md:p-6 md:pb-0">
        <Card className="flex flex-col gap-4">
          <PageHeader title="Zásoby a nákupy" />
          <ViewSwitcher activeView={activeView} onChange={handleChangeView} pendingCount={pendingCount} />
        </Card>
      </div>

      {/* Content; on mobile the detail (Zásoby or the open list) replaces the list panel */}
      <div
        className={`shopping-layout${mobileDetailOpen || activeView === 'pantry' ? ' detail-open' : ''}`}
        id="shopping-layout"
      >
        {/* Master panel (only in shopping view) */}
        {activeView !== 'pantry' && (
          isLoading ? (
            <aside className="shopping-master" id="shopping-master">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton-list-item skeleton-list-item--master">
                  <div className="skeleton-list-text">
                    <div className="skeleton skeleton-text medium"></div>
                    <div className="skeleton skeleton-text short"></div>
                  </div>
                  <div className="skeleton skeleton-badge"></div>
                </div>
              ))}
            </aside>
          ) : isError ? (
            <aside className="shopping-master" id="shopping-master">
              <ShoppingErrorState
                variant="master"
                title="Seznamy se nepodařilo načíst"
                error={listsError}
                onRetry={() => {
                  void refetchLists()
                }}
              />
            </aside>
          ) : (
            <ListMaster
              lists={lists}
              selectedListId={selectedListId}
              onSelect={handleSelectList}
              onShare={list => setShareList(list)}
              onArchive={handleArchiveList}
              onDelete={handleDeleteList}
              onNewList={() => setShowNewListModal(true)}
            />
          )
        )}

        {/* Right column: detail */}
        <div className="shopping-right-col">
          {activeView === 'pantry' ? (
            <PantryView />
          ) : (
            <ListDetail list={selectedList} onBack={handleBack} />
          )}
        </div>
      </div>

      <PromptDialog
        isOpen={showNewListModal}
        title="Nový nákupní seznam"
        label="Název seznamu"
        placeholder="Název seznamu…"
        maxLength={100}
        submitLabel="Vytvořit"
        loading={createList.isPending}
        errorMessage={newListError}
        onSubmit={handleCreateList}
        onCancel={() => {
          setShowNewListModal(false)
          setNewListError(null)
        }}
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
