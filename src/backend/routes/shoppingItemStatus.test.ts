import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { inventoryEffect, linkedInventoryChange } from "./shoppingItemStatus";

describe("inventoryEffect: what a status change does to the linked inventory item", () => {
  test("Koupit → a resolved status restocks", () => {
    assert.equal(inventoryEffect("pending", "purchased"), "restock");
    assert.equal(inventoryEffect("pending", "bring_from_home"), "restock");
  });

  test("a resolved status → Koupit reopens", () => {
    assert.equal(inventoryEffect("purchased", "pending"), "reopen");
    assert.equal(inventoryEffect("bring_from_home", "pending"), "reopen");
  });

  test("switching between resolved statuses or keeping the status leaves the inventory alone", () => {
    assert.equal(inventoryEffect("bring_from_home", "purchased"), null);
    assert.equal(inventoryEffect("purchased", "bring_from_home"), null);
    assert.equal(inventoryEffect("purchased", "purchased"), null);
    assert.equal(inventoryEffect("pending", "pending"), null);
  });
});

describe("linkedInventoryChange", () => {
  test("restock sets Dostatek and takes the item out of the cart whatever its status", () => {
    for (const status of ["OK", "LOW", "EMPTY"]) {
      assert.deepEqual(linkedInventoryChange("restock", status), { status: "OK", inCart: false });
    }
  });

  test("reopen puts the item back in the cart; Dostatek drops to Dochází, Dochází and Došlo stay", () => {
    assert.deepEqual(linkedInventoryChange("reopen", "OK"), { status: "LOW", inCart: true });
    assert.deepEqual(linkedInventoryChange("reopen", "LOW"), { status: "LOW", inCart: true });
    assert.deepEqual(linkedInventoryChange("reopen", "EMPTY"), { status: "EMPTY", inCart: true });
  });
});
