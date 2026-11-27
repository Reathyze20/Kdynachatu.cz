import type { ClaimedItem } from "../../types";

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

interface Pledge { id: string; linkedInventoryId: string | null; purchasedBy: { username: string } | null }

/**
 * Došlo ★ that someone took with "Koupím já" (#683): their pledge ("Přivezu z domova") of a ★ supply.
 * The pledge restocked the supply, so it is no longer in `attention`; `restockedEssential` are the ★ supplies
 * back on OK (a supply that ran out again is a fresh need, not a claim). Pledges come newest first, one per supply.
 */
export function claimedItems(pledges: Pledge[], restockedEssential: { id: string; name: string }[]): ClaimedItem[] {
  const supplies = new Map(restockedEssential.map((s) => [s.id, s.name]));
  const claimed = new Map<string, ClaimedItem>();
  for (const p of pledges) {
    const name = p.linkedInventoryId ? supplies.get(p.linkedInventoryId) : undefined;
    if (!p.linkedInventoryId || name === undefined || !p.purchasedBy || claimed.has(p.linkedInventoryId)) continue;
    claimed.set(p.linkedInventoryId, { name, inventoryId: p.linkedInventoryId, shoppingItemId: p.id, buyer: p.purchasedBy.username });
  }
  return [...claimed.values()];
}
