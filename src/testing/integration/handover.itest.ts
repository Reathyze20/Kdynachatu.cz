import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { calendarTodayIso } from "../../backend/routes/reservationHelpers";
import { as, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";

let app: Express;
let world: TestWorld;

/** Pobyt, který končí dnes (místní den v Praze, stejně jako dashboard route). */
async function createStayEndingToday(owner: TestUser, extra: { handoverNote?: string } = {}): Promise<string> {
  const today = new Date(calendarTodayIso(new Date()));
  const reservation = await prisma.reservation.create({
    data: {
      userId: owner.id,
      cabinId: owner.cabinId,
      dateFrom: new Date(today.getTime() - 2 * 86_400_000),
      dateTo: today,
      purpose: `Odjezd ${owner.username}`,
      ...extra,
    },
  });
  return reservation.id;
}

const dashboardAs = (user: TestUser) => as(app, user).get("/api/dashboard/reservations");

before(async () => {
  ({ app, world } = await setupIntegrationFile());
});

after(teardownIntegrationFile);

describe("handover: the departure gate follows isCheckoutCompleted", () => {
  test("a legacy handoverNote alone does not count as a completed handover", async () => {
    const id = await createStayEndingToday(world.memberA, { handoverNote: "Starý vzkaz pro další" });
    const res = await dashboardAs(world.memberA);
    assert.equal(res.status, 200);
    assert.equal(res.body.departingToday, true);
    assert.equal(res.body.departingReservationId, id);
    await prisma.reservation.delete({ where: { id } });
  });

  test("banner path (PATCH /checkout with checkoutState) completes the handover and closes the gate", async () => {
    const id = await createStayEndingToday(world.memberA);
    const before = await dashboardAs(world.memberA);
    assert.equal(before.body.departingToday, true);
    assert.equal(before.body.departingReservationId, id);

    const checkout = await as(app, world.memberA)
      .patch(`/api/reservations/${id}/checkout`)
      .send({ checkoutState: { note: "Dřevo je pod plachtou" } });
    assert.equal(checkout.status, 200);
    assert.equal(checkout.body.isCheckoutCompleted, true);
    assert.deepEqual(checkout.body.checkoutState, { note: "Dřevo je pod plachtou" });

    const after = await dashboardAs(world.memberA);
    assert.equal(after.body.departingToday, false);
    assert.equal(after.body.departingReservationId, null);
  });

  test("the gate is scoped to the caller's cabin and the other cabin's stay cannot be checked out (404)", async () => {
    const stayB = await createStayEndingToday(world.memberB);

    const resA = await dashboardAs(world.adminA);
    assert.equal(resA.body.departingToday, false);
    assert.equal(JSON.stringify(resA.body).includes(stayB), false);

    const checkout = await as(app, world.memberA).patch(`/api/reservations/${stayB}/checkout`).send({ checkoutState: { note: "cizí" } });
    assert.equal(checkout.status, 404);
    const untouched = await prisma.reservation.findUnique({ where: { id: stayB } });
    assert.equal(untouched?.isCheckoutCompleted, false);
    assert.equal(untouched?.checkoutState, null);

    const resB = await dashboardAs(world.memberB);
    assert.equal(resB.body.departingToday, true);
    assert.equal(resB.body.departingReservationId, stayB);
  });
});
