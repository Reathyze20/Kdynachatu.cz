import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { as, recordRealtimeEmits, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";

let app: Express;
let world: TestWorld;
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
  ({ app, world } = await setupIntegrationFile());
  reservationA = await createReservation(world.memberA, "2027-01-10");
  reservationB = await createReservation(world.memberB, "2027-01-10", [world.adminB]);
  await prisma.userAvailability.create({
    data: { userId: world.memberB.id, cabinId: world.cabinB.id, startDate: new Date("2027-02-01"), endDate: new Date("2027-02-03") },
  });
});

after(teardownIntegrationFile);

describe("reservations: list is scoped to the caller's cabin", () => {
  test("cabin A list contains no reservation, participant or availability from cabin B", async () => {
    const res = await as(app, world.memberA).get("/api/reservations");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.reservations.map((r: { id: string }) => r.id), [reservationA]);
    const body = JSON.stringify(res.body);
    for (const leak of [reservationB, world.memberB.id, world.adminB.id, world.memberB.username, world.adminB.username]) {
      assert.equal(body.includes(leak), false, `leaked ${leak}`);
    }
  });
});

for (const actor of ["memberA", "adminA"] as const) {
  describe(`reservations: ${actor} on a cabin B reservation gets 404 and B is unchanged`, () => {
    const cases: [string, (user: TestUser) => Promise<{ status: number }>][] = [
      ["PUT /:id", (u) => as(app, u).put(`/api/reservations/${reservationB}`).send({ purpose: "Převzato", status: "backup" })],
      ["POST /delete", (u) => as(app, u).post("/api/reservations/delete").send({ id: reservationB })],
      ["DELETE /:id", (u) => as(app, u).delete(`/api/reservations/${reservationB}`)],
      ["GET /:id/watch", (u) => as(app, u).get(`/api/reservations/${reservationB}/watch`)],
      ["POST /:id/watch", (u) => as(app, u).post(`/api/reservations/${reservationB}/watch`)],
      ["DELETE /:id/watch", (u) => as(app, u).delete(`/api/reservations/${reservationB}/watch`)],
      ["POST /:id/assign", (u) => as(app, u).post(`/api/reservations/${reservationB}/assign`).send({ newOwnerId: u.id })],
    ];

    for (const [name, call] of cases) {
      test(name, async () => {
        const before = await snapshot(reservationB);
        const res = await call(world[actor]);
        assert.equal(res.status, 404);
        assert.deepEqual(await snapshot(reservationB), before);
      });
    }
  });
}

describe("reservations: participants from cabin B are rejected", () => {
  test("create in A with a cabin B participant → 404, nothing created", async () => {
    const countBefore = await prisma.reservation.count();
    const res = await as(app, world.memberA).post("/api/reservations")
      .send({ from: "2027-03-01", to: "2027-03-03", purpose: "S cizincem", participantIds: [world.memberB.id] });
    assert.equal(res.status, 404);
    assert.equal(await prisma.reservation.count(), countBefore);
  });

  test("update in A with a cabin B participant → 404, reservation unchanged", async () => {
    const before = await snapshot(reservationA);
    const res = await as(app, world.memberA).put(`/api/reservations/${reservationA}`)
      .send({ purpose: "Změna", participantIds: [world.memberB.id] });
    assert.equal(res.status, 404);
    assert.deepEqual(await snapshot(reservationA), before);
  });

  test("admin A cannot assign a cabin A reservation to a cabin B user (404)", async () => {
    const res = await as(app, world.adminA).post(`/api/reservations/${reservationA}/assign`).send({ newOwnerId: world.memberB.id });
    assert.equal(res.status, 404);
    assert.equal((await snapshot(reservationA))?.userId, world.memberA.id);
  });
});

describe("reservations: same-cabin flows still work (positive control)", () => {
  test("editing with a participant who has since left the cabin → 200, that participant is dropped (as before)", async () => {
    const former = await prisma.user.create({
      data: { username: "byvaly-clen-a", passwordHash: "x", color: "#123456", cabinId: world.cabinA.id },
    });
    const formerUser = { id: former.id, username: former.username, role: "user", cabinId: world.cabinA.id };
    const id = await createReservation(world.adminA, "2027-05-01", [formerUser, world.memberA]);
    await prisma.user.update({ where: { id: former.id }, data: { cabinId: null } });

    const res = await as(app, world.adminA).put(`/api/reservations/${id}`)
      .send({ purpose: "Upraveno", participantIds: [former.id, world.memberA.id] });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.participants.map((p: { userId: string }) => p.userId), [world.memberA.id]);
  });

  test("assign without a valid newOwnerId → 400, owner unchanged", async () => {
    const id = await createReservation(world.memberA, "2027-06-01");
    const res = await as(app, world.adminA).post(`/api/reservations/${id}/assign`).send({});
    assert.equal(res.status, 400);
    assert.equal((await snapshot(id))?.userId, world.memberA.id);
  });

  test("create in A with a cabin A participant → 201 and realtime goes only to cabin A's room", async () => {
    const recorder = recordRealtimeEmits();
    try {
      const res = await as(app, world.adminA).post("/api/reservations")
        .send({ from: "2027-04-01", to: "2027-04-03", purpose: "Rodinný pobyt", participantIds: [world.memberA.id] });
      assert.equal(res.status, 201);
      assert.deepEqual(res.body.participants.map((p: { userId: string }) => p.userId), [world.memberA.id]);
      assert.ok(recorder.emits.some((e) => e.event === "reservation:created"));
      assert.deepEqual([...new Set(recorder.emits.map((e) => e.room))], [`cabin:${world.cabinA.id}`]);
    } finally {
      recorder.restore();
    }
  });

  test("DELETE /:id: member cannot delete someone else's stay (403), owner can (200, same realtime event as POST /delete)", async () => {
    const id = await createReservation(world.adminA, "2027-07-01");
    const denied = await as(app, world.memberA).delete(`/api/reservations/${id}`);
    assert.equal(denied.status, 403);
    assert.ok(await snapshot(id));

    const recorder = recordRealtimeEmits();
    try {
      const res = await as(app, world.adminA).delete(`/api/reservations/${id}`);
      assert.equal(res.status, 200);
      assert.equal(await snapshot(id), null);
      const deleted = recorder.emits.filter((e) => e.event === "reservation:deleted");
      assert.deepEqual(deleted.map((e) => e.room), [`cabin:${world.cabinA.id}`]);
    } finally {
      recorder.restore();
    }
  });

  test("member A cannot assign (403 stays inside the cabin), admin A can", async () => {
    const denied = await as(app, world.memberA).post(`/api/reservations/${reservationA}/assign`).send({ newOwnerId: world.adminA.id });
    assert.equal(denied.status, 403);
    const ok = await as(app, world.adminA).post(`/api/reservations/${reservationA}/assign`).send({ newOwnerId: world.adminA.id });
    assert.equal(ok.status, 200);
  });
});

describe("reservations: tentative type (status) on create and edit", () => {
  const listIds = async (user: TestUser) =>
    (await as(app, user).get("/api/reservations")).body.reservations as { id: string; status: string }[];

  test("create with status soft and no collision → 201 soft, listed as soft in A and absent from B", async () => {
    const res = await as(app, world.memberA).post("/api/reservations")
      .send({ from: "2027-08-02", to: "2027-08-04", purpose: "Možná víkend", status: "soft" });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, "soft");

    const listedA = (await listIds(world.memberA)).find((r) => r.id === res.body.id);
    assert.equal(listedA?.status, "soft");
    assert.equal((await listIds(world.memberB)).some((r) => r.id === res.body.id), false);
  });

  for (const status of ["soft", "primary"] as const) {
    test(`create with status ${status} over a primary stay → 201 backup`, async () => {
      // reservationA (memberA, primary) covers 2027-01-10 – 2027-01-12
      const res = await as(app, world.adminA).post("/api/reservations")
        .send({ from: "2027-01-11", to: "2027-01-13", purpose: "Taky bych jel", status });
      assert.equal(res.status, 201);
      assert.equal(res.body.status, "backup");
    });
  }

  for (const status of ["backup", "xyz"]) {
    test(`create with status ${status} → 400 validation error, nothing created`, async () => {
      const countBefore = await prisma.reservation.count();
      const res = await as(app, world.memberA).post("/api/reservations")
        .send({ from: "2027-08-20", to: "2027-08-22", purpose: "Neplatný typ", status });
      assert.equal(res.status, 400);
      assert.equal(res.body.message, "Chyba validace");
      assert.ok(res.body.errors.some((e: { path: string }) => e.path === "status"));
      assert.equal(await prisma.reservation.count(), countBefore);
    });
  }

  test("PUT soft → primary without a collision → 200 primary", async () => {
    const created = await as(app, world.memberA).post("/api/reservations")
      .send({ from: "2027-09-06", to: "2027-09-08", purpose: "Zatím předběžně", status: "soft" });
    assert.equal(created.body.status, "soft");

    const res = await as(app, world.memberA).put(`/api/reservations/${created.body.id}`).send({ status: "primary" });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "primary");
    assert.equal((await listIds(world.memberA)).find((r) => r.id === created.body.id)?.status, "primary");
  });

  test("PUT soft → primary over another primary stay → 409, reservation unchanged", async () => {
    const created = await as(app, world.adminA).post("/api/reservations")
      .send({ from: "2027-10-04", to: "2027-10-06", purpose: "Předběžně", status: "soft" });
    await createReservation(world.memberA, "2027-10-05");
    const before = await snapshot(created.body.id);

    const res = await as(app, world.adminA).put(`/api/reservations/${created.body.id}`).send({ status: "primary" });
    assert.equal(res.status, 409);
    assert.equal(typeof res.body.message, "string");
    assert.deepEqual(await snapshot(created.body.id), before);
    assert.equal(before?.status, "soft");
  });
});
