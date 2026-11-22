import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { as, recordRealtimeEmits, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";

let app: Express;
let world: TestWorld;
let listA: string;
let itemA: string;
let listB: string;
let itemB: string;
let pantryB: string;
let pantryItemB: string;
let orphanItemB: string;
/** Every cabin B fixture name starts with this, so any leaked name shows up in a body search. */
const CABIN_B_NAME_PREFIX = "Tajn";

type Call = (user: TestUser) => Promise<{ status: number }>;

async function createList(owner: TestUser, name: string, isPantry = false): Promise<string> {
  const list = await prisma.shoppingList.create({ data: { name, createdById: owner.id, cabinId: owner.cabinId, isPantry } });
  return list.id;
}

async function createItem(owner: TestUser, listId: string | null, name: string, splitWith: TestUser[] = []): Promise<string> {
  const item = await prisma.shoppingListItem.create({
    data: {
      name,
      listId,
      addedById: owner.id,
      ...(splitWith.length > 0
        ? { status: "purchased", purchased: true, purchasedById: owner.id, purchasedAt: new Date("2027-01-05"), price: 123.5 }
        : {}),
      splits: { create: splitWith.map((u) => ({ userId: u.id })) },
    },
  });
  return item.id;
}

const listSnapshot = (id: string) =>
  prisma.shoppingList.findUnique({ where: { id }, include: { items: { include: { splits: true }, orderBy: { id: "asc" } } } });
const itemSnapshot = (id: string) => prisma.shoppingListItem.findUnique({ where: { id }, include: { splits: true } });

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  listA = await createList(world.adminA, "Nákup A");
  itemA = await createItem(world.memberA, listA, "Chleba A");
  listB = await createList(world.memberB, "Tajný nákup B");
  itemB = await createItem(world.memberB, listB, "Tajné pivo B", [world.adminB]);
  pantryB = await createList(world.memberB, "Spíž B", true);
  pantryItemB = await createItem(world.memberB, pantryB, "Tajná mouka B");
  // Položka bez seznamu (legacy „default“) nepatří žádné chatě – nesmí na ni sáhnout nikdo zvenku.
  orphanItemB = await createItem(world.memberB, null, "Tajná sůl B");
});

after(teardownIntegrationFile);

for (const actor of ["memberA", "adminA"] as const) {
  describe(`shopping lists: ${actor} on a cabin B list gets 404 and the list is unchanged`, () => {
    const cases: [string, Call][] = [
      ["PATCH /shopping-lists/:id/rename", (u) => as(app, u).patch(`/api/shopping-lists/${listB}/rename`).send({ name: "Převzato" })],
      ["PATCH /shopping-lists/:id/resolve", (u) => as(app, u).patch(`/api/shopping-lists/${listB}/resolve`).send({ isResolved: true })],
      ["DELETE /shopping-lists/:id", (u) => as(app, u).delete(`/api/shopping-lists/${listB}`)],
      ["POST /shopping-list/:listId/items", (u) => as(app, u).post(`/api/shopping-list/${listB}/items`).send({ name: "Podstrčené" })],
    ];

    for (const [name, call] of cases) {
      test(name, async () => {
        const before = await listSnapshot(listB);
        const res = await call(world[actor]);
        assert.equal(res.status, 404);
        assert.deepEqual(await listSnapshot(listB), before);
      });
    }
  });

  describe(`shopping items: ${actor} on a cabin B item gets 404 and the item is unchanged`, () => {
    const targets = () => [
      { label: "item on a list", id: itemB, listId: listB },
      { label: "pantry item", id: pantryItemB, listId: pantryB },
      { label: "item without a list", id: orphanItemB, listId: listB },
    ];
    const cases: [string, (u: TestUser, t: { id: string; listId: string }) => Promise<{ status: number }>][] = [
      ["PUT /shopping-list/:itemId/purchase", (u, t) => as(app, u).put(`/api/shopping-list/${t.id}/purchase`).send({ status: "purchased", price: 1 })],
      ["PATCH /shopping-list/:itemId/toggle-essential", (u, t) => as(app, u).patch(`/api/shopping-list/${t.id}/toggle-essential`)],
      ["DELETE /shopping-list/:itemId", (u, t) => as(app, u).delete(`/api/shopping-list/${t.id}`)],
    ];

    for (const [name, call] of cases) {
      test(name, async () => {
        for (const target of targets()) {
          const before = await itemSnapshot(target.id);
          const listCount = await prisma.shoppingList.count();
          const res = await call(world[actor], target);
          assert.equal(res.status, 404, `${target.label}: status`);
          assert.deepEqual(await itemSnapshot(target.id), before, `${target.label}: changed`);
          assert.equal(await prisma.shoppingList.count(), listCount, `${target.label}: list created`);
        }
      });
    }
  });
}

describe("shopping splits: splitting with a cabin B user → 404, nothing is created", () => {
  const cases: [string, Call][] = [
    ["only a cabin B user", (u) => as(app, u).put(`/api/shopping-list/${itemA}/purchase`).send({ status: "purchased", price: 50, splitWith: [world.memberB.id] })],
    ["cabin A and cabin B users", (u) => as(app, u).put(`/api/shopping-list/${itemA}/purchase`).send({ status: "purchased", price: 50, splitWith: [world.adminA.id, world.memberB.id] })],
  ];

  for (const [name, call] of cases) {
    test(name, async () => {
      const before = await itemSnapshot(itemA);
      const res = await call(world.memberA);
      assert.equal(res.status, 404);
      assert.deepEqual(await itemSnapshot(itemA), before);
    });
  }
});

describe("shopping: lists for cabin A contain nothing from cabin B", () => {
  const leaks = () => [
    listB, itemB, pantryB, pantryItemB, orphanItemB, world.memberB.id, world.adminB.id,
    world.memberB.username, world.adminB.username, CABIN_B_NAME_PREFIX,
  ];

  for (const path of ["/api/shopping-lists", "/api/shopping-lists?isPantry=true"]) {
    test(`GET ${path}`, async () => {
      const res = await as(app, world.memberA).get(path);
      assert.equal(res.status, 200);
      const body = JSON.stringify(res.body);
      for (const leak of leaks()) assert.equal(body.includes(leak), false, `leaked ${leak}`);
    });
  }

  test("GET /api/shopping-lists returns cabin A's list with its item", async () => {
    const res = await as(app, world.memberA).get("/api/shopping-lists?isPantry=false");
    assert.deepEqual(res.body.map((l: { id: string }) => l.id), [listA]);
    assert.deepEqual(res.body[0].items.map((i: { id: string }) => i.id), [itemA]);
  });
});

describe("shopping: same-cabin flows still work (positive control)", () => {
  test("purchase with a split inside cabin A → 200 and realtime goes only to cabin A's room", async () => {
    const recorder = recordRealtimeEmits();
    try {
      const res = await as(app, world.memberA).put(`/api/shopping-list/${itemA}/purchase`)
        .send({ status: "purchased", price: 80, splitWith: [world.adminA.id, world.memberA.id] });
      assert.equal(res.status, 200);
      assert.deepEqual([...res.body.splitWith].sort(), [world.adminA.id, world.memberA.id].sort());
      assert.deepEqual([...new Set(recorder.emits.map((e) => e.room))], [`cabin:${world.cabinA.id}`]);
    } finally {
      recorder.restore();
    }
  });

  test("member A cannot rename a list created by admin A (403 stays inside the cabin)", async () => {
    const res = await as(app, world.memberA).patch(`/api/shopping-lists/${listA}/rename`).send({ name: "Moje" });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, "Nemáte oprávnění přejmenovat tento seznam");
    assert.equal((await listSnapshot(listA))?.name, "Nákup A");
  });
});

describe("shopping: status is the only purchase state and the pantry concept is gone", () => {
  test("GET /api/shopping-lists hides a legacy pantry list and exposes neither isPantry nor purchased", async () => {
    const pantryA = await createList(world.adminA, "Spíž A", true);
    try {
      const res = await as(app, world.memberA).get("/api/shopping-lists");
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.map((l: { id: string }) => l.id), [listA]);
      assert.equal("isPantry" in res.body[0], false);
      assert.equal("purchased" in res.body[0].items[0], false);
    } finally {
      await prisma.shoppingList.delete({ where: { id: pantryA } });
    }
  });

  test("removed pantry and duplicate endpoints answer 404 inside the own cabin and change nothing", async () => {
    const listCount = await prisma.shoppingList.count();
    const before = await itemSnapshot(itemA);
    assert.equal((await as(app, world.memberA).get("/api/shopping-lists/pantry")).status, 404);
    assert.equal((await as(app, world.memberA).post(`/api/shopping-list/${itemA}/move-from-pantry`)).status, 404);
    assert.equal((await as(app, world.memberA).put(`/api/shopping-lists/${listA}/items/${itemA}`).send({ status: "purchased" })).status, 404);
    assert.equal(await prisma.shoppingList.count(), listCount);
    assert.deepEqual(await itemSnapshot(itemA), before);
  });

  test("adding an item and changing its status speak status only; the legacy purchased body is rejected", async () => {
    const added = await as(app, world.memberA).post(`/api/shopping-list/${listA}/items`).send({ name: "Mléko A" });
    assert.equal(added.status, 201);
    assert.equal(added.body.status, "pending");
    assert.equal("purchased" in added.body, false);
    try {
      const legacy = await as(app, world.memberA).put(`/api/shopping-list/${added.body.id}/purchase`).send({ purchased: true });
      assert.equal(legacy.status, 400);

      const bought = await as(app, world.memberA).put(`/api/shopping-list/${added.body.id}/purchase`).send({ status: "purchased" });
      assert.equal(bought.status, 200);
      assert.equal(bought.body.status, "purchased");
      assert.equal("purchased" in bought.body, false);
      assert.equal((await itemSnapshot(added.body.id))?.status, "purchased");
    } finally {
      await prisma.shoppingListItem.delete({ where: { id: added.body.id } });
    }
  });

  test("dashboard and missing-summary count pending items by status alone", async () => {
    // Sloupec purchased zůstává na výchozím false – nákup určuje jen status.
    const bought = await prisma.shoppingListItem.create({
      data: { name: "Koupené A", listId: listA, addedById: world.memberA.id, status: "purchased" },
    });
    try {
      const pending = await prisma.shoppingListItem.count({ where: { listId: listA, status: { not: "purchased" } } });
      const dashboard = await as(app, world.memberA).get("/api/dashboard/shopping");
      assert.equal(dashboard.status, 200);
      assert.equal(dashboard.body.totalPendingShoppingCount, pending);
      assert.equal(dashboard.body.pendingShoppingItems.some((i: { id: string }) => i.id === bought.id), false);
      const summary = await as(app, world.memberA).get("/api/inventory/missing-summary");
      assert.equal(summary.body.pendingShoppingCount, pending);
    } finally {
      await prisma.shoppingListItem.delete({ where: { id: bought.id } });
    }
  });
});

describe("shopping: legacy item routes the frontend never called are gone", () => {
  test("GET/POST /api/shopping-list, list-scoped purchase/delete and the \"default\" list answer 404 inside the own cabin and change nothing", async () => {
    const itemCount = await prisma.shoppingListItem.count();
    const listCount = await prisma.shoppingList.count();
    const before = await itemSnapshot(itemA);
    const u = world.memberA;
    assert.equal((await as(app, u).get("/api/shopping-list")).status, 404);
    assert.equal((await as(app, u).post("/api/shopping-list").send({ name: "Nový" })).status, 404);
    assert.equal((await as(app, u).put(`/api/shopping-list/${listA}/items/${itemA}/purchase`).send({ status: "purchased" })).status, 404);
    assert.equal((await as(app, u).delete(`/api/shopping-list/${listA}/items/${itemA}`)).status, 404);
    assert.equal((await as(app, u).post("/api/shopping-list/default/items").send({ name: "Bez seznamu" })).status, 404);
    assert.equal(await prisma.shoppingListItem.count(), itemCount);
    assert.equal(await prisma.shoppingList.count(), listCount);
    assert.deepEqual(await itemSnapshot(itemA), before);
  });

  test("an item of the own cabin is still removed through DELETE /api/shopping-list/:itemId", async () => {
    const extra = await createItem(world.memberA, listA, "Máslo A");
    const removed = await as(app, world.memberA).delete(`/api/shopping-list/${extra}`);
    assert.equal(removed.status, 200);
    assert.equal(await itemSnapshot(extra), null);
  });
});

// #219: „Přivezu z domova“ je vyřešená položka stejně jako Koupeno (rozhodnutí #167 = A).
describe("shopping: bring from home counts as resolved and restocks the linked inventory", () => {
  let list: string;

  before(async () => {
    list = await createList(world.memberA, "Víkend A");
  });

  async function createInventory(owner: TestUser, name: string, status: string, inCart = true): Promise<string> {
    const inv = await prisma.inventoryItem.create({ data: { name, status, inCart, cabinId: owner.cabinId, updatedById: owner.id } });
    return inv.id;
  }

  async function createLinkedItem(
    name: string,
    linkedInventoryId: string | null,
    data: { status?: "pending" | "bring_from_home" | "purchased"; isEssential?: boolean } = {},
  ): Promise<string> {
    const item = await prisma.shoppingListItem.create({
      data: { name, listId: list, addedById: world.memberA.id, linkedInventoryId, ...data },
    });
    return item.id;
  }

  const inventorySnapshot = (id: string) => prisma.inventoryItem.findUnique({ where: { id }, select: { status: true, inCart: true } });
  const setStatus = (user: TestUser, id: string, body: Record<string, unknown>) =>
    as(app, user).put(`/api/shopping-list/${id}/purchase`).send(body);

  async function withEmits<T>(fn: () => Promise<T>) {
    const recorder = recordRealtimeEmits();
    try {
      const result = await fn();
      return { result, emits: recorder.emits };
    } finally {
      recorder.restore();
    }
  }

  test("Koupit → Přivezu z domova records who and when, clears price and splits and restocks the inventory", async () => {
    const inv = await createInventory(world.memberA, "Káva A", "EMPTY");
    // Zbytky ceny a dělení z dřívějška se musí vynulovat.
    const { id } = await prisma.shoppingListItem.create({
      data: {
        name: "Káva A", listId: list, addedById: world.memberA.id, linkedInventoryId: inv, price: 99,
        splits: { create: [{ userId: world.adminA.id }] },
      },
    });

    const { result: res, emits } = await withEmits(() =>
      setStatus(world.adminA, id, { status: "bring_from_home", price: 50, splitWith: [world.memberA.id] }));

    assert.equal(res.status, 200);
    assert.equal(res.body.status, "bring_from_home");
    assert.equal(res.body.purchasedById, world.adminA.id);
    assert.equal(res.body.purchasedBy, world.adminA.username);
    assert.ok(res.body.purchasedAt, "purchasedAt is set");
    assert.equal(res.body.price, undefined);
    assert.deepEqual(res.body.splitWith, []);
    assert.equal(res.body.linkedInventoryId, inv);

    const stored = await itemSnapshot(id);
    assert.equal(stored?.purchasedById, world.adminA.id);
    assert.ok(stored?.purchasedAt);
    assert.equal(stored?.price, null);
    assert.deepEqual(stored?.splits, []);
    assert.deepEqual(await inventorySnapshot(inv), { status: "OK", inCart: false });

    assert.ok(emits.some((e) => e.event === "inventory:updated"), "inventory:updated emitted");
    assert.deepEqual([...new Set(emits.map((e) => e.room))], [`cabin:${world.cabinA.id}`]);
  });

  test("Přivezu z domova ↔ Koupeno rewrites who and when and leaves the inventory alone", async () => {
    const inv = await createInventory(world.memberA, "Mléko A2", "EMPTY");
    const id = await createLinkedItem("Mléko A2", inv);
    assert.equal((await setStatus(world.memberA, id, { status: "bring_from_home" })).status, 200);
    // Někdo mezitím zásobu ručně změnil – další přepnutí ji už nesmí přepsat.
    await prisma.inventoryItem.update({ where: { id: inv }, data: { status: "LOW", inCart: true } });

    const { result: bought, emits: boughtEmits } = await withEmits(() =>
      setStatus(world.adminA, id, { status: "purchased", price: 30, splitWith: [world.memberA.id] }));
    assert.equal(bought.status, 200);
    assert.equal(bought.body.purchasedById, world.adminA.id);
    assert.equal(bought.body.price, 30);
    assert.deepEqual(await inventorySnapshot(inv), { status: "LOW", inCart: true });
    assert.equal(boughtEmits.some((e) => e.event === "inventory:updated"), false);

    const { result: home, emits: homeEmits } = await withEmits(() => setStatus(world.memberA, id, { status: "bring_from_home" }));
    assert.equal(home.status, 200);
    assert.equal(home.body.purchasedById, world.memberA.id);
    assert.equal(home.body.price, undefined);
    assert.deepEqual(home.body.splitWith, []);
    assert.deepEqual(await inventorySnapshot(inv), { status: "LOW", inCart: true });
    assert.equal(homeEmits.some((e) => e.event === "inventory:updated"), false);
  });

  for (const [from, inventoryStatus, expected] of [
    ["bring_from_home", "OK", "LOW"],
    ["purchased", "OK", "LOW"],
    ["purchased", "LOW", "LOW"],
    ["bring_from_home", "EMPTY", "EMPTY"],
  ] as const) {
    test(`${from} → Koupit clears who, when, price and splits; inventory ${inventoryStatus} → ${expected}, back in the cart`, async () => {
      const inv = await createInventory(world.memberA, `Zásoba ${from} ${inventoryStatus}`, inventoryStatus, false);
      const { id } = await prisma.shoppingListItem.create({
        data: {
          name: `Položka ${from} ${inventoryStatus}`, listId: list, addedById: world.memberA.id, linkedInventoryId: inv,
          status: from, purchasedById: world.adminA.id, purchasedAt: new Date("2027-01-05"), price: 40,
          splits: { create: [{ userId: world.adminA.id }] },
        },
      });

      const { result: res, emits } = await withEmits(() => setStatus(world.memberA, id, { status: "pending" }));

      assert.equal(res.status, 200);
      assert.equal(res.body.purchasedById, null);
      assert.equal(res.body.purchasedAt, undefined);
      assert.equal(res.body.price, undefined);
      assert.deepEqual(res.body.splitWith, []);
      const stored = await itemSnapshot(id);
      assert.equal(stored?.purchasedById, null);
      assert.equal(stored?.purchasedAt, null);
      assert.equal(stored?.price, null);
      assert.deepEqual(stored?.splits, []);
      assert.deepEqual(await inventorySnapshot(inv), { status: expected, inCart: true });
      assert.ok(emits.some((e) => e.event === "inventory:updated"), "inventory:updated emitted");
      assert.deepEqual([...new Set(emits.map((e) => e.room))], [`cabin:${world.cabinA.id}`]);
    });
  }

  test("a status change still succeeds when the linked inventory item has vanished", async () => {
    const inv = await createInventory(world.memberA, "Zmizelá zásoba A", "LOW");
    const id = await createLinkedItem("Zmizelá A", inv);
    await prisma.inventoryItem.delete({ where: { id: inv } });

    for (const status of ["bring_from_home", "pending", "purchased", "pending"] as const) {
      const res = await setStatus(world.memberA, id, { status });
      assert.equal(res.status, 200, `→ ${status}`);
      assert.equal(res.body.status, status);
    }
  });

  test("an item linked to a cabin B inventory item never touches it and emits nothing to cabin B", async () => {
    const invB = await createInventory(world.memberB, "Tajná káva B", "EMPTY");
    const id = await createLinkedItem("Káva s cizí vazbou", invB);
    const before = await prisma.inventoryItem.findUnique({ where: { id: invB } });

    for (const status of ["bring_from_home", "pending", "purchased"] as const) {
      const { result: res, emits } = await withEmits(() => setStatus(world.memberA, id, { status }));
      assert.equal(res.status, 200, `→ ${status}`);
      assert.equal(emits.some((e) => e.room === `cabin:${world.cabinB.id}`), false, `→ ${status}: emitted to cabin B`);
    }
    assert.deepEqual(await prisma.inventoryItem.findUnique({ where: { id: invB } }), before);
  });

  test("deleting a linked item takes the inventory out of the cart and emits inventory:updated to cabin A only", async () => {
    const inv = await createInventory(world.memberA, "Sůl A2", "LOW");
    const id = await createLinkedItem("Sůl A2", inv);

    const { result: res, emits } = await withEmits(() => as(app, world.memberA).delete(`/api/shopping-list/${id}`));

    assert.equal(res.status, 200);
    assert.deepEqual(await inventorySnapshot(inv), { status: "LOW", inCart: false });
    assert.ok(emits.some((e) => e.event === "inventory:updated"), "inventory:updated emitted");
    assert.deepEqual([...new Set(emits.map((e) => e.room))], [`cabin:${world.cabinA.id}`]);
  });

  test("deleting a linked item whose inventory vanished still succeeds", async () => {
    const inv = await createInventory(world.memberA, "Pepř A", "LOW");
    const id = await createLinkedItem("Pepř A", inv);
    await prisma.inventoryItem.delete({ where: { id: inv } });

    const res = await as(app, world.memberA).delete(`/api/shopping-list/${id}`);
    assert.equal(res.status, 200);
    assert.equal(await itemSnapshot(id), null);
  });

  test("deleting a list takes its linked inventory out of the cart and emits inventory:updated to cabin A only", async () => {
    const other = await createList(world.memberA, "Na smazání A");
    const inv = await createInventory(world.memberA, "Olej A", "EMPTY");
    await prisma.shoppingListItem.create({ data: { name: "Olej A", listId: other, addedById: world.memberA.id, linkedInventoryId: inv } });

    const { result: res, emits } = await withEmits(() => as(app, world.memberA).delete(`/api/shopping-lists/${other}`));

    assert.equal(res.status, 200);
    assert.deepEqual(await inventorySnapshot(inv), { status: "EMPTY", inCart: false });
    assert.ok(emits.some((e) => e.event === "inventory:updated"), "inventory:updated emitted");
    assert.deepEqual([...new Set(emits.map((e) => e.room))], [`cabin:${world.cabinA.id}`]);
  });

  test("dashboard and missing-summary treat only Koupit as pending; a ★ item someone will bring leaves the warning", async () => {
    const home = await createLinkedItem("Plyn A", null, { status: "bring_from_home", isEssential: true });
    const pending = await createLinkedItem("Baterky A", null, { isEssential: true });
    try {
      const cabinLists = { isResolved: false, isPantry: false, cabinId: world.cabinA.id };
      const pendingCount = await prisma.shoppingListItem.count({ where: { status: "pending", list: cabinLists } });
      const notPurchasedCount = await prisma.shoppingListItem.count({ where: { status: { not: "purchased" }, list: cabinLists } });
      assert.ok(pendingCount < notPurchasedCount, "fixture has a bring-from-home item that tells the definitions apart");

      const dashboard = await as(app, world.memberA).get("/api/dashboard/shopping");
      assert.equal(dashboard.status, 200);
      assert.equal(dashboard.body.totalPendingShoppingCount, pendingCount);
      const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
      assert.equal(ids(dashboard.body.pendingShoppingItems).includes(home), false);
      assert.equal(ids(dashboard.body.pendingShoppingItems).includes(pending), true);
      assert.deepEqual(ids(dashboard.body.essentialWarning.items), [pending]);
      assert.equal(dashboard.body.essentialWarning.count, 1);

      const summary = await as(app, world.memberA).get("/api/inventory/missing-summary");
      assert.equal(summary.status, 200);
      assert.equal(summary.body.pendingShoppingCount, pendingCount);
    } finally {
      await prisma.shoppingListItem.deleteMany({ where: { id: { in: [home, pending] } } });
    }
  });
});
