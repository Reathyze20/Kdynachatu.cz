import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { attentionItems, claimedItems } from "./dashboardAttention";

const supply = (id: string, status: "LOW" | "EMPTY", isEssential = false) => ({ id, name: id, status, isEssential });
const pending = (id: string, linkedInventoryId: string | null, isEssential = false) => ({ id, name: id, isEssential, linkedInventoryId });

describe("attentionItems (#275)", () => {
  test("Došlo before Dochází, important (★) first within each", () => {
    const items = attentionItems([supply("Sůl", "LOW"), supply("Káva", "LOW", true), supply("Toaleťák", "EMPTY"), supply("Plyn", "EMPTY", true)], []);
    assert.deepEqual(items.map((i) => [i.name, i.isEmpty, i.isEssential]), [
      ["Plyn", true, true], ["Toaleťák", true, false], ["Káva", false, true], ["Sůl", false, false],
    ]);
  });

  test("a supply already on the shopping list carries that item, one that is not has none", () => {
    const items = attentionItems([supply("Toaleťák", "EMPTY"), supply("Sůl", "LOW")], [pending("item-1", "Toaleťák")]);
    assert.deepEqual(items.map((i) => [i.inventoryId, i.shoppingItemId]), [["Toaleťák", "item-1"], ["Sůl", null]]);
  });

  test("a pending ★ item without a supply needing attention is Dochází; plain list items are not shown", () => {
    const items = attentionItems([], [pending("Baterky", null, true), pending("Mléko", null), pending("Káva", "inv-ok", true), pending("Cukr", "inv-ok-2")]);
    assert.deepEqual(items, [
      { name: "Baterky", isEmpty: false, isEssential: true, inventoryId: null, shoppingItemId: "Baterky" },
      { name: "Káva", isEmpty: false, isEssential: true, inventoryId: "inv-ok", shoppingItemId: "Káva" },
    ]);
  });
});

describe("claimedItems (#683)", () => {
  const pledge = (id: string, supplyId: string | null, buyer: string | null) => ({ id, linkedInventoryId: supplyId, purchasedBy: buyer ? { username: buyer } : null });
  const starOk = (id: string) => ({ id, name: `Zásoba ${id}` });

  test("a pledge of a restocked ★ supply carries the supply, the item and who will buy it", () => {
    assert.deepEqual(claimedItems([pledge("item-1", "inv-1", "Jana")], [starOk("inv-1")]), [
      { name: "Zásoba inv-1", inventoryId: "inv-1", shoppingItemId: "item-1", buyer: "Jana" },
    ]);
  });

  test("pledges of other supplies, without a supply or without a buyer are left out", () => {
    const pledges = [pledge("plain", "inv-plain", "Jana"), pledge("loose", null, "Jana"), pledge("gone", "inv-1", null)];
    assert.deepEqual(claimedItems(pledges, [starOk("inv-1")]), []);
  });

  test("two pledges of one supply show only the first (newest) one", () => {
    const items = claimedItems([pledge("new", "inv-1", "Petr"), pledge("old", "inv-1", "Jana")], [starOk("inv-1")]);
    assert.deepEqual(items.map((i) => [i.shoppingItemId, i.buyer]), [["new", "Petr"]]);
  });
});
