/**
 * PantryView.tsx — Inventář / zásoby na chatě
 * Formulář přidání + seznam položek seskupených dle kategorie
 */
import { useState, useMemo } from 'react'
import { ChevronDown, ChevronLeft, CircleCheck, Package, Plus } from 'lucide-react'
import type { InventoryItem } from '@/api/shopping'
import { useInventory, useCreateInventoryItem } from './hooks/useInventory'
import { useAuth } from '@/context/AuthContext'
import { InventoryRow } from './InventoryRow'
import { EditInventoryModal } from './EditInventoryModal'
import { AddToCartModal } from './AddToCartModal'
import { BulkAddToCartModal } from './BulkAddToCartModal'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { showToast } from '@/lib/toast'
import { CATEGORY_ORDER, CATEGORY_LABELS, INVENTORY_STATUSES, INVENTORY_STATUS_LABELS, isMissingStock } from './constants'
import { ShoppingErrorState } from './ShoppingErrorState'
import { getNetworkAwareActionMessage } from '@/lib/networkError'

type FilterKey = 'all' | 'missing'

interface Props {
  onBack: () => void
}

export function PantryView({ onBack }: Props) {
  const {
    data: inventory = [],
    isLoading,
    isError,
    error: inventoryError,
    refetch: refetchInventory,
  } = useInventory()
  const createItem = useCreateInventoryItem()
  const { user } = useAuth()
  const isGuest = user?.role === 'guest'

  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [cartItem, setCartItem] = useState<InventoryItem | null>(null)
  const [showBulkAdd, setShowBulkAdd] = useState(false)
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
          {/* HEADER — back + title inline on mobile */}
          <div className="detail-page-header pantry-header-compact">
            <button
              onClick={onBack}
              className="detail-back-btn"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              Zpět
            </button>
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
                <Button variant="secondary" size="sm" className="ml-auto" onClick={() => setShowBulkAdd(true)}>
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
              <label className="detail-form-label">Název</label>
              <input
                type="text"
                placeholder="např. Sůl, Káva"
                value={newName}
                onChange={e => {
                  if (addItemError) setAddItemError(null)
                  setNewName(e.target.value)
                }}
                maxLength={100}
                autoComplete="off"
                required
                className="detail-form-input"
              />
            </div>

            {/* UMÍSTĚNÍ */}
            <div className="pantry-form-col-3">
              <label className="detail-form-label">Kde to leží?</label>
              <input
                type="text"
                placeholder="Kumbál, Police..."
                value={newLocation}
                onChange={e => {
                  if (addItemError) setAddItemError(null)
                  setNewLocation(e.target.value)
                }}
                maxLength={100}
                autoComplete="off"
                className="detail-form-input"
              />
            </div>

            {/* KATEGORIE */}
            <div className="pantry-form-col-2">
              <label className="detail-form-label">Kategorie</label>
              <select
                value={newCategory}
                onChange={e => {
                  if (addItemError) setAddItemError(null)
                  setNewCategory(e.target.value as typeof CATEGORY_ORDER[number])
                }}
                className="detail-form-input"
              >
                {CATEGORY_ORDER.map(cat => (
                  <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                ))}
              </select>
            </div>

            {/* STAV */}
            <div className="pantry-form-col-2">
              <label className="detail-form-label" htmlFor="pantry-new-status">Stav</label>
              <select
                id="pantry-new-status"
                value={newStatus}
                onChange={e => {
                  if (addItemError) setAddItemError(null)
                  setNewStatus(e.target.value as InventoryItem['status'])
                }}
                className="detail-form-input"
              >
                {INVENTORY_STATUSES.map(s => <option key={s} value={s}>{INVENTORY_STATUS_LABELS[s]}</option>)}
              </select>
            </div>

            {/* SUBMIT BUTTON */}
            <div className="pantry-form-col-1">
              <button
                type="submit"
                disabled={createItem.isPending || !newName.trim()}
                className="add-form-submit-btn add-form-submit-btn--full-width"
              >
                +
              </button>
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
        <div className="pantry-scroll-area">
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
                          onAddToCart={setCartItem}
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
      {cartItem && (
        <AddToCartModal
          invId={cartItem.id}
          invName={cartItem.name}
          onClose={() => setCartItem(null)}
        />
      )}
      {showBulkAdd && (
        <BulkAddToCartModal
          items={missingNotInCart}
          onClose={() => setShowBulkAdd(false)}
        />
      )}
    </div>
    </section>
  )
}
