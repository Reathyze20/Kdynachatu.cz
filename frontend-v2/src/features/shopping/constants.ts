/**
 * Shopping feature constants — shared across PantryView, EditInventoryModal, etc.
 */

export const CATEGORY_ORDER = ['TRVANLIVÉ', 'NÁPOJE', 'HYGIENA', 'KOŘENÍ', 'OSTATNÍ'] as const
export type InventoryCategory = typeof CATEGORY_ORDER[number]

export const CATEGORY_LABELS: Record<InventoryCategory, string> = {
  'TRVANLIVÉ': 'Trvanlivé',
  'NÁPOJE': 'Nápoje',
  'HYGIENA': 'Hygiena',
  'KOŘENÍ': 'Koření',
  'OSTATNÍ': 'Ostatní',
}

/** Stav zásoby slovy (#223); hodnoty v datech zůstávají `OK` / `LOW` / `EMPTY`. */
export const INVENTORY_STATUS_LABELS = { OK: 'Dostatek', LOW: 'Dochází', EMPTY: 'Došlo' } as const
export type InventoryStatus = keyof typeof INVENTORY_STATUS_LABELS
export const INVENTORY_STATUSES = Object.keys(INVENTORY_STATUS_LABELS) as InventoryStatus[]

/** Chybějící zásoba = Dochází nebo Došlo. Platí pro filtr „Chybí“, „+“ i „Vše do nákupu“ (#176). */
export const isMissingStock = (item: { status: InventoryStatus }) => item.status !== 'OK'
