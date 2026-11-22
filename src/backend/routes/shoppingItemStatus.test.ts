import { test } from "node:test";
import assert from "node:assert/strict";
import { inventoryEffect, linkedInventoryChange } from "./shoppingItemStatus";

test("inventoryEffect: Koupit → resolved restocks, resolved → Koupit reopens, the rest leaves the inventory alone", () => {
  const cases = [
    ["pending", "purchased", "restock"], ["pending", "bring_from_home", "restock"],
    ["purchased", "pending", "reopen"], ["bring_from_home", "pending", "reopen"],
    ["bring_from_home", "purchased", null], ["purchased", "bring_from_home", null], ["purchased", "purchased", null], ["pending", "pending", null],
  ] as const;
  for (const [from, to, expected] of cases) assert.equal(inventoryEffect(from, to), expected, `${from} → ${to}`);
});

test("linkedInventoryChange: restock = Dostatek out of the cart; reopen = back in the cart, Dostatek drops to Dochází", () => {
  for (const status of ["OK", "LOW", "EMPTY"]) assert.deepEqual(linkedInventoryChange("restock", status), { status: "OK", inCart: false });
  assert.deepEqual(linkedInventoryChange("reopen", "OK"), { status: "LOW", inCart: true });
  assert.deepEqual(linkedInventoryChange("reopen", "LOW"), { status: "LOW", inCart: true });
  assert.deepEqual(linkedInventoryChange("reopen", "EMPTY"), { status: "EMPTY", inCart: true });
});
