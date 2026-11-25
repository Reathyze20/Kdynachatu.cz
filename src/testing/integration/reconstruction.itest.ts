import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { as, recordRealtimeEmits, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";

let app: Express;
let world: TestWorld;
let itemB: string;
let itemA: string;
/** Every cabin B fixture title starts with this, so any leak shows up in a body search. */
const CABIN_B_PREFIX = "Tajn";

type Call = (user: TestUser) => Promise<{ status: number }>;

async function createItem(
  author: TestUser,
  title: string,
  opts: { category?: string; status?: string } = {},
): Promise<string> {
  const item = await prisma.reconstructionItem.create({
    data: {
      category: opts.category ?? "idea",
      title,
      description: "",
      status: opts.status ?? "pending",
      createdById: author.id,
      cabinId: author.cabinId,
    },
  });
  return item.id;
}

const itemSnapshot = (id: string) =>
  prisma.reconstructionItem.findUnique({
    where: { id },
    include: { votes: { orderBy: { userId: "asc" } } },
  });

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  itemA = await createItem(world.memberA, "Nápad A");
  itemB = await createItem(world.memberB, "Tajný nápad B", { category: "company", status: "pending" });
});

after(teardownIntegrationFile);

for (const actor of ["memberA", "adminA"] as const) {
  describe(`reconstruction: ${actor} on a cabin B item gets 404 and the item is unchanged`, () => {
    const cases: [string, Call][] = [
      [
        "PUT /reconstruction/:id (edit)",
        (u) => as(app, u).put(`/api/reconstruction/${itemB}`).send({ category: "company", title: "Přepsáno" }),
      ],
      ["PATCH /reconstruction/:id/vote", (u) => as(app, u).patch(`/api/reconstruction/${itemB}/vote`)],
      [
        "PATCH /reconstruction/:id/status",
        (u) => as(app, u).patch(`/api/reconstruction/${itemB}/status`).send({ status: "approved" }),
      ],
      ["DELETE /reconstruction/:id", (u) => as(app, u).delete(`/api/reconstruction/${itemB}`)],
    ];

    for (const [name, call] of cases) {
      test(name, async () => {
        const before = await itemSnapshot(itemB);
        const voteCountBefore = await prisma.reconstructionVote.count();
        const res = await call(world[actor]);
        assert.equal(res.status, 404);
        assert.deepEqual(await itemSnapshot(itemB), before);
        // Hlasování cizí chaty nesmí vložit žádný vote řádek (404 dřív, než vznikne).
        assert.equal(await prisma.reconstructionVote.count(), voteCountBefore);
      });
    }
  });
}

describe("reconstruction: lists for cabin A contain nothing from cabin B", () => {
  const leaks = () => [
    itemB, "Tajný nápad B", world.memberB.id, world.adminB.id,
    world.memberB.username, world.adminB.username, CABIN_B_PREFIX,
  ];

  test("GET /api/reconstruction", async () => {
    const res = await as(app, world.memberA).get("/api/reconstruction");
    assert.equal(res.status, 200);
    const body = JSON.stringify(res.body);
    for (const leak of leaks()) assert.equal(body.includes(leak), false, `leaked ${leak}`);
  });

  test("GET /api/reconstruction returns only cabin A's own item", async () => {
    const res = await as(app, world.memberA).get("/api/reconstruction");
    assert.deepEqual(res.body.map((i: { id: string }) => i.id), [itemA]);
  });
});

describe("reconstruction: a source message from cabin B is rejected (#483)", () => {
  test("POST /reconstruction with a cabin B sourceMessageId → 404, nothing created", async () => {
    const noteB = await prisma.note.create({ data: { userId: world.memberB.id, cabinId: world.cabinB.id, message: "Tajná zpráva B" } });
    const countBefore = await prisma.reconstructionItem.count();
    const res = await as(app, world.memberA)
      .post("/api/reconstruction")
      .send({ category: "idea", title: "Z cizí zprávy", sourceMessageId: noteB.id });
    assert.equal(res.status, 404);
    assert.equal(await prisma.reconstructionItem.count(), countBefore);
  });

  test("a cabin A source message is stored (positive control)", async () => {
    const noteA = await prisma.note.create({ data: { userId: world.memberA.id, cabinId: world.cabinA.id, message: "Zpráva A" } });
    const res = await as(app, world.memberA)
      .post("/api/reconstruction")
      .send({ category: "idea", title: "Z vlastní zprávy", sourceMessageId: noteA.id });
    assert.equal(res.status, 201);
    assert.equal((await prisma.reconstructionItem.findUnique({ where: { id: res.body.id } }))?.sourceMessageId, noteA.id);
    await prisma.reconstructionItem.delete({ where: { id: res.body.id } });
  });
});

describe("reconstruction: same-cabin flows still work (positive control)", () => {
  test("POST /reconstruction in A → 201 and realtime goes only to cabin A's room", async () => {
    const recorder = recordRealtimeEmits();
    try {
      const res = await as(app, world.memberA)
        .post("/api/reconstruction")
        .send({ category: "idea", title: "Nová myšlenka A" });
      assert.equal(res.status, 201);
      assert.ok(recorder.emits.some((e) => e.event === "reconstruction:created"));
      assert.deepEqual([...new Set(recorder.emits.map((e) => e.room))], [`cabin:${world.cabinA.id}`]);
    } finally {
      recorder.restore();
    }
  });

  test("member A can edit, vote on and delete their own cabin A item", async () => {
    const own = await createItem(world.memberA, "Vlastní nápad A");

    const edit = await as(app, world.memberA)
      .put(`/api/reconstruction/${own}`)
      .send({ category: "idea", title: "Upravený nápad A" });
    assert.equal(edit.status, 200);
    assert.equal((await itemSnapshot(own))?.title, "Upravený nápad A");

    const vote = await as(app, world.memberA).patch(`/api/reconstruction/${own}/vote`);
    assert.equal(vote.status, 200);
    assert.deepEqual((await itemSnapshot(own))?.votes.map((v) => v.userId), [world.memberA.id]);

    const status = await as(app, world.memberA)
      .patch(`/api/reconstruction/${own}/status`)
      .send({ status: "approved" });
    assert.equal(status.status, 200);
    assert.equal((await itemSnapshot(own))?.status, "approved");

    const del = await as(app, world.memberA).delete(`/api/reconstruction/${own}`);
    assert.equal(del.status, 200);
    assert.equal(await itemSnapshot(own), null);
  });
});

// Odkaz a náhled rekonstrukce jen http(s) (#482): `javascript:` nebo `data:` v href/src by spustil skript
// nebo vložil obsah u každého, kdo kartu otevře.
describe("reconstruction: link and thumbnail accept only http(s) URLs", () => {
  const unsafe = ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==", "vbscript:msgbox(1)", "file:///etc/passwd"];

  for (const field of ["link", "thumbnail"] as const) {
    for (const value of unsafe) {
      test(`POST with ${field} = ${value.slice(0, 20)}… → 400 and nothing is created`, async () => {
        const countBefore = await prisma.reconstructionItem.count();
        const res = await as(app, world.memberA)
          .post("/api/reconstruction")
          .send({ category: "idea", title: "Zlý odkaz", [field]: value });
        assert.equal(res.status, 400);
        assert.equal(await prisma.reconstructionItem.count(), countBefore);
      });

      test(`PUT with ${field} = ${value.slice(0, 20)}… → 400 and the item is unchanged`, async () => {
        const own = await createItem(world.memberA, "Nápad k úpravě");
        const before = await itemSnapshot(own);
        const res = await as(app, world.memberA)
          .put(`/api/reconstruction/${own}`)
          .send({ category: "idea", title: "Zlý odkaz", [field]: value });
        assert.equal(res.status, 400);
        assert.deepEqual(await itemSnapshot(own), before);
      });
    }
  }

  test("POST and PUT with https link and thumbnail pass", async () => {
    const link = "https://example.com/kamna";
    const thumbnail = "http://example.com/kamna.jpg";
    const created = await as(app, world.memberA)
      .post("/api/reconstruction")
      .send({ category: "idea", title: "Kamna", link, thumbnail });
    assert.equal(created.status, 201);
    const stored = await itemSnapshot(created.body.id);
    assert.equal(stored?.link, link);
    assert.equal(stored?.thumbnail, thumbnail);

    const edited = await as(app, world.memberA)
      .put(`/api/reconstruction/${created.body.id}`)
      .send({ category: "idea", title: "Kamna", link: "https://example.com/jina", thumbnail: "https://example.com/jina.jpg" });
    assert.equal(edited.status, 200);
    assert.equal((await itemSnapshot(created.body.id))?.thumbnail, "https://example.com/jina.jpg");
  });

  test("empty link and thumbnail (cleared form fields) still pass", async () => {
    const created = await as(app, world.memberA)
      .post("/api/reconstruction")
      .send({ category: "idea", title: "Bez odkazu", link: "", thumbnail: "" });
    assert.equal(created.status, 201);

    const edited = await as(app, world.memberA)
      .put(`/api/reconstruction/${created.body.id}`)
      .send({ category: "idea", title: "Bez odkazu", link: null, thumbnail: null });
    assert.equal(edited.status, 200);
  });
});
