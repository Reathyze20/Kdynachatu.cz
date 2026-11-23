import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { attentionItems } from "./dashboardAttention";

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
