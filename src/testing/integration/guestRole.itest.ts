import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { calendarTodayIso } from "../../backend/routes/reservationHelpers";
import { addGuests, as, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorldWithGuests } from "./harness";

// Host mimo whitelist dostane 403 (#484, hlídá matice rolí); tady je jeho whitelist: jen vlastní pobyty.

let app: Express;
let world: TestWorldWithGuests;
let todayIso: string;
let memberActive: string;
let memberUpcoming: string;
let guestStay: string;

const DAY_MS = 86_400_000;
const isoDay = (offset: number) => new Date(new Date(todayIso).getTime() + offset * DAY_MS).toISOString().slice(0, 10);
const createReservation = async (owner: TestUser, from: number, to: number) =>
  (await prisma.reservation.create({
    data: { userId: owner.id, cabinId: owner.cabinId, dateFrom: new Date(isoDay(from)), dateTo: new Date(isoDay(to)), purpose: `Pobyt ${owner.username}`, status: "primary" },
  })).id;

before(async () => {
  const setup = await setupIntegrationFile();
  app = setup.app;
  world = await addGuests(setup.world);
  todayIso = calendarTodayIso(new Date());
  const { memberA, guestA } = world;
  memberActive = await createReservation(memberA, -1, 1);
  memberUpcoming = await createReservation(memberA, 10, 12);
  guestStay = await createReservation(guestA, 35, 37); // vždy v jiném měsíci než dnešek
  await createReservation(memberA, -10, -8); // poslední ukončený pobyt patří členovi
  await prisma.userAvailability.create({ data: { cabinId: memberA.cabinId, userId: memberA.id, startDate: new Date(isoDay(30)), endDate: new Date(isoDay(31)) } });
});

after(teardownIntegrationFile);

describe("guest role: deny by default", () => {
  test("a guest cannot write a note and nothing is stored", async () => {
    const before = await prisma.note.count();
    const res = await as(app, world.guestA).post("/api/notes").send({ message: "Poznámka hosta" });
    assert.equal(res.status, 403);
    assert.equal(await prisma.note.count(), before);
  });

  test("the dashboard does not give a guest shopping or notes of the cabin", async () => {
    assert.equal((await as(app, world.guestA).get("/api/dashboard/shopping")).status, 403);
    assert.equal((await as(app, world.guestA).get("/api/dashboard/notes")).status, 403);
  });

  test("the dashboard shows a guest only their own stay, no reservations of others", async () => {
    const res = await as(app, world.guestA).get("/api/dashboard/reservations");
    assert.equal(res.body.activeReservation, null);
    assert.deepEqual(res.body.upcomingReservations.map((r: { id: string }) => r.id), [guestStay]);
    assert.equal(res.body.lastStay, null);
    assert.equal(res.body.lastFault, null);
    assert.equal(res.body.nextFreeWeekend, null);
    assert.equal(res.body.stats.totalStaysThisMonth, 0);
    assert.doesNotMatch(JSON.stringify(res.body), new RegExp(world.memberA.username));
  });

  test("a guest lists only their own reservations and availabilities", async () => {
    const res = await as(app, world.guestA).get("/api/reservations");
    assert.deepEqual(res.body.reservations.map((r: { id: string }) => r.id), [guestStay]);
    assert.deepEqual(res.body.availabilities, []);
  });

  test("a guest creates, edits and cancels their own reservation", async () => {
    const created = await as(app, world.guestA).post("/api/reservations").send({ from: isoDay(50), to: isoDay(52), purpose: "Víkend hosta" });
    assert.equal(created.status, 201);
    assert.equal(created.body.userId, world.guestA.id);
    const edited = await as(app, world.guestA).put(`/api/reservations/${created.body.id}`).send({ purpose: "Prodloužený víkend" });
    assert.equal(edited.status, 200);
    const cancelled = await as(app, world.guestA).delete(`/api/reservations/${created.body.id}`);
    assert.equal(cancelled.status, 200);
    assert.equal(await prisma.reservation.count({ where: { id: created.body.id } }), 0);
    const legacy = await as(app, world.guestA).post("/api/reservations").send({ from: isoDay(54), to: isoDay(55), purpose: "Druhý víkend" });
    assert.equal((await as(app, world.guestA).post("/api/reservations/delete").send({ id: legacy.body.id })).status, 200);
  });

  test("a guest cannot add members as co-occupants", async () => {
    const before = await prisma.reservation.count();
    const res = await as(app, world.guestA).post("/api/reservations").send({ from: isoDay(56), to: isoDay(57), purpose: "S členem", participantIds: [world.memberA.id] });
    assert.equal(res.status, 403);
    assert.equal(await prisma.reservation.count(), before);
    const put = await as(app, world.guestA).put(`/api/reservations/${guestStay}`).send({ participantIds: [world.memberA.id] });
    assert.equal(put.status, 403);
  });

  test("a reservation of a member is not found for a guest", async () => {
    assert.equal((await as(app, world.guestA).put(`/api/reservations/${memberUpcoming}`).send({ purpose: "Cizí" })).status, 404);
    assert.equal((await as(app, world.guestA).delete(`/api/reservations/${memberUpcoming}`)).status, 404);
    assert.equal((await prisma.reservation.findUnique({ where: { id: memberUpcoming } }))?.purpose, `Pobyt ${world.memberA.username}`);
  });

  test("a guest checks out their own stay, a stay of a member is not found", async () => {
    const own = await as(app, world.guestA).patch(`/api/reservations/${guestStay}/checkout`).send({});
    assert.equal(own.status, 200);
    assert.equal((await prisma.reservation.findUnique({ where: { id: guestStay } }))?.isCheckoutCompleted, true);
    assert.equal((await as(app, world.guestA).get(`/api/reservations/${memberActive}/checkout`)).status, 404);
    assert.equal((await as(app, world.guestA).patch(`/api/reservations/${memberActive}/checkout`).send({})).status, 404);
    assert.equal((await prisma.reservation.findUnique({ where: { id: memberActive } }))?.isCheckoutCompleted, false);
  });

  test("a stay a member lends to the guest as a co-occupant is the guest's own stay", async () => {
    const lent = await createReservation(world.memberA, 60, 62);
    await prisma.reservationParticipant.create({ data: { reservationId: lent, userId: world.guestA.id } });
    const list = await as(app, world.guestA).get("/api/reservations");
    assert.ok(list.body.reservations.some((r: { id: string }) => r.id === lent));
    assert.equal((await as(app, world.guestA).patch(`/api/reservations/${lent}/checkout`).send({})).status, 200);
    assert.equal((await as(app, world.guestA).put(`/api/reservations/${lent}`).send({ purpose: "Můj" })).status, 403); // upravuje jen organizátor
  });
});
