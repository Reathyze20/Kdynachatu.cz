import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { as, recordRealtimeEmits, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";

let app: Express;
let w: TestWorld;
let reservationA: string;
let reservationB: string;

async function createReservation(owner: TestUser, from: string, participants: TestUser[] = []): Promise<string> {
  const reservation = await prisma.reservation.create({
    data: {
      userId: owner.id,
      cabinId: owner.cabinId,
      dateFrom: new Date(from),
      dateTo: new Date(new Date(from).getTime() + 2 * 86_400_000),
      purpose: `Pobyt ${owner.username}`,
      participants: { create: participants.map((p) => ({ userId: p.id })) },
    },
  });
  return reservation.id;
}

const snapshot = (id: string) =>
  prisma.reservation.findUnique({ where: { id }, include: { participants: true, watchers: true } });

before(async () => {
  ({ app, world: w } = await setupIntegrationFile());
  reservationA = await createReservation(w.memberA, "2027-01-10");
  reservationB = await createReservation(w.memberB, "2027-01-10", [w.adminB]);
  await prisma.userAvailability.create({
    data: { userId: w.memberB.id, cabinId: w.cabinB.id, startDate: new Date("2027-02-01"), endDate: new Date("2027-02-03") },
  });
});

after(teardownIntegrationFile);

describe("reservations: list is scoped to the caller's cabin", () => {
  test("cabin A list contains no reservation, participant or availability from cabin B", async () => {
    const res = await as(app, w.memberA).get("/api/reservations");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.reservations.map((r: { id: string }) => r.id), [reservationA]);
    const body = JSON.stringify(res.body);
    for (const leak of [reservationB, w.memberB.id, w.adminB.id, w.memberB.username, w.adminB.username]) {
      assert.equal(body.includes(leak), false, `leaked ${leak}`);
    }
  });
});

for (const actor of ["memberA", "adminA"] as const) {
  describe(`reservations: ${actor} on a cabin B reservation gets 404 and B is unchanged`, () => {
    const cases: [string, (user: TestUser) => Promise<{ status: number }>][] = [
      ["PUT /:id", (u) => as(app, u).put(`/api/reservations/${reservationB}`).send({ purpose: "Převzato", status: "backup" })],
      ["POST /delete", (u) => as(app, u).post("/api/reservations/delete").send({ id: reservationB })],
      ["GET /:id/watch", (u) => as(app, u).get(`/api/reservations/${reservationB}/watch`)],
      ["POST /:id/watch", (u) => as(app, u).post(`/api/reservations/${reservationB}/watch`)],
      ["DELETE /:id/watch", (u) => as(app, u).delete(`/api/reservations/${reservationB}/watch`)],
      ["POST /:id/assign", (u) => as(app, u).post(`/api/reservations/${reservationB}/assign`).send({ newOwnerId: u.id })],
    ];

    for (const [name, call] of cases) {
      test(name, async () => {
        const before = await snapshot(reservationB);
        const res = await call(w[actor]);
        assert.equal(res.status, 404);
        assert.deepEqual(await snapshot(reservationB), before);
      });
    }
  });
}

describe("reservations: participants from cabin B are rejected", () => {
  test("create in A with a cabin B participant → 404, nothing created", async () => {
    const countBefore = await prisma.reservation.count();
    const res = await as(app, w.memberA).post("/api/reservations")
      .send({ from: "2027-03-01", to: "2027-03-03", purpose: "S cizincem", participantIds: [w.memberB.id] });
    assert.equal(res.status, 404);
    assert.equal(await prisma.reservation.count(), countBefore);
  });

  test("update in A with a cabin B participant → 404, reservation unchanged", async () => {
    const before = await snapshot(reservationA);
    const res = await as(app, w.memberA).put(`/api/reservations/${reservationA}`)
      .send({ purpose: "Změna", participantIds: [w.memberB.id] });
    assert.equal(res.status, 404);
    assert.deepEqual(await snapshot(reservationA), before);
  });

  test("admin A cannot assign a cabin A reservation to a cabin B user (404)", async () => {
    const res = await as(app, w.adminA).post(`/api/reservations/${reservationA}/assign`).send({ newOwnerId: w.memberB.id });
    assert.equal(res.status, 404);
    assert.equal((await snapshot(reservationA))?.userId, w.memberA.id);
  });
});

describe("reservations: same-cabin flows still work (positive control)", () => {
  test("create in A with a cabin A participant → 201 and realtime goes only to cabin A's room", async () => {
    const recorder = recordRealtimeEmits();
    try {
      const res = await as(app, w.adminA).post("/api/reservations")
        .send({ from: "2027-04-01", to: "2027-04-03", purpose: "Rodinný pobyt", participantIds: [w.memberA.id] });
      assert.equal(res.status, 201);
      assert.deepEqual(res.body.participants.map((p: { userId: string }) => p.userId), [w.memberA.id]);
      assert.ok(recorder.emits.some((e) => e.event === "reservation:created"));
      assert.deepEqual([...new Set(recorder.emits.map((e) => e.room))], [`cabin:${w.cabinA.id}`]);
    } finally {
      recorder.restore();
    }
  });

  test("member A cannot assign (403 stays inside the cabin), admin A can", async () => {
    const denied = await as(app, w.memberA).post(`/api/reservations/${reservationA}/assign`).send({ newOwnerId: w.adminA.id });
    assert.equal(denied.status, 403);
    const ok = await as(app, w.adminA).post(`/api/reservations/${reservationA}/assign`).send({ newOwnerId: w.adminA.id });
    assert.equal(ok.status, 200);
  });
});
