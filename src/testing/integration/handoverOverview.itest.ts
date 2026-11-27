import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { addDaysIso, calendarTodayIso } from "../../backend/routes/reservationHelpers";
import { addGuests, as, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorldWithGuests } from "./harness";

let app: Express;
let world: TestWorldWithGuests;

/** Den posunutý od dneška (pražský kalendářní den, stejně jako route). */
const day = (offset: number) => new Date(addDaysIso(calendarTodayIso(new Date()), offset));

async function stay(owner: TestUser, from: number, to: number, extra: Record<string, unknown> = {}): Promise<string> {
  const data = { userId: owner.id, cabinId: owner.cabinId, dateFrom: day(from), dateTo: day(to), purpose: "Pobyt", ...extra };
  return (await prisma.reservation.create({ data })).id;
}

const handedOverBy = (by: TestUser, checkoutState: object) => ({
  isCheckoutCompleted: true, checkoutCompletedBy: by.id, checkoutCompletedAt: new Date(), checkoutState,
});

const overview = (user: TestUser) => as(app, user).get("/api/handover");

before(async () => {
  const setup = await setupIntegrationFile();
  app = setup.app;
  world = await addGuests(setup.world);
});

after(teardownIntegrationFile);

describe("GET /api/handover: myStay", () => {
  test("follows the phases, including the day after departure and a stay where I am a co-traveller", async () => {
    const upcoming = await stay(world.memberA, 5, 7);
    let res = await overview(world.memberA);
    assert.equal(res.status, 200);
    assert.equal(res.body.myStay.reservationId, upcoming);
    assert.equal(res.body.myStay.phase, "upcoming");

    const asCoTraveller = await stay(world.adminA, -2, 1, { participants: { create: { userId: world.memberA.id } } });
    res = await overview(world.memberA);
    assert.equal(res.body.myStay.reservationId, asCoTraveller);
    assert.equal(res.body.myStay.phase, "ongoing");

    const dayAfter = await stay(world.memberA, -3, -1);
    res = await overview(world.memberA);
    assert.equal(res.body.myStay.reservationId, dayAfter);
    assert.equal(res.body.myStay.phase, "departure");

    await prisma.reservation.deleteMany({ where: { id: { in: [upcoming, asCoTraveller, dayAfter] } } });
  });
});

describe("GET /api/handover: lastHandover", () => {
  test("is the newest completed handover, skips stays without one and my own stay, and never leaks the other cabin", async () => {
    const older = await stay(world.adminA, -10, -8, handedOverBy(world.memberA, { gas: "half", note: "Dřevo je u kamen" }));
    await stay(world.adminA, -6, -4);
    const mine = await stay(world.memberA, -2, 0, handedOverBy(world.memberA, { waterOff: true }));
    const foreign = await stay(world.memberB, -1, 0, handedOverBy(world.memberB, { note: "cizí vzkaz" }));

    const resA = await overview(world.memberA);
    assert.equal(resA.status, 200);
    assert.equal(resA.body.myStay.reservationId, mine);
    assert.equal(resA.body.myStay.isCheckoutCompleted, true);
    assert.equal(resA.body.lastHandover.reservationId, older);
    assert.equal(resA.body.lastHandover.organizer.username, world.adminA.username);
    assert.equal(resA.body.lastHandover.completedByUsername, world.memberA.username);
    assert.deepEqual(resA.body.lastHandover.checkoutState, { gas: "half", note: "Dřevo je u kamen" });

    const resAdmin = await overview(world.adminA);
    assert.equal(resAdmin.body.myStay, null);
    assert.equal(resAdmin.body.lastHandover.reservationId, mine);

    for (const res of [resA, resAdmin]) {
      const body = JSON.stringify(res.body);
      assert.equal(body.includes(foreign) || body.includes(world.memberB.username) || body.includes("cizí"), false);
    }
    const resB = await overview(world.memberB);
    assert.equal(resB.body.lastHandover, null);
    assert.equal(resB.body.myStay.reservationId, foreign);
  });
});

describe("GET /api/handover: guest (#484)", () => {
  test("a guest gets their own stay, but not the last handover of other members' stays", async () => {
    const ownStay = await stay(world.guestA, 3, 5);
    const res = await overview(world.guestA);
    assert.equal(res.status, 200);
    assert.equal(res.body.myStay.reservationId, ownStay);
    assert.equal(res.body.lastHandover, null);
  });
});
