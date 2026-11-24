import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { as, recordRealtimeEmits, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";

let app: Express;
let world: TestWorld;
let noteA: string;
let threadB: string;
let noteB: string;
let threadNoteB: string;
let reservationA: string;
let reservationB: string;
let guestA: TestUser;
/** Every cabin B fixture name/content starts with this, so any leak shows up in a body search. */
const CABIN_B_PREFIX = "Tajn";

type Call = (user: TestUser) => Promise<{ status: number }>;

async function createNote(
  author: TestUser,
  message: string,
  opts: { threadId?: string | null; isPinned?: boolean } = {},
): Promise<string> {
  const note = await prisma.note.create({
    data: {
      userId: author.id,
      cabinId: author.cabinId,
      threadId: opts.threadId ?? null,
      message,
      isPinned: opts.isPinned ?? false,
    },
  });
  return note.id;
}

async function createThread(author: TestUser, name: string): Promise<string> {
  const thread = await prisma.noteThread.create({
    data: { name, createdById: author.id, cabinId: author.cabinId },
  });
  return thread.id;
}

async function createReservation(owner: TestUser, from: string, checkout: boolean): Promise<string> {
  const reservation = await prisma.reservation.create({
    data: {
      userId: owner.id,
      cabinId: owner.cabinId,
      dateFrom: new Date(from),
      dateTo: new Date(new Date(from).getTime() + 2 * 86_400_000),
      purpose: `Pobyt ${owner.username}`,
      ...(checkout
        ? {
            isCheckoutCompleted: true,
            checkoutCompletedBy: owner.id,
            checkoutCompletedAt: new Date(from),
            checkoutState: { note: "Tajný stav chaty B" },
            checkoutStateAt: new Date(from),
          }
        : {}),
    },
  });
  return reservation.id;
}

const noteSnapshot = (id: string) =>
  prisma.note.findUnique({ where: { id }, include: { reactions: { orderBy: { id: "asc" } } } });
const threadSnapshot = (id: string) => prisma.noteThread.findUnique({ where: { id } });
const checkoutSnapshot = (id: string) =>
  prisma.reservation.findUnique({
    where: { id },
    select: {
      isCheckoutCompleted: true,
      checkoutCompletedBy: true,
      checkoutCompletedAt: true,
      checkoutState: true,
      checkoutStateAt: true,
    },
  });

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  noteA = await createNote(world.memberA, "Poznámka A");
  threadB = await createThread(world.memberB, "Tajné vlákno B");
  noteB = await createNote(world.memberB, "Tajná poznámka B");
  threadNoteB = await createNote(world.memberB, "Tajná poznámka ve vlákně B", { threadId: threadB });
  reservationA = await createReservation(world.memberA, "2027-01-10", false);
  reservationB = await createReservation(world.memberB, "2027-01-10", true);
  const guest = await prisma.user.create({
    data: { username: "host-a", passwordHash: "x", color: "#123456", role: "guest", cabinId: world.cabinA.id },
  });
  guestA = { id: guest.id, username: guest.username, role: "guest", cabinId: world.cabinA.id };
});

after(teardownIntegrationFile);

for (const actor of ["memberA", "adminA"] as const) {
  describe(`notes: ${actor} on a cabin B note gets 404 and the note is unchanged`, () => {
    const cases: [string, Call][] = [
      ["PATCH /notes/:id (edit)", (u) => as(app, u).patch(`/api/notes/${noteB}`).send({ message: "Přepsáno" })],
      ["PATCH /notes/:id/resolve", (u) => as(app, u).patch(`/api/notes/${noteB}/resolve`)],
      ["PATCH /notes/:id/pin", (u) => as(app, u).patch(`/api/notes/${noteB}/pin`)],
      ["POST /notes/:id/reactions", (u) => as(app, u).post(`/api/notes/${noteB}/reactions`).send({ emoji: "👍" })],
      ["DELETE /notes/:id", (u) => as(app, u).delete(`/api/notes/${noteB}`)],
    ];

    for (const [name, call] of cases) {
      test(name, async () => {
        const before = await noteSnapshot(noteB);
        const res = await call(world[actor]);
        assert.equal(res.status, 404);
        assert.deepEqual(await noteSnapshot(noteB), before);
      });
    }
  });
}

describe("notes: replying across cabins is rejected", () => {
  test("POST /notes in A with a cabin B replyToId → 404, nothing created", async () => {
    const countBefore = await prisma.note.count();
    const res = await as(app, world.memberA).post("/api/notes").send({ message: "Odpověď", replyToId: noteB });
    assert.equal(res.status, 404);
    assert.equal(await prisma.note.count(), countBefore);
  });
});

describe("note-threads: a cabin A user on a cabin B thread gets 404 and the thread is unchanged", () => {
  for (const actor of ["memberA", "adminA"] as const) {
    test(`DELETE /note-threads/:id (${actor})`, async () => {
      const before = await threadSnapshot(threadB);
      const res = await as(app, world[actor]).delete(`/api/note-threads/${threadB}`);
      assert.equal(res.status, 404);
      assert.deepEqual(await threadSnapshot(threadB), before);
    });
  }
});

describe("handover: a cabin A user on a cabin B checkout gets 404 and nothing changes", () => {
  for (const actor of ["memberA", "adminA"] as const) {
    test(`GET /reservations/:id/checkout (${actor})`, async () => {
      const before = await checkoutSnapshot(reservationB);
      const res = await as(app, world[actor]).get(`/api/reservations/${reservationB}/checkout`);
      assert.equal(res.status, 404);
      assert.deepEqual(await checkoutSnapshot(reservationB), before);
    });

    test(`PATCH /reservations/:id/checkout (${actor})`, async () => {
      const before = await checkoutSnapshot(reservationB);
      const res = await as(app, world[actor])
        .patch(`/api/reservations/${reservationB}/checkout`)
        .send({ checkoutState: { note: "Podstrčený stav" } });
      assert.equal(res.status, 404);
      assert.deepEqual(await checkoutSnapshot(reservationB), before);
    });
  }
});

describe("notes: lists for cabin A contain nothing from cabin B", () => {
  const leaks = () => [
    threadB, noteB, threadNoteB, world.memberB.id, world.adminB.id,
    world.memberB.username, world.adminB.username, CABIN_B_PREFIX,
  ];

  for (const path of ["/api/notes", "/api/notes?threadId=all", `/api/notes?threadId=${threadB}`, "/api/note-threads"]) {
    test(`GET ${path}`, async () => {
      const res = await as(app, world.memberA).get(path);
      assert.equal(res.status, 200);
      const body = JSON.stringify(res.body);
      for (const leak of leaks()) assert.equal(body.includes(leak), false, `leaked ${leak}`);
    });
  }

  test("GET /api/notes returns cabin A's own note", async () => {
    const res = await as(app, world.memberA).get("/api/notes?threadId=all");
    assert.deepEqual(res.body.map((n: { id: string }) => n.id), [noteA]);
  });

  test("GET /api/note-threads counts only cabin A's notes in the main thread", async () => {
    // Cabin B also has a main-thread note (noteB); the count must not include it.
    const expected = await prisma.note.count({ where: { cabinId: world.cabinA.id, threadId: null } });
    assert.ok(expected >= 1);
    const res = await as(app, world.memberA).get("/api/note-threads");
    assert.equal(res.status, 200);
    const main = res.body.find((t: { id: string | null }) => t.id === null);
    assert.equal(main.messageCount, expected);
  });

  test(`GET /api/notes?threadId=${"<B thread>"} returns an empty list for cabin A`, async () => {
    const res = await as(app, world.memberA).get(`/api/notes?threadId=${threadB}`);
    assert.deepEqual(res.body, []);
  });
});

describe("notes: same-cabin flows still work (positive control)", () => {
  test("POST /notes in A → 201 and realtime goes only to cabin A's room", async () => {
    const recorder = recordRealtimeEmits();
    try {
      const res = await as(app, world.memberA).post("/api/notes").send({ message: "Nová poznámka A" });
      assert.equal(res.status, 201);
      assert.ok(recorder.emits.some((e) => e.event === "note:created"));
      assert.deepEqual([...new Set(recorder.emits.map((e) => e.room))], [`cabin:${world.cabinA.id}`]);
    } finally {
      recorder.restore();
    }
  });

  test("guest A cannot pin or resolve a cabin A note (403 stays inside the cabin)", async () => {
    const pin = await as(app, guestA).patch(`/api/notes/${noteA}/pin`);
    assert.equal(pin.status, 403);
    const resolve = await as(app, guestA).patch(`/api/notes/${noteA}/resolve`);
    assert.equal(resolve.status, 403);
    assert.equal((await noteSnapshot(noteA))?.isPinned, false);
  });

  test("member A can edit their own cabin A note within the time limit", async () => {
    const own = await createNote(world.memberA, "Původní text A");
    const res = await as(app, world.memberA).patch(`/api/notes/${own}`).send({ message: "Upravený text A" });
    assert.equal(res.status, 200);
    assert.equal((await noteSnapshot(own))?.message, "Upravený text A");
  });

  test("member A completes the departure checklist on a cabin A reservation (GET + PATCH)", async () => {
    const get = await as(app, world.memberA).get(`/api/reservations/${reservationA}/checkout`);
    assert.equal(get.status, 200);
    assert.equal(get.body.isCheckoutCompleted, false);
    const patch = await as(app, world.memberA)
      .patch(`/api/reservations/${reservationA}/checkout`)
      .send({ checkoutState: { gas: "full" } });
    assert.equal(patch.status, 200);
    assert.equal((await checkoutSnapshot(reservationA))?.isCheckoutCompleted, true);
  });
});
