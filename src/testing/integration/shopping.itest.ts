import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { addGuests, as, recordRealtimeEmits, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";

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

describe("shopping: a source message from cabin B is rejected (#483)", () => {
  test("POST /shopping-list/:listId/items with a cabin B sourceMessageId → 404, nothing created", async () => {
    const noteB = await prisma.note.create({ data: { userId: world.memberB.id, cabinId: world.cabinB.id, message: "Tajná zpráva B" } });
    const countBefore = await prisma.shoppingListItem.count();
    const res = await as(app, world.memberA).post(`/api/shopping-list/${listA}/items`).send({ name: "Z cizí zprávy", sourceMessageId: noteB.id });
    assert.equal(res.status, 404);
    assert.equal(await prisma.shoppingListItem.count(), countBefore);
  });

  test("a cabin A source message is stored (positive control)", async () => {
    const noteA = await prisma.note.create({ data: { userId: world.memberA.id, cabinId: world.cabinA.id, message: "Zpráva A" } });
    const res = await as(app, world.memberA).post(`/api/shopping-list/${listA}/items`).send({ name: "Z vlastní zprávy", sourceMessageId: noteA.id });
    try {
      assert.equal(res.status, 201);
      assert.equal((await prisma.shoppingListItem.findUnique({ where: { id: res.body.id } }))?.sourceMessageId, noteA.id);
    } finally {
      await prisma.shoppingListItem.deleteMany({ where: { id: res.body.id } });
    }
  });
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
    assert.equal(res.body.error, "Nemáš oprávnění přejmenovat tento seznam");
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
  type Status = "pending" | "bring_from_home" | "purchased";
  type ItemData = { status?: Status; isEssential?: boolean; listId?: string; purchasedById?: string; purchasedAt?: Date };
  let list: string;
  before(async () => { list = await createList(world.memberA, "Víkend A"); });

  const createInventory = async (owner: TestUser, name: string, status: string, inCart = true) =>
    (await prisma.inventoryItem.create({ data: { name, status, inCart, cabinId: owner.cabinId, updatedById: owner.id } })).id;
  // Každá položka nese zbytek ceny a dělení – přechody je musí vynulovat.
  const createLinkedItem = async (name: string, linkedInventoryId: string | null, data: ItemData = {}) =>
    (await prisma.shoppingListItem.create({
      data: { name, listId: list, addedById: world.memberA.id, linkedInventoryId, price: 40, splits: { create: [{ userId: world.adminA.id }] }, ...data },
    })).id;
  const inventoryOf = (id: string) => prisma.inventoryItem.findUnique({ where: { id }, select: { status: true, inCart: true } });
  const resolvedBy = async (id: string) => {
    const i = await itemSnapshot(id);
    return { status: i?.status, by: i?.purchasedById ?? null, at: Boolean(i?.purchasedAt), price: i?.price?.toNumber() ?? null, splits: i?.splits.length };
  };
  async function recorded<T>(fn: () => Promise<T>) {
    const recorder = recordRealtimeEmits();
    try {
      const result = await fn();
      const rooms = [...new Set(recorder.emits.map((e) => e.room))];
      return { result, rooms, inventoryEmitted: recorder.emits.some((e) => e.event === "inventory:updated") };
    } finally {
      recorder.restore();
    }
  }
  const setStatus = (user: TestUser, id: string, status: Status, extra: Record<string, unknown> = {}) =>
    recorded(() => as(app, user).put(`/api/shopping-list/${id}/purchase`).send({ status, ...extra }));
  const roomA = () => [`cabin:${world.cabinA.id}`];

  test("Koupit → Přivezu z domova records who and when, clears price and splits, restocks the inventory", async () => {
    const inv = await createInventory(world.memberA, "Káva A", "EMPTY");
    const id = await createLinkedItem("Káva A", inv);

    const { result: res, rooms, inventoryEmitted } = await setStatus(world.adminA, id, "bring_from_home", { price: 50, splitWith: [world.memberA.id] });

    assert.equal(res.status, 200);
    assert.deepEqual(
      [res.body.purchasedById, res.body.purchasedBy, res.body.price, res.body.splitWith, res.body.linkedInventoryId],
      [world.adminA.id, world.adminA.username, undefined, [], inv],
    );
    assert.deepEqual(await resolvedBy(id), { status: "bring_from_home", by: world.adminA.id, at: true, price: null, splits: 0 });
    assert.deepEqual(await inventoryOf(inv), { status: "OK", inCart: false });
    assert.equal(inventoryEmitted, true);
    assert.deepEqual(rooms, roomA());
  });

  test("Přivezu z domova ↔ Koupeno rewrites who and when and leaves the inventory alone", async () => {
    const inv = await createInventory(world.memberA, "Mléko A2", "LOW");
    const id = await createLinkedItem("Mléko A2", inv, { status: "bring_from_home", purchasedById: world.memberA.id });

    const bought = await setStatus(world.adminA, id, "purchased", { price: 30, splitWith: [world.memberA.id] });
    assert.deepEqual(await resolvedBy(id), { status: "purchased", by: world.adminA.id, at: true, price: 30, splits: 1 });
    const home = await setStatus(world.memberA, id, "bring_from_home");
    assert.deepEqual(await resolvedBy(id), { status: "bring_from_home", by: world.memberA.id, at: true, price: null, splits: 0 });

    assert.deepEqual(await inventoryOf(inv), { status: "LOW", inCart: true });
    assert.deepEqual([bought.inventoryEmitted, home.inventoryEmitted], [false, false]);
  });

  for (const [from, before, after] of [
    ["bring_from_home", "OK", "LOW"], ["purchased", "OK", "LOW"], ["purchased", "LOW", "LOW"], ["bring_from_home", "EMPTY", "EMPTY"],
  ] as const) {
    test(`${from} → Koupit clears who, when, price and splits; inventory ${before} → ${after}, back in the cart`, async () => {
      const inv = await createInventory(world.memberA, `Zásoba ${from} ${before}`, before, false);
      const id = await createLinkedItem(`Položka ${from} ${before}`, inv, { status: from, purchasedById: world.adminA.id, purchasedAt: new Date() });

      const { result: res, rooms, inventoryEmitted } = await setStatus(world.memberA, id, "pending");

      assert.equal(res.status, 200);
      assert.deepEqual(await resolvedBy(id), { status: "pending", by: null, at: false, price: null, splits: 0 });
      assert.deepEqual(await inventoryOf(inv), { status: after, inCart: true });
      assert.equal(inventoryEmitted, true);
      assert.deepEqual(rooms, roomA());
    });
  }

  test("a vanished or cabin B inventory item is skipped: status changes succeed and cabin B stays untouched", async () => {
    const gone = await createInventory(world.memberA, "Zmizelá zásoba A", "LOW");
    const invB = await createInventory(world.memberB, "Tajná káva B", "EMPTY");
    const items = [await createLinkedItem("Zmizelá A", gone), await createLinkedItem("Káva s cizí vazbou", invB)];
    await prisma.inventoryItem.delete({ where: { id: gone } });
    const beforeB = await prisma.inventoryItem.findUnique({ where: { id: invB } });

    for (const id of items) {
      for (const status of ["bring_from_home", "pending", "purchased", "pending"] as const) {
        const { result: res, rooms } = await setStatus(world.memberA, id, status);
        assert.equal(res.status, 200, `→ ${status}`);
        assert.deepEqual(rooms, roomA());
      }
    }
    assert.deepEqual(await prisma.inventoryItem.findUnique({ where: { id: invB } }), beforeB);
  });

  test("deleting a linked item or its list takes the inventory out of the cart and emits inventory:updated to cabin A", async () => {
    const other = await createList(world.memberA, "Na smazání A");
    const [invItem, invList, gone] = [
      await createInventory(world.memberA, "Sůl A2", "LOW"), await createInventory(world.memberA, "Olej A", "LOW"), await createInventory(world.memberA, "Pepř A", "LOW"),
    ];
    const item = await createLinkedItem("Sůl A2", invItem);
    await createLinkedItem("Olej A", invList, { listId: other });
    const goneItem = await createLinkedItem("Pepř A", gone);
    await prisma.inventoryItem.delete({ where: { id: gone } });

    for (const path of [`/api/shopping-list/${item}`, `/api/shopping-lists/${other}`]) {
      const { result: res, rooms, inventoryEmitted } = await recorded(() => as(app, world.memberA).delete(path));
      assert.equal(res.status, 200, path);
      assert.equal(inventoryEmitted, true, path);
      assert.deepEqual(rooms, roomA());
    }
    assert.deepEqual([await inventoryOf(invItem), await inventoryOf(invList)], [{ status: "LOW", inCart: false }, { status: "LOW", inCart: false }]);
    assert.equal((await as(app, world.memberA).delete(`/api/shopping-list/${goneItem}`)).status, 200, "vanished inventory");
  });

  test("deleting an own item or list linked to a cabin B supply leaves that supply in its cart and emits nothing about it", async () => {
    const invB = await createInventory(world.memberB, "Tajná sůl B2", "LOW");
    const other = await createList(world.memberA, "Cizí vazba A");
    const item = await createLinkedItem("Sůl s cizí vazbou", invB);
    await createLinkedItem("Sůl s cizí vazbou 2", invB, { listId: other });
    const beforeB = await prisma.inventoryItem.findUnique({ where: { id: invB } });

    for (const path of [`/api/shopping-list/${item}`, `/api/shopping-lists/${other}`]) {
      const { result: res, rooms, inventoryEmitted } = await recorded(() => as(app, world.memberA).delete(path));
      assert.equal(res.status, 200, path);
      assert.deepEqual(rooms, roomA(), path);
      assert.equal(inventoryEmitted, false, path);
      assert.deepEqual(await prisma.inventoryItem.findUnique({ where: { id: invB } }), beforeB, path);
    }
    assert.deepEqual([await itemSnapshot(item), await listSnapshot(other)], [null, null]);
  });

  // #275 „Potřebuje pozornost“ + „Koupím já“ (slib „Přivezu z domova“)
  type Attention = { name: string; isEmpty: boolean; inventoryId: string | null; shoppingItemId: string | null };
  const attentionOf = async (user: TestUser) => (await as(app, user).get("/api/dashboard/shopping")).body.attention as Attention[];

  test("dashboard attention lists own supplies Dochází/Došlo and pending ★ items, not plain ones", async () => {
    const supplies = [await createInventory(world.memberA, "Toaleťák P", "EMPTY", false), await createInventory(world.memberB, "Cizí P", "EMPTY", false)];
    const items = [await createLinkedItem("Baterky P", null, { isEssential: true }), await createLinkedItem("Mléko P", null)];
    try {
      const rows = await attentionOf(world.memberA);
      assert.deepEqual(rows.find((r) => r.name === "Toaleťák P"), { name: "Toaleťák P", isEmpty: true, isEssential: false, inventoryId: supplies[0], shoppingItemId: null });
      assert.equal(rows.find((r) => r.name === "Baterky P")?.shoppingItemId, items[0]);
      assert.deepEqual(["Mléko P", "Cizí P"].map((n) => rows.some((r) => r.name === n)), [false, false]);
    } finally {
      // Ostatní testy v souboru počítají nevyřízené ★ položky seznamu
      await prisma.shoppingListItem.deleteMany({ where: { id: { in: items } } });
      await prisma.inventoryItem.deleteMany({ where: { id: { in: supplies } } });
    }
  });

  test("Koupím já marks the pending item or adds it with my pledge, restocks the supply and drops it from attention", async () => {
    const onList = await createInventory(world.memberA, "Sůl P", "LOW");
    const listed = await createLinkedItem("Sůl P", onList);
    const offList = await createInventory(world.memberA, "Sirky P", "EMPTY", false);

    const first = await recorded(() => as(app, world.memberA).post(`/api/inventory/${onList}/pledge`));
    assert.equal(first.result.status, 200);
    assert.equal(first.result.body.id, listed);
    assert.deepEqual(await resolvedBy(listed), { status: "bring_from_home", by: world.memberA.id, at: true, price: null, splits: 0 });
    assert.deepEqual(first.rooms, roomA());

    const second = await as(app, world.adminA).post(`/api/inventory/${offList}/pledge`);
    assert.equal(second.status, 200);
    const created = await prisma.shoppingListItem.findUnique({ where: { id: second.body.id }, include: { list: true } });
    assert.deepEqual([created?.linkedInventoryId, created?.status, created?.purchasedById, created?.list?.cabinId], [offList, "bring_from_home", world.adminA.id, world.cabinA.id]);

    assert.deepEqual([await inventoryOf(onList), await inventoryOf(offList)], [{ status: "OK", inCart: false }, { status: "OK", inCart: false }]);
    const rows = await attentionOf(world.memberA);
    assert.deepEqual(["Sůl P", "Sirky P"].map((n) => rows.some((r) => r.name === n)), [false, false]);
  });

  // #683: ostatní vidí, kdo Došlo ★ koupí; jen sliby vlastní chaty a jen čerstvé
  test("dashboard claimed names who will buy a pledged ★ supply of my cabin, not other cabins' or old pledges", async () => {
    const star = async (owner: TestUser, name: string) => {
      const id = await createInventory(owner, name, "EMPTY", false);
      await prisma.inventoryItem.update({ where: { id }, data: { isEssential: true } });
      return id;
    };
    const mine = await star(world.memberA, "Toaleťák K");
    const foreign = await star(world.memberB, "Cizí K");
    const old = await star(world.memberA, "Sirky K");
    const stale = await createLinkedItem("Sirky K", old, { status: "bring_from_home", purchasedById: world.adminA.id, purchasedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) });
    await prisma.inventoryItem.update({ where: { id: old }, data: { status: "OK" } });
    const pledgeA = await as(app, world.memberA).post(`/api/inventory/${mine}/pledge`).expect(200);
    const pledgeB = await as(app, world.memberB).post(`/api/inventory/${foreign}/pledge`).expect(200);
    try {
      const claimed = (await as(app, world.adminA).get("/api/dashboard/shopping")).body.claimed as { name: string }[];
      assert.deepEqual(claimed.filter((c) => c.name.endsWith(" K")), [{ name: "Toaleťák K", inventoryId: mine, shoppingItemId: pledgeA.body.id, buyer: world.memberA.username }]);
    } finally {
      const items = [stale, pledgeA.body.id, pledgeB.body.id];
      const listB = await prisma.shoppingListItem.findUnique({ where: { id: pledgeB.body.id }, select: { listId: true } });
      await prisma.shoppingListItem.deleteMany({ where: { id: { in: items } } });
      if (pledgeB.body.created && listB?.listId) await prisma.shoppingList.deleteMany({ where: { id: listB.listId, items: { none: {} } } });
      await prisma.inventoryItem.deleteMany({ where: { id: { in: [mine, foreign, old] } } });
    }
  });

  test("Zpět after Koupím já: the pledge response is enough to put the item and the supply back (#511)", async () => {
    const onList = await createInventory(world.memberA, "Sůl Z", "EMPTY");
    const listed = await createLinkedItem("Sůl Z", onList);
    const offList = await createInventory(world.memberA, "Sirky Z", "LOW", false);

    const first = await as(app, world.memberA).post(`/api/inventory/${onList}/pledge`);
    assert.deepEqual([first.body.id, first.body.created, first.body.supplyStatusBefore], [listed, false, "EMPTY"]);
    await as(app, world.memberA).put(`/api/shopping-list/${listed}/purchase`).send({ status: "pending" }).expect(200);
    await as(app, world.memberA).put(`/api/inventory/${onList}`).send({ status: first.body.supplyStatusBefore }).expect(200);
    assert.deepEqual(await resolvedBy(listed), { status: "pending", by: null, at: false, price: null, splits: 0 });

    const second = await as(app, world.memberA).post(`/api/inventory/${offList}/pledge`);
    assert.deepEqual([second.body.created, second.body.supplyStatusBefore], [true, "LOW"]);
    await as(app, world.memberA).delete(`/api/shopping-list/${second.body.id}`).expect(200);
    await as(app, world.memberA).put(`/api/inventory/${offList}`).send({ status: second.body.supplyStatusBefore }).expect(200);
    assert.equal(await prisma.shoppingListItem.count({ where: { linkedInventoryId: offList } }), 0);

    assert.deepEqual([await inventoryOf(onList), await inventoryOf(offList)], [{ status: "EMPTY", inCart: true }, { status: "LOW", inCart: false }]);
    const rows = await attentionOf(world.memberA);
    assert.equal(rows.find((r) => r.name === "Sůl Z")?.shoppingItemId, listed);
    assert.ok(rows.some((r) => r.name === "Sirky Z"));
  });

  test("Koupím já on another cabin's supply is 404, changes nothing and emits nothing", async () => {
    const foreign = await createInventory(world.memberB, "Cizí Q", "EMPTY", false);
    const { result, rooms } = await recorded(() => as(app, world.memberA).post(`/api/inventory/${foreign}/pledge`));
    assert.equal(result.status, 404);
    assert.deepEqual(rooms, []);
    assert.deepEqual(await inventoryOf(foreign), { status: "EMPTY", inCart: false });
    assert.equal(await prisma.shoppingListItem.count({ where: { linkedInventoryId: foreign } }), 0);
  });

  test("dashboard and missing-summary treat only Koupit as pending; a ★ item someone will bring leaves the warning", async () => {
    const home = await createLinkedItem("Plyn A", null, { status: "bring_from_home", isEssential: true });
    const pending = await createLinkedItem("Baterky A", null, { isEssential: true });
    const cabinLists = { isResolved: false, isPantry: false, cabinId: world.cabinA.id };
    const pendingCount = await prisma.shoppingListItem.count({ where: { status: "pending", list: cabinLists } });
    assert.ok(pendingCount < await prisma.shoppingListItem.count({ where: { status: { not: "purchased" }, list: cabinLists } }));

    const dashboard = await as(app, world.memberA).get("/api/dashboard/shopping");
    const pendingIds = dashboard.body.pendingShoppingItems.map((r: { id: string }) => r.id);
    assert.equal(dashboard.body.totalPendingShoppingCount, pendingCount);
    assert.deepEqual([pendingIds.includes(home), pendingIds.includes(pending)], [false, true]);
    assert.deepEqual(dashboard.body.essentialWarning, { count: 1, items: [{ id: pending, name: "Baterky A" }] });
    assert.equal((await as(app, world.memberA).get("/api/inventory/missing-summary")).body.pendingShoppingCount, pendingCount);
  });
});

// #679: smazat položku smí jen ten, kdo ji přidal, zakladatel seznamu nebo admin chaty (stejně jako UI v ItemRow).
describe("shopping: only the item's author, the list founder or an admin may delete an item (#679)", () => {
  let guestA: TestUser;
  let otherMemberA: TestUser;
  let founderList: string;

  before(async () => {
    ({ guestA } = await addGuests(world));
    const other = await prisma.user.create({
      data: { username: "druhy-clen-a", passwordHash: "x", color: "#5d9b62", email: "druhy-clen-a@example.test", isEmailVerified: true, isVerified: true, role: "user", cabinId: world.cabinA.id },
    });
    otherMemberA = { id: other.id, username: other.username, role: "user", cabinId: world.cabinA.id, tokenVersion: other.tokenVersion };
    founderList = await createList(world.memberA, "Seznam člena A");
  });

  after(async () => {
    await prisma.shoppingList.deleteMany({ where: { id: founderList } });
  });

  const deleteAs = (user: TestUser, itemId: string) => as(app, user).delete(`/api/shopping-list/${itemId}`);

  test("a guest gets 403 and the item stays", async () => {
    const item = await createItem(world.adminA, founderList, "Káva A");
    const before = await itemSnapshot(item);
    const res = await deleteAs(guestA, item);
    assert.equal(res.status, 403);
    assert.deepEqual(await itemSnapshot(item), before);
  });

  test("another member (not the author, not the founder) gets 403, the item stays and nothing is emitted", async () => {
    const item = await createItem(world.adminA, founderList, "Čaj A");
    const before = await itemSnapshot(item);
    const recorder = recordRealtimeEmits();
    try {
      const res = await deleteAs(otherMemberA, item);
      assert.equal(res.status, 403);
      assert.equal(res.body.message, "Tuhle položku může smazat jen ten, kdo ji přidal, zakladatel seznamu nebo správce chaty.");
      assert.deepEqual(recorder.emits, []);
    } finally {
      recorder.restore();
    }
    assert.deepEqual(await itemSnapshot(item), before);
  });

  const allowed: [string, () => TestUser, () => TestUser][] = [
    ["the author", () => otherMemberA, () => otherMemberA],
    ["the list founder", () => world.adminA, () => world.memberA],
    ["a cabin admin who is neither author nor founder", () => otherMemberA, () => world.adminA],
  ];
  for (const [who, author, actor] of allowed) {
    test(`${who} gets 200 and the item is gone`, async () => {
      const item = await createItem(author(), founderList, `Mléko A (${who})`);
      const res = await deleteAs(actor(), item);
      assert.equal(res.status, 200);
      assert.equal(await itemSnapshot(item), null);
    });
  }

  test("a user of another cabin gets 404, even an admin, and the item stays", async () => {
    const item = await createItem(world.adminA, founderList, "Rohlík A");
    const before = await itemSnapshot(item);
    for (const actor of [world.memberB, world.adminB]) {
      assert.equal((await deleteAs(actor, item)).status, 404, actor.username);
    }
    assert.deepEqual(await itemSnapshot(item), before);
  });

  test("a whole list: another member and a guest get 403, a cabin admin who did not found it gets 200", async () => {
    const list = await createList(world.memberA, "Celý seznam A");
    await createItem(world.memberA, list, "Sýr A");
    const before = await listSnapshot(list);
    for (const actor of [otherMemberA, guestA]) {
      assert.equal((await as(app, actor).delete(`/api/shopping-lists/${list}`)).status, 403, actor.username);
    }
    assert.deepEqual(await listSnapshot(list), before);
    assert.equal((await as(app, world.adminA).delete(`/api/shopping-lists/${list}`)).status, 200);
    assert.equal(await listSnapshot(list), null);
  });
});
