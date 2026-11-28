/**
 * useInventory.ts — TanStack Query hooks pro inventář / spíž
 * Cross-invalidace s shopping-lists při přidání do nákupu.
 */
import axios from 'axios'
import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { inventoryApi, shoppingApi, type InventoryItem, type ShoppingList } from '@/api/shopping'
import { showToast } from '@/lib/toast'
import { handleMutationError } from '@/lib/mutationError'
import { isNetworkError } from '@/lib/networkError'
import { isQueuedOffline } from '@/lib/offlineQueue'
import { SHOPPING_KEY } from './useShoppingLists'

export const INVENTORY_KEY = ['inventory'] as const

// ─── Query ────────────────────────────────────────────────────────────────────

export function useInventory() {
  return useQuery({
    queryKey: INVENTORY_KEY,
    queryFn: inventoryApi.getAll,
    staleTime: 30_000,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateInventoryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: inventoryApi.create,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INVENTORY_KEY })
    },
    onError: handleMutationError('Chyba při přidávání zásoby'),
  })
}

export function useUpdateInventoryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: { name: string; category?: string; status: 'OK' | 'LOW' | 'EMPTY'; location?: string; isEssential: boolean }
    }) => inventoryApi.update(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INVENTORY_KEY })
    },
    onError: handleMutationError('Chyba při úpravě zásoby'),
  })
}

export function useDeleteInventoryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => inventoryApi.delete(id),
    onSuccess: (_data, id) => {
      // Server smazání potvrdil: zásoba zmizí hned, ne až po novém načtení (DESIGN.md §7 Mazání)
      qc.setQueryData<InventoryItem[]>(INVENTORY_KEY, items => items?.filter(item => item.id !== id))
      void qc.invalidateQueries({ queryKey: INVENTORY_KEY })
    },
    onError: handleMutationError('Chyba při mazání zásoby'),
  })
}

export function useToggleInventoryEssential() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => inventoryApi.toggleEssential(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INVENTORY_KEY })
    },
    onError: handleMutationError('Chyba při změně označení zásoby'),
  })
}

/** Kam zásoby přidat (#225): aktuální seznam, nebo nový seznam s tímto názvem */
export type CartTarget = { list: Pick<ShoppingList, 'id' | 'name'> } | { newListName: string }

const targetName = (target: CartTarget) => ('list' in target ? target.list.name : target.newListName)

const isConflict = (err: unknown) => axios.isAxiosError(err) && err.response?.status === 409

/** Optimisticky ukáže zásoby „V nákupu“; vrátí předchozí stav pro rollback */
async function markInCart(qc: QueryClient, ids: string[]) {
  await qc.cancelQueries({ queryKey: INVENTORY_KEY })
  const previous = qc.getQueryData<InventoryItem[]>(INVENTORY_KEY)
  qc.setQueryData<InventoryItem[]>(INVENTORY_KEY, items => items?.map(i => (ids.includes(i.id) ? { ...i, inCart: true } : i)))
  return { previous }
}

function refreshCart(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: INVENTORY_KEY })
  void qc.invalidateQueries({ queryKey: SHOPPING_KEY })
}

/** „+“ u zásoby: přidá ji do cíle; 409 (už v nákupu) jen obnoví data, bez připojení zůstane „V nákupu“ (offline fronta) */
export function useAddInventoryToCart() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ item, target }: { item: InventoryItem; target: CartTarget }) =>
      inventoryApi.addToCart(item.id, 'list' in target ? { listId: target.list.id } : { newListName: target.newListName }),
    onMutate: ({ item }) => markInCart(qc, [item.id]),
    onSuccess: (_data, { target }) => {
      showToast(`Přidáno do seznamu „${targetName(target)}“.`, 'success')
    },
    onError: (err, _vars, ctx) => {
      if (isConflict(err)) return
      if (ctx?.previous && !isNetworkError(err)) qc.setQueryData(INVENTORY_KEY, ctx.previous)
      handleMutationError('Chyba při přidávání do nákupu')(err)
    },
    onSettled: (_data, err) => {
      if (!isNetworkError(err)) refreshCart(qc)
    },
  })
}

/** „Vše do nákupu“: zásoby postupně do jednoho seznamu (bez něj nejdřív nový); toast řekne, co se nepovedlo */
export function useBulkAddToCart() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ items, target }: { items: InventoryItem[]; target: CartTarget }) => {
      const list = 'list' in target ? target.list : await shoppingApi.createList(target.newListName)
      const failed: string[] = []
      for (const item of items) {
        try {
          await inventoryApi.addToCart(item.id, { listId: list.id })
        } catch (err) {
          if (!isConflict(err) && !isNetworkError(err)) failed.push(item.name)
        }
      }
      return { failed, listName: list.name }
    },
    onMutate: ({ items }) => markInCart(qc, items.map(i => i.id)),
    onSuccess: ({ failed, listName }) => {
      if (failed.length === 0) showToast(`Přidáno do seznamu „${listName}“.`, 'success')
      else showToast({ title: 'Některé zásoby se nepodařilo přidat do nákupu', detail: `${failed.join(', ')}. Zkus to znovu.` }, 'error')
    },
    onError: (err, { target }, ctx) => {
      // Selhalo už založení seznamu, nic se nepřidalo
      if (ctx?.previous) qc.setQueryData(INVENTORY_KEY, ctx.previous)
      // Bez připojení čeká ve frontě jen založení seznamu; zásoby k němu bez jeho ID poslat nejde
      if (isQueuedOffline(err)) showToast(`Seznam „${targetName(target)}“ se založí po připojení. Zásoby do něj pak přidej znovu.`, 'info')
      else handleMutationError('Zásoby se nepodařilo přidat do nákupu')(err)
    },
    onSettled: () => refreshCart(qc),
  })
}
