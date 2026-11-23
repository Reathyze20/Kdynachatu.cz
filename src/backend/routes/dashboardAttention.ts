/**
 * "Potřebuje pozornost" on the dashboard (#275). Things that need attention:
 * - supplies marked Dochází (LOW) or Došlo (EMPTY) in Zásoby, with their pending shopping item if one exists,
 * - pending ★ shopping items without such a supply (the existing dashboard meaning of "dochází").
 * A pledge ("Přivezu z domova", #167) or a purchase restocks the supply, so resolved things drop out.
 * Order: Došlo before Dochází, ★ first within each.
 */
export interface AttentionItem {
  name: string;
  isEmpty: boolean;
  isEssential: boolean;
  inventoryId: string | null;
  shoppingItemId: string | null;
}

interface Supply { id: string; name: string; status: string; isEssential: boolean }
interface PendingItem { id: string; name: string; isEssential: boolean; linkedInventoryId: string | null }

export function attentionItems(supplies: Supply[], pending: PendingItem[]): AttentionItem[] {
  const itemBySupply = new Map(pending.flatMap((p) => (p.linkedInventoryId ? [[p.linkedInventoryId, p.id] as const] : [])));
  const fromSupplies = supplies.map((s) => ({
    name: s.name,
    isEmpty: s.status === "EMPTY",
    isEssential: s.isEssential,
    inventoryId: s.id,
    shoppingItemId: itemBySupply.get(s.id) ?? null,
  }));
  const shown = new Set(supplies.map((s) => s.id));
  const fromList = pending
    .filter((p) => p.isEssential && !(p.linkedInventoryId && shown.has(p.linkedInventoryId)))
    .map((p) => ({ name: p.name, isEmpty: false, isEssential: true, inventoryId: p.linkedInventoryId, shoppingItemId: p.id }));
  return [...fromSupplies, ...fromList].sort(
    (a, b) => Number(b.isEmpty) - Number(a.isEmpty) || Number(b.isEssential) - Number(a.isEssential),
  );
}
