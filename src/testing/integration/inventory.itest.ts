import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { as, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";

let app: Express;
let world: TestWorld;
let itemA: string;
let itemB: string;
let emptyItemB: string;
/** Every cabin B fixture name starts with this, so any leaked name shows up in a body search. */
const CABIN_B_NAME_PREFIX = "Tajn";

type Call = (user: TestUser) => Promise<{ status: number }>;

async function createItem(
  owner: TestUser,
  name: string,
  opts: { status?: string; isEssential?: boolean } = {},
): Promise<string> {
  const item = await prisma.inventoryItem.create({
    data: {
      name,
      category: "Kuchyně",
      status: opts.status ?? "OK",
      isEssential: opts.isEssential ?? false,
      cabinId: owner.cabinId,
      updatedById: owner.id,
    },
  });
  return item.id;
}

const itemSnapshot = (id: string) => prisma.inventoryItem.findUnique({ where: { id } });

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  itemA = await createItem(world.memberA, "Mouka A", { status: "LOW" });
  itemB = await createItem(world.memberB, "Tajná mouka B", { status: "LOW", isEssential: true });
  emptyItemB = await createItem(world.memberB, "Tajný olej B", { status: "EMPTY" });
});

after(teardownIntegrationFile);

for (const actor of ["memberA", "adminA"] as const) {
  describe(`inventory: ${actor} on a cabin B item gets 404 and the item is unchanged`, () => {
    const cases: [string, Call][] = [
      ["PUT /inventory/:id", (u) => as(app, u).put(`/api/inventory/${itemB}`).send({ name: "Převzato", status: "OK", isEssential: false })],
      ["PATCH /inventory/:id/toggle-essential", (u) => as(app, u).patch(`/api/inventory/${itemB}/toggle-essential`)],
      ["DELETE /inventory/:id", (u) => as(app, u).delete(`/api/inventory/${itemB}`)],
      ["POST /inventory/:id/add-to-cart", (u) => as(app, u).post(`/api/inventory/${itemB}/add-to-cart`).send({ newListName: "Podstrčený nákup" })],
    ];

    for (const [name, call] of cases) {
      test(name, async () => {
        const before = await itemSnapshot(itemB);
        const itemCount = await prisma.inventoryItem.count();
        const listCount = await prisma.shoppingList.count();
        const shoppingItemCount = await prisma.shoppingListItem.count();
        const res = await call(world[actor]);
        assert.equal(res.status, 404);
        assert.deepEqual(await itemSnapshot(itemB), before, "item B changed");
        assert.equal(await prisma.inventoryItem.count(), itemCount, "inventory item created/deleted");
        assert.equal(await prisma.shoppingList.count(), listCount, "shopping list created");
        assert.equal(await prisma.shoppingListItem.count(), shoppingItemCount, "shopping item created");
      });
    }
  });
}

describe("inventory: lists for cabin A contain nothing from cabin B", () => {
  const leaks = () => [
    itemB, emptyItemB, "Tajná mouka B", "Tajný olej B",
    world.memberB.id, world.adminB.id, world.memberB.username, world.adminB.username, CABIN_B_NAME_PREFIX,
  ];

  for (const path of ["/api/inventory", "/api/inventory/missing-summary"]) {
    test(`GET ${path}`, async () => {
      const res = await as(app, world.memberA).get(path);
      assert.equal(res.status, 200);
      const body = JSON.stringify(res.body);
      for (const leak of leaks()) assert.equal(body.includes(leak), false, `leaked ${leak}`);
    });
  }

  test("GET /api/inventory returns only cabin A's item", async () => {
    const res = await as(app, world.memberA).get("/api/inventory");
    assert.deepEqual(res.body.map((i: { id: string }) => i.id), [itemA]);
  });

  test("GET /api/inventory/missing-summary counts only cabin A's missing items", async () => {
    const res = await as(app, world.memberA).get("/api/inventory/missing-summary");
    // Chata A má jedinou chybějící položku (Mouka A, LOW); položky B se nepočítají.
    assert.equal(res.body.count, 1);
    assert.deepEqual(res.body.items, [{ name: "Mouka A", status: "LOW" }]);
  });
});

describe("inventory: same-cabin flows still work (positive control)", () => {
  test("create → update → toggle-essential → add-to-cart → delete inside cabin A all 2xx", async () => {
    const created = await as(app, world.memberA).post("/api/inventory").send({ name: "Sůl A", status: "LOW" });
    assert.equal(created.status, 201);
    const id: string = created.body.id;

    const updated = await as(app, world.memberA).put(`/api/inventory/${id}`).send({ status: "EMPTY" });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.status, "EMPTY");

    const toggled = await as(app, world.memberA).patch(`/api/inventory/${id}/toggle-essential`);
    assert.equal(toggled.status, 200);
    assert.equal(toggled.body.isEssential, true);

    const addedToCart = await as(app, world.memberA).post(`/api/inventory/${id}/add-to-cart`).send({ newListName: "Nákup A" });
    assert.equal(addedToCart.status, 200);
    // Vznikl právě jeden seznam a jedna položka v chatě A, napojená na zásobu.
    const lists = await prisma.shoppingList.findMany({ where: { cabinId: world.cabinA.id } });
    assert.equal(lists.length, 1);
    const cartItems = await prisma.shoppingListItem.findMany({ where: { linkedInventoryId: id } });
    assert.equal(cartItems.length, 1);
    assert.equal((await itemSnapshot(id))?.inCart, true);

    const removed = await as(app, world.memberA).delete(`/api/inventory/${id}`);
    assert.equal(removed.status, 200);
    assert.equal(await itemSnapshot(id), null);
  });

  test("a guest in cabin A cannot toggle-essential (403 stays inside the cabin)", async () => {
    const guest = await prisma.user.create({
      data: {
        username: "host-a",
        passwordHash: "x",
        color: "#5d9b62",
        email: "host-a@example.test",
        isEmailVerified: true,
        isVerified: true,
        role: "guest",
        cabinId: world.cabinA.id,
      },
    });
    const guestA: TestUser = { id: guest.id, username: guest.username, role: "guest", cabinId: world.cabinA.id };
    const before = await itemSnapshot(itemA);
    const res = await as(app, guestA).patch(`/api/inventory/${itemA}/toggle-essential`);
    assert.equal(res.status, 403);
    assert.deepEqual(await itemSnapshot(itemA), before);
  });
});

// #219: smazaná zásoba nesmí u nákupních položek dál slibovat doplnění (štítek ze zásob).
describe("inventory: deleting an item unlinks its shopping items", () => {
  const linkedShoppingItem = async (owner: TestUser, linkedInventoryId: string, name: string) => {
    const list = await prisma.shoppingList.create({ data: { name: `Seznam ${name}`, createdById: owner.id, cabinId: owner.cabinId } });
    return (await prisma.shoppingListItem.create({ data: { name, listId: list.id, addedById: owner.id, linkedInventoryId } })).id;
  };
  const linkOf = async (id: string) => (await prisma.shoppingListItem.findUnique({ where: { id } }))?.linkedInventoryId;

  test("DELETE /inventory/:id unlinks only the own cabin's shopping items and keeps them", async () => {
    const inv = await createItem(world.memberA, "Čaj A", { status: "LOW" });
    const own = await linkedShoppingItem(world.memberA, inv, "Čaj A");
    const foreign = await linkedShoppingItem(world.memberB, inv, "Tajný čaj B");

    assert.equal((await as(app, world.memberA).delete(`/api/inventory/${inv}`)).status, 200);
    assert.equal(await itemSnapshot(inv), null);
    assert.deepEqual([await linkOf(own), await linkOf(foreign)], [null, inv]);
  });

  test("cabin A deleting a cabin B item gets 404 and cabin B's link stays", async () => {
    const shoppingItemB = await linkedShoppingItem(world.memberB, itemB, "Tajné kakao B");
    assert.equal((await as(app, world.memberA).delete(`/api/inventory/${itemB}`)).status, 404);
    assert.equal(await linkOf(shoppingItemB), itemB);
  });
});

describe("inventory: error messages are readable Czech", () => {
  test("404 on a cabin B item and 409 on a second add-to-cart carry the Czech text", async () => {
    const missing = await as(app, world.memberA).delete(`/api/inventory/${itemB}`);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.message, "Položka nenalezena.");

    const id = await createItem(world.memberA, "Cukr A", { status: "LOW" });
    const first = await as(app, world.memberA).post(`/api/inventory/${id}/add-to-cart`).send({ newListName: "Cukr" });
    assert.equal(first.status, 200);
    assert.equal(first.body.message, "Přidáno do nákupního seznamu.");
    const second = await as(app, world.memberA).post(`/api/inventory/${id}/add-to-cart`).send({ newListName: "Cukr" });
    assert.equal(second.status, 409);
    assert.equal(second.body.message, "Položka je již přidána do nákupu.");
  });
});
