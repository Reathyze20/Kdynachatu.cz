/**
 * PantryView.tsx — Inventář / zásoby na chatě
 * Formulář přidání + seznam položek seskupených dle kategorie
 * „+“ a „Vše do nákupu“ přidávají do aktuálního seznamu Nákupu, bez něj nejdřív do nového (#225)
 */
import { useState, useMemo, useRef, useEffect } from 'react'
import { ChevronDown, CircleCheck, Package, Plus } from 'lucide-react'
import type { InventoryItem, ShoppingList } from '@/api/shopping'
import { useInventory, useCreateInventoryItem, useDeleteInventoryItem, useAddInventoryToCart, useBulkAddToCart, type CartTarget } from './hooks/useInventory'
import { useAuth } from '@/context/AuthContext'
import { InventoryRow } from './InventoryRow'
import { EditInventoryModal } from './EditInventoryModal'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PromptDialog } from '@/components/shared/PromptDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { showToast } from '@/lib/toast'
import { formatCount } from '@/lib/format'
import { CATEGORY_ORDER, CATEGORY_LABELS, INVENTORY_STATUSES, INVENTORY_STATUS_LABELS, isMissingStock } from './constants'
import { ShoppingErrorState } from './ShoppingErrorState'
import { getNetworkAwareActionMessage } from '@/lib/networkError'

type FilterKey = 'all' | 'missing'

interface Props {
  /** Aktuální seznam Nákupu; `null` = žádný aktivní seznam, `undefined` = seznamy se ještě načítají */
  currentList: Pick<ShoppingList, 'id' | 'name'> | null | undefined
}

export function PantryView({ currentList }: Props) {
  const {
    data: inventory = [],
    isLoading,
    isError,
    error: inventoryError,
    refetch: refetchInventory,
  } = useInventory()
  const createItem = useCreateInventoryItem()
  const deleteStock = useDeleteInventoryItem()
  const addToCart = useAddInventoryToCart()
  const bulkAdd = useBulkAddToCart()
  const { user } = useAuth()
  const isGuest = user?.role === 'guest'

  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  /** Zásoby čekající na název nového seznamu (žádný aktivní seznam); `null` = dialog zavřený */
  const [newListFor, setNewListFor] = useState<InventoryItem[] | null>(null)
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const addToggleRef = useRef<HTMLButtonElement>(null)
  // Kam po zavření potvrzení smazání vrátit fokus, aby nespadl na <body>
  const focusAfterConfirm = useRef<HTMLElement | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  // New item form state
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState<typeof CATEGORY_ORDER[number]>('TRVANLIVÉ')
  const [newStatus, setNewStatus] = useState<InventoryItem['status']>('OK')
  const [newLocation, setNewLocation] = useState('')
  const [newEssential, setNewEssential] = useState(false)
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [addItemError, setAddItemError] = useState<string | null>(null)

  // Chybějící zásoby (Dochází + Došlo) a ty z nich, které ještě nejsou v nákupu („Vše do nákupu“)
  const missing = useMemo(() => inventory.filter(isMissingStock), [inventory])
  const missingNotInCart = useMemo(() => missing.filter(i => !i.inCart), [missing])
  const filteredInventory = activeFilter === 'missing' ? missing : inventory

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    if (name.length > 100) {
      showToast('Název zásoby je příliš dlouhý (max 100 znaků).', 'error')
      return
    }
    setAddItemError(null)
    try {
      await createItem.mutateAsync({
        name,
        category: newCategory,
        status: newStatus,
        location: newLocation.trim() || undefined,
        isEssential: newEssential,
      })
      setNewName('')
      setNewLocation('')
      setNewEssential(false)
      setNewStatus('OK')
    } catch (error) {
      setAddItemError(
        getNetworkAwareActionMessage(
          error,
          'Zásobu se nepodařilo přidat. Zkus to znovu.',
          'Spojení vypadlo dřív, než se zásoba stihla přidat. Zkus to znovu po obnovení připojení.',
        ),
      )
    }
  }

  function addItems(items: InventoryItem[], target: CartTarget) {
    if (items.length === 1) addToCart.mutate({ item: items[0], target })
    else bulkAdd.mutate({ items, target })
  }

  function handleAddToCart(item: InventoryItem) {
    if (currentList) addItems([item], { listId: currentList.id, listName: currentList.name })
    else setNewListFor([item])
  }

  function handleAddAll() {
    if (currentList) setConfirmBulk(true)
    else setNewListFor(missingNotInCart)
  }

  function askDelete(item: InventoryItem) {
    setDeleteError(null)
    setDeleteTarget(item)
  }

  /** Menu ⋮ zásoby `id` (offset 0) nebo jejího souseda v seznamu (±1). */
  function stockMenu(id: string, offset = 0) {
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('li[data-item-id]') ?? [])
    const index = rows.findIndex(row => row.dataset.itemId === id)
    return index < 0 ? null : rows[index + offset]?.querySelector<HTMLElement>('[aria-haspopup="menu"]') ?? null
  }

  function cancelDelete() {
    if (deleteTarget) focusAfterConfirm.current = stockMenu(deleteTarget.id)
    setDeleteTarget(null)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteError(null)
    // Po smazání fokus na menu následující zásoby, jinak předchozí, jinak na „Přidat zásobu“
    const nextFocus = stockMenu(deleteTarget.id, 1) ?? stockMenu(deleteTarget.id, -1) ?? addToggleRef.current
    try {
      await deleteStock.mutateAsync(deleteTarget.id)
      focusAfterConfirm.current = nextFocus
      setDeleteTarget(null)
    } catch (error) {
      setDeleteError(
        getNetworkAwareActionMessage(
          error,
          'Zásobu se nepodařilo smazat. Zkus to znovu.',
          'Spojení vypadlo dřív, než se zásoba stihla smazat. Zkus to znovu po obnovení připojení.',
        ),
      )
    }
  }

  useEffect(() => {
    if (deleteTarget) return
    focusAfterConfirm.current?.focus()
    focusAfterConfirm.current = null
  }, [deleteTarget])

  // Skupiny dle kategorie (from filteredInventory)
  const grouped: Record<string, InventoryItem[]> = {}
  for (const cat of CATEGORY_ORDER) {
    const items = filteredInventory.filter(i => i.category === cat)
    if (items.length > 0) {
      grouped[cat] = items
    }
  }
  const unknownCats = filteredInventory.filter(
    i => !(CATEGORY_ORDER as readonly string[]).includes(i.category),
  )
  if (unknownCats.length > 0) {
    grouped['OSTATNÍ'] = [...(grouped['OSTATNÍ'] ?? []), ...unknownCats]
  }

  const filterChips: { key: FilterKey; label: string; isDanger?: boolean }[] = [
    { key: 'missing', label: `Chybí · ${missing.length}`, isDanger: missing.length > 0 },
    { key: 'all', label: 'Vše' },
  ]

  return (
    <section className="shopping-detail pantry-view-root">
    <div className="detail-content-wrapper pantry-content-wrapper">

      {/* This container locks EVERYTHING to a maximum width of 900px, creating perfect center alignment */}
      <div className="detail-inner-container pantry-inner-container">

        {/* ─── STICKY HEADER (never scrolls) ─── */}
        <div className="pantry-sticky-header">
          <div className="detail-page-header pantry-header-compact">
            <h2 className="detail-page-title">Zásoby na chatě</h2>
            <p className="detail-page-subtitle">Rychlý přehled všeho, co nesmí chybět.</p>
          </div>

          {/* FILTER CHIPS + BULK ACTION */}
          {inventory.length > 0 && (
            <div className="pantry-filter-bar" role="tablist" aria-label="Filtrovat zásoby">
              {filterChips.map(chip => (
                <button
                  key={chip.key}
                  role="tab"
                  aria-selected={activeFilter === chip.key}
                  className={`pantry-filter-chip${activeFilter === chip.key ? ' is-active' : ''}${chip.isDanger ? ' is-danger' : ''}`}
                  onClick={() => setActiveFilter(chip.key)}
                >
                  {chip.label}
                </button>
              ))}
              {missingNotInCart.length > 0 && (
                <Button variant="secondary" size="sm" className="ml-auto" disabled={currentList === undefined} onClick={handleAddAll}>
                  <Plus aria-hidden="true" />
                  Vše do nákupu · {missingNotInCart.length}
                </Button>
              )}
            </div>
          )}

          {/* THE ADD FORM — collapsible on mobile */}
          {!isGuest && (
          <div className="pantry-add-section">
            <button
              type="button"
              ref={addToggleRef}
              className="pantry-add-toggle"
              onClick={() => setShowAddForm(v => !v)}
              aria-expanded={showAddForm}
            >
              <Plus aria-hidden="true" className="size-4" />
              Přidat zásobu
              <ChevronDown aria-hidden="true" className={`pantry-add-toggle-chevron size-4${showAddForm ? ' is-open' : ''}`} />
            </button>

            <div className={`pantry-add-form-collapse${showAddForm ? ' is-open' : ''}`}>
              <div className="detail-form-card">
                <form
                  onSubmit={handleAddItem}
                  noValidate
                  className="pantry-form-grid"
                >
            {/* NÁZEV */}
            <div className="pantry-form-col-4">
              <label className="mb-2 block text-label text-(--text-muted)" htmlFor="pantry-new-name">Název</label>
              <Input
                id="pantry-new-name"
                placeholder="např. Sůl, Káva"
                value={newName}
                onChange={e => {
                  if (addItemError) setAddItemError(null)
                  setNewName(e.target.value)
                }}
                maxLength={100}
                autoComplete="off"
                required
              />
            </div>

            {/* UMÍSTĚNÍ */}
            <div className="pantry-form-col-3">
              <label className="mb-2 block text-label text-(--text-muted)" htmlFor="pantry-new-location">Kde to leží (nepovinné)</label>
              <Input
                id="pantry-new-location"
                placeholder="Kumbál, police…"
                value={newLocation}
                onChange={e => {
                  if (addItemError) setAddItemError(null)
                  setNewLocation(e.target.value)
                }}
                maxLength={100}
                autoComplete="off"
              />
            </div>

            {/* KATEGORIE */}
            <div className="pantry-form-col-2">
              <label className="mb-2 block text-label text-(--text-muted)" htmlFor="pantry-new-category">Kategorie</label>
              <Select
                id="pantry-new-category"
                value={newCategory}
                onChange={e => {
                  if (addItemError) setAddItemError(null)
                  setNewCategory(e.target.value as typeof CATEGORY_ORDER[number])
                }}
              >
                {CATEGORY_ORDER.map(cat => (
                  <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                ))}
              </Select>
            </div>

            {/* STAV */}
            <div className="pantry-form-col-2">
              <label className="mb-2 block text-label text-(--text-muted)" htmlFor="pantry-new-status">Stav</label>
              <Select
                id="pantry-new-status"
                value={newStatus}
                onChange={e => {
                  if (addItemError) setAddItemError(null)
                  setNewStatus(e.target.value as InventoryItem['status'])
                }}
              >
                {INVENTORY_STATUSES.map(s => <option key={s} value={s}>{INVENTORY_STATUS_LABELS[s]}</option>)}
              </Select>
            </div>

            {/* SUBMIT BUTTON */}
            <div className="pantry-form-col-1">
              <Button type="submit" aria-label="Přidat" className="w-full" disabled={createItem.isPending || !newName.trim()}>
                <Plus aria-hidden="true" />
              </Button>
            </div>
          </form>
          {addItemError ? (
            <div className="error-message show" role="alert">{addItemError}</div>
          ) : null}
        </div>
            </div>{/* end pantry-add-form-collapse */}
          </div>
          )}
        </div>{/* end pantry-sticky-header */}

        {/* ─── SCROLLABLE LIST AREA ─── */}
        <div className="pantry-scroll-area" ref={listRef}>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
              <div className="spinner" />
            </div>
          ) : isError ? (
            <ShoppingErrorState
              title="Zásoby se nepodařilo načíst"
              error={inventoryError}
              onRetry={() => {
                void refetchInventory()
              }}
            />
          ) : inventory.length === 0 ? (
            <EmptyState icon={Package} message="Zatím tu nejsou žádné zásoby." />
          ) : filteredInventory.length === 0 ? (
            <EmptyState icon={CircleCheck} message="Žádná zásoba teď nechybí." />
          ) : (
            <>
              {CATEGORY_ORDER.map(cat => {
                const items = grouped[cat]
                if (!items) return null
                return (
                  <section key={cat} className="mb-4 flex flex-col gap-2">
                    <h3 className="text-card-title text-(--text-main)">{CATEGORY_LABELS[cat]}</h3>
                    <ul className="flex flex-col gap-2">
                      {items.map(item => (
                        <InventoryRow
                          key={item.id}
                          item={item}
                          onEdit={setEditItem}
                          onDelete={askDelete}
                          onAddToCart={currentList === undefined ? undefined : handleAddToCart}
                        />
                      ))}
                    </ul>
                  </section>
                )
              })}
            </>
          )}
        </div>

      </div>

      {/* Modály */}
      {editItem && (
        <EditInventoryModal
          item={editItem}
          onClose={() => setEditItem(null)}
        />
      )}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Smazat zásobu"
        message="Opravdu chceš tuto zásobu smazat? Tato akce je nevratná."
        confirmLabel="Smazat"
        danger
        loading={deleteStock.isPending}
        errorMessage={deleteError}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
      <ConfirmDialog
        isOpen={confirmBulk}
        title="Přidat do nákupu"
        message={`Přidat ${formatCount(missingNotInCart.length, 'položku', 'položky', 'položek')} do seznamu „${currentList?.name ?? ''}“?`}
        confirmLabel="Přidat"
        onConfirm={() => {
          if (currentList) addItems(missingNotInCart, { listId: currentList.id, listName: currentList.name })
          setConfirmBulk(false)
        }}
        onCancel={() => setConfirmBulk(false)}
      />
      <PromptDialog
        isOpen={newListFor !== null}
        title="Nový nákupní seznam"
        description="Zatím tu není žádný nákupní seznam. Vytvoř nový a přidej do něj."
        label="Název seznamu"
        initialValue="Nákup"
        maxLength={100}
        submitLabel="Vytvořit a přidat"
        onSubmit={(name) => {
          if (newListFor) addItems(newListFor, { newListName: name })
          setNewListFor(null)
        }}
        onCancel={() => setNewListFor(null)}
      />
    </div>
    </section>
  )
}
