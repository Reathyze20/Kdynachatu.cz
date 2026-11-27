/**
 * ListDetail.tsx — Aktuální nákupní seznam (#224): hlavička z `ShoppingPage`, pole „Přidat položku“
 * a seřazené položky (vyřešené na konec)
 */
import { useState, useRef, useEffect, type ReactNode } from 'react'
import { AnimatePresence } from 'framer-motion'
import type { ShoppingList, ItemStatus } from '@/api/shopping'
import { useAddItem } from './hooks/useShoppingLists'
import { ItemRow } from './ItemRow'
import { showToast } from '@/lib/toast'
import { getNetworkAwareActionMessage } from '@/lib/networkError'

interface Props {
  list: ShoppingList
  /** Hlavička seznamu (`ListHeader`): název nebo výběr, postup a menu ⋮. */
  header: ReactNode
}

function isDone(status: ItemStatus): boolean {
  return status === 'purchased' || status === 'bring_from_home'
}

export function ListDetail({ list, header }: Props) {
  const [newItemName, setNewItemName] = useState('')
  const [addItemError, setAddItemError] = useState<string | null>(null)
  const addItem = useAddItem()
  const inputRef = useRef<HTMLInputElement>(null)

  // Chyba přidání patří k seznamu, ve kterém vznikla. Fokus se sám nepřesouvá: Nákup se otevírá rovnou
  // se seznamem a na mobilu by vyskočila klávesnice.
  useEffect(() => {
    setAddItemError(null)
  }, [list.id])

  const sorted = [...list.items].sort((a, b) => {
    const aDone = isDone(a.status) ? 1 : 0
    const bDone = isDone(b.status) ? 1 : 0
    if (aDone !== bDone) return aDone - bDone
    // Mezi nevyřízenými jde ★ nahoru (#221), jinak podle přidání.
    if (!aDone && a.isEssential !== b.isEssential) return a.isEssential ? -1 : 1
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    const name = newItemName.trim()
    if (!name) return
    if (name.length > 100) {
      showToast('Název položky je příliš dlouhý (max 100 znaků).', 'error')
      return
    }
    setAddItemError(null)
    try {
      await addItem.mutateAsync({ listId: list.id, name })
      setNewItemName('')
      inputRef.current?.focus()
    } catch (error) {
      setAddItemError(
        getNetworkAwareActionMessage(
          error,
          'Položku se nepodařilo přidat. Zkus to znovu.',
          'Spojení vypadlo dřív, než se položka stihla přidat. Zkus to znovu po obnovení připojení.',
        ),
      )
    }
  }

  return (
    <section className="shopping-detail" id="shopping-detail" data-testid="shopping-list-detail">
      <div className="detail-content-wrapper">

        {/* Centered max-width container — matches PantryView */}
        <div className="detail-inner-container">

          {/* HEADER — compact: title + inline form row */}
          <div className="detail-page-header">
            {header}
            <div className="detail-header-row">
              <form
                id="detail-add-form"
                data-list-id={list.id}
                onSubmit={handleAddItem}
                noValidate
                className="detail-inline-form"
                data-testid="shopping-add-item-form"
              >
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Přidat položku…"
                  maxLength={100}
                  required
                  autoComplete="off"
                  value={newItemName}
                  onChange={e => {
                    if (addItemError) setAddItemError(null)
                    setNewItemName(e.target.value)
                  }}
                  className="detail-form-input"
                  data-testid="shopping-add-item-input"
                />
                <button
                  type="submit"
                  title="Přidat položku"
                  disabled={addItem.isPending || !newItemName.trim()}
                  className="add-form-submit-btn"
                  data-testid="shopping-add-item-button"
                >
                  +
                </button>
              </form>
            </div>
            {addItemError ? (
              <div className="error-message show" role="alert">{addItemError}</div>
            ) : null}
          </div>

          {/* ITEMS — White card wrapper matching PantryView */}
          <div>
            {sorted.length === 0 ? (
              <div className="detail-empty-state">
                <img src="/icons/empty_basket.svg" alt="" aria-hidden="true" style={{ maxHeight: 80, width: 'auto', opacity: 0.65, marginBottom: '0.5rem' }} />
                <h3 className="detail-empty-state-title">Košík je prázdný</h3>
                <p className="detail-empty-state-text">Přidej první položku.</p>
              </div>
            ) : (
              <div className="detail-items-card">
                <AnimatePresence mode="popLayout">
                  {sorted.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      listCreatedById={list.createdById}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

        </div>
      </div>
    </section>
  )
}
