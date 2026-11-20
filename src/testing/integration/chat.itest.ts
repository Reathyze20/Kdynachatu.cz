import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { as, recordRealtimeEmits, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";

let app: Express;
let world: TestWorld;
let channelA: string;
let channelB: string;
let mainMessageA: string;
let mainMessageB: string;
let channelMessageB: string;
let guestA: TestUser;
/** Every cabin B fixture name/content starts with this, so any leak shows up in a body search. */
const CABIN_B_PREFIX = "Tajn";

type Call = (user: TestUser) => Promise<{ status: number }>;

async function createChannel(author: TestUser, name: string): Promise<string> {
  const thread = await prisma.noteThread.create({
    data: { name, createdById: author.id, cabinId: author.cabinId },
  });
  return thread.id;
}

async function createMessage(
  author: TestUser,
  message: string,
  opts: { threadId?: string | null } = {},
): Promise<string> {
  const note = await prisma.note.create({
    data: {
      userId: author.id,
      cabinId: author.cabinId,
      threadId: opts.threadId ?? null,
      message,
    },
  });
  return note.id;
}

const channelSnapshot = (id: string) => prisma.noteThread.findUnique({ where: { id } });
const messageSnapshot = (id: string) =>
  prisma.note.findUnique({ where: { id }, include: { reactions: { orderBy: { id: "asc" } } } });

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  channelA = await createChannel(world.memberA, "Kanál A");
  channelB = await createChannel(world.memberB, "Tajný kanál B");
  mainMessageA = await createMessage(world.memberA, "Zpráva A v hlavním");
  mainMessageB = await createMessage(world.memberB, "Tajná zpráva B v hlavním");
  channelMessageB = await createMessage(world.memberB, "Tajná zpráva B v kanálu", { threadId: channelB });
  const guest = await prisma.user.create({
    data: { username: "host-a", passwordHash: "x", color: "#123456", role: "guest", cabinId: world.cabinA.id },
  });
  guestA = { id: guest.id, username: guest.username, role: "guest", cabinId: world.cabinA.id };
});

after(teardownIntegrationFile);

// ---------------------------------------------------------------------------
//  Channels: a cabin A user on a cabin B channel gets 404 and nothing changes
// ---------------------------------------------------------------------------
for (const actor of ["memberA", "adminA"] as const) {
  describe(`channels: ${actor} on a cabin B channel gets 404 and the channel is unchanged`, () => {
    test("DELETE /api/channels/:id", async () => {
      const before = await channelSnapshot(channelB);
      const res = await as(app, world[actor]).delete(`/api/channels/${channelB}`);
      assert.equal(res.status, 404);
      assert.deepEqual(await channelSnapshot(channelB), before);
    });

    test("GET /api/channels/:channelId/messages", async () => {
      const res = await as(app, world[actor]).get(`/api/channels/${channelB}/messages`);
      assert.equal(res.status, 404);
    });

    test("POST /api/channels/:channelId/read", async () => {
      const countBefore = await prisma.threadReadStatus.count();
      const res = await as(app, world[actor]).post(`/api/channels/${channelB}/read`);
      assert.equal(res.status, 404);
      assert.equal(await prisma.threadReadStatus.count(), countBefore);
    });
  });
}

// ---------------------------------------------------------------------------
//  Messages: a cabin A user on a cabin B message gets 404 and nothing changes
// ---------------------------------------------------------------------------
for (const actor of ["memberA", "adminA"] as const) {
  describe(`messages: ${actor} on a cabin B message gets 404 and the message is unchanged`, () => {
    const cases: [string, Call][] = [
      ["PATCH /api/messages/:id (edit)", (u) => as(app, u).patch(`/api/messages/${mainMessageB}`).send({ message: "Přepsáno" })],
      ["DELETE /api/messages/:id", (u) => as(app, u).delete(`/api/messages/${mainMessageB}`)],
      ["PATCH /api/messages/:id/pin", (u) => as(app, u).patch(`/api/messages/${mainMessageB}/pin`)],
      ["PATCH /api/messages/:id/resolve", (u) => as(app, u).patch(`/api/messages/${mainMessageB}/resolve`)],
      ["POST /api/messages/:id/reactions", (u) => as(app, u).post(`/api/messages/${mainMessageB}/reactions`).send({ emoji: "👍" })],
    ];

    for (const [name, call] of cases) {
      test(name, async () => {
        const before = await messageSnapshot(mainMessageB);
        const res = await call(world[actor]);
        assert.equal(res.status, 404);
        assert.deepEqual(await messageSnapshot(mainMessageB), before);
      });
    }
  });
}

// ---------------------------------------------------------------------------
//  FIX (#64, bod 5): posting into a cabin B channel must be 404, not 403
// ---------------------------------------------------------------------------
describe("messages: posting into a cabin B channel is rejected with 404", () => {
  test("POST /api/channels/:channelId/messages into cabin B channel → 404, nothing created", async () => {
    const countBefore = await prisma.note.count();
    const res = await as(app, world.memberA)
      .post(`/api/channels/${channelB}/messages`)
      .send({ message: "Vetřelecká zpráva" });
    assert.equal(res.status, 404);
    assert.equal(await prisma.note.count(), countBefore);
  });

  test("POST /api/channels/:channelId/messages with a cabin B replyToId → 404, nothing created", async () => {
    const countBefore = await prisma.note.count();
    const res = await as(app, world.memberA)
      .post(`/api/channels/${channelA}/messages`)
      .send({ message: "Odpověď", replyToId: mainMessageB });
    assert.equal(res.status, 404);
    assert.equal(await prisma.note.count(), countBefore);
  });
});

// ---------------------------------------------------------------------------
//  Lists for cabin A contain nothing from cabin B
// ---------------------------------------------------------------------------
describe("chat: lists for cabin A contain nothing from cabin B", () => {
  const leaks = () => [
    channelB, mainMessageB, channelMessageB, world.memberB.id, world.adminB.id,
    world.memberB.username, world.adminB.username, CABIN_B_PREFIX,
  ];

  for (const path of ["/api/channels", "/api/channels/messages"]) {
    test(`GET ${path}`, async () => {
      const res = await as(app, world.memberA).get(path);
      assert.equal(res.status, 200);
      const body = JSON.stringify(res.body);
      for (const leak of leaks()) assert.equal(body.includes(leak), false, `leaked ${leak}`);
    });
  }

  test("GET /api/channels lists cabin A's own channel", async () => {
    const res = await as(app, world.memberA).get("/api/channels");
    const ids = res.body.map((c: { id: string | null }) => c.id);
    assert.ok(ids.includes(channelA));
    assert.equal(ids.includes(channelB), false);
  });
});

// ---------------------------------------------------------------------------
//  Same-cabin flows still work (positive control) — 403 stays inside the cabin
// ---------------------------------------------------------------------------
describe("chat: same-cabin flows still work (positive control)", () => {
  test("POST /api/channels/:channelId/messages in A → 201 and realtime goes only to cabin A's room", async () => {
    const recorder = recordRealtimeEmits();
    try {
      const res = await as(app, world.memberA)
        .post(`/api/channels/${channelA}/messages`)
        .send({ message: "Nová zpráva A" });
      assert.equal(res.status, 201);
      assert.ok(recorder.emits.some((e) => e.event === "message:created"));
      assert.deepEqual([...new Set(recorder.emits.map((e) => e.room))], [`cabin:${world.cabinA.id}`]);
    } finally {
      recorder.restore();
    }
  });

  test("guest A cannot post into a cabin A channel (403 stays inside the cabin)", async () => {
    const countBefore = await prisma.note.count();
    const res = await as(app, guestA)
      .post(`/api/channels/${channelA}/messages`)
      .send({ message: "Zpráva hosta" });
    assert.equal(res.status, 403);
    assert.equal(await prisma.note.count(), countBefore);
  });

  test("member A can edit their own cabin A message within the time limit", async () => {
    const own = await createMessage(world.memberA, "Původní text A");
    const res = await as(app, world.memberA).patch(`/api/messages/${own}`).send({ message: "Upravený text A" });
    assert.equal(res.status, 200);
    assert.equal((await messageSnapshot(own))?.message, "Upravený text A");
  });
});
