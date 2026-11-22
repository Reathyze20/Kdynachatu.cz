/**
 * Shopping item status transitions and their effect on the linked inventory item (#219, decision #167 = A).
 * Resolved = "bring from home" or "purchased"; pending ("Koupit") is the only unresolved status.
 */
export type ShoppingItemStatus = "pending" | "bring_from_home" | "purchased";

export type InventoryEffect = "restock" | "reopen" | null;

export const isResolvedStatus = (status: ShoppingItemStatus): boolean => status !== "pending";

/** Koupit → resolved restocks, resolved → Koupit reopens, anything else leaves the inventory alone. */
export function inventoryEffect(from: ShoppingItemStatus, to: ShoppingItemStatus): InventoryEffect {
  const wasResolved = isResolvedStatus(from);
  const isResolved = isResolvedStatus(to);
  if (!wasResolved && isResolved) return "restock";
  if (wasResolved && !isResolved) return "reopen";
  return null;
}

/**
 * New state of the linked inventory item. Reopening cannot know the status before the restock
 * (it is not stored), so Dostatek drops to Dochází – "we still need it"; Dochází and Došlo stay.
 */
export function linkedInventoryChange(
  effect: Exclude<InventoryEffect, null>,
  currentStatus: string,
): { status: string; inCart: boolean } {
  if (effect === "restock") return { status: "OK", inCart: false };
  return { status: currentStatus === "OK" ? "LOW" : currentStatus, inCart: true };
}
