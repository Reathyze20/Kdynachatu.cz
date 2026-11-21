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
      ["PUT /shopping-list/:listId/items/:itemId/purchase", (u, t) => as(app, u).put(`/api/shopping-list/${t.listId}/items/${t.id}/purchase`).send({ status: "pending" })],
      ["PATCH /shopping-list/:itemId/toggle-essential", (u, t) => as(app, u).patch(`/api/shopping-list/${t.id}/toggle-essential`)],
      ["DELETE /shopping-list/:itemId", (u, t) => as(app, u).delete(`/api/shopping-list/${t.id}`)],
      ["DELETE /shopping-list/:listId/items/:itemId", (u, t) => as(app, u).delete(`/api/shopping-list/${t.listId}/items/${t.id}`)],
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

describe("shopping items: a list and an item from different cabins → 404, nothing changes", () => {
  const combos = () => [
    { label: "list A + item B", listId: listA, itemId: itemB },
    { label: "list B + item A", listId: listB, itemId: itemA },
  ];
  const cases: [string, (listId: string, itemId: string) => Promise<{ status: number }>][] = [
    ["PUT /shopping-list/:listId/items/:itemId/purchase", (l, i) => as(app, world.memberA).put(`/api/shopping-list/${l}/items/${i}/purchase`).send({ status: "purchased" })],
    ["DELETE /shopping-list/:listId/items/:itemId", (l, i) => as(app, world.memberA).delete(`/api/shopping-list/${l}/items/${i}`)],
  ];

  for (const [name, call] of cases) {
    test(name, async () => {
      for (const combo of combos()) {
        const before = await itemSnapshot(combo.itemId);
        const res = await call(combo.listId, combo.itemId);
        assert.equal(res.status, 404, `${combo.label}: status`);
        assert.deepEqual(await itemSnapshot(combo.itemId), before, `${combo.label}: changed`);
      }
    });
  }
});

describe("shopping splits: splitting with a cabin B user → 404, nothing is created", () => {
  const cases: [string, Call][] = [
    ["only a cabin B user", (u) => as(app, u).put(`/api/shopping-list/${itemA}/purchase`).send({ status: "purchased", price: 50, splitWith: [world.memberB.id] })],
    ["cabin A and cabin B users", (u) => as(app, u).put(`/api/shopping-list/${itemA}/purchase`).send({ status: "purchased", price: 50, splitWith: [world.adminA.id, world.memberB.id] })],
    ["legacy path", (u) => as(app, u).put(`/api/shopping-list/${listA}/items/${itemA}/purchase`).send({ status: "purchased", splitWith: [world.adminB.id] })],
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

  for (const path of ["/api/shopping-lists", "/api/shopping-lists?isPantry=true", "/api/shopping-list"]) {
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

  test("legacy routes with the item's own list → 200", async () => {
    const purchase = await as(app, world.memberA).put(`/api/shopping-list/${listA}/items/${itemA}/purchase`).send({ status: "pending" });
    assert.equal(purchase.status, 200);
    const extra = await createItem(world.memberA, listA, "Máslo A");
    const removed = await as(app, world.memberA).delete(`/api/shopping-list/${listA}/items/${extra}`);
    assert.equal(removed.status, 200);
    assert.equal(await itemSnapshot(extra), null);
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
