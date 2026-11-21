import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { calendarTodayIso } from "../../backend/routes/reservationHelpers";
import { as, recordRealtimeEmits, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";

let app: Express;
let world: TestWorld;

/** Pobyt, který končí dnes (místní den v Praze, stejně jako dashboard route). */
async function createStayEndingToday(owner: TestUser, extra: { handoverNote?: string; status?: "primary" | "backup" | "soft" } = {}): Promise<string> {
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

describe("handover: PATCH /checkout notifies the cabin in realtime", () => {
  test("completing the handover emits reservation:updated with the PUT payload, only to the caller's cabin room", async () => {
    // backup: PUT /:id níže nesmí narazit na kolizi s jiným potvrzeným pobytem z dřívějších testů
    const id = await createStayEndingToday(world.memberA, { status: "backup" });
    const recorder = recordRealtimeEmits();
    try {
      const checkout = await as(app, world.memberA)
        .patch(`/api/reservations/${id}/checkout`)
        .send({ checkoutState: { note: "Klíč je u souseda" } });
      assert.equal(checkout.status, 200);
      assert.deepEqual(recorder.emits.map((e) => [e.room, e.event]), [[`cabin:${world.cabinA.id}`, "reservation:updated"]]);
      const checkoutPayload = recorder.emits[0].data;

      // Stejný payload jako úprava rezervace přes PUT /:id (beze změny dat)
      const put = await as(app, world.memberA).put(`/api/reservations/${id}`).send({});
      assert.equal(put.status, 200);
      assert.deepEqual(checkoutPayload, put.body);
      assert.equal((checkoutPayload as { id: string }).id, id);
    } finally {
      recorder.restore();
    }
  });

  test("updating the state of an already completed handover emits reservation:updated again", async () => {
    const id = await createStayEndingToday(world.memberA);
    await as(app, world.memberA).patch(`/api/reservations/${id}/checkout`).send({});
    const recorder = recordRealtimeEmits();
    try {
      const res = await as(app, world.adminA)
        .patch(`/api/reservations/${id}/checkout`)
        .send({ checkoutState: { note: "Doplněno" } });
      assert.equal(res.status, 200);
      assert.deepEqual(recorder.emits.map((e) => [e.room, e.event]), [[`cabin:${world.cabinA.id}`, "reservation:updated"]]);
    } finally {
      recorder.restore();
    }
  });

  test("a repeated PATCH without checkoutState changes nothing and emits nothing", async () => {
    const id = await createStayEndingToday(world.memberA);
    await as(app, world.memberA).patch(`/api/reservations/${id}/checkout`).send({});
    const recorder = recordRealtimeEmits();
    try {
      const res = await as(app, world.memberA).patch(`/api/reservations/${id}/checkout`).send({});
      assert.equal(res.status, 200);
      assert.deepEqual(recorder.emits, []);
    } finally {
      recorder.restore();
    }
  });

  test("checking out another cabin's stay (404) emits nothing to any room", async () => {
    const stayB = await createStayEndingToday(world.memberB);
    const recorder = recordRealtimeEmits();
    try {
      const res = await as(app, world.memberA).patch(`/api/reservations/${stayB}/checkout`).send({ checkoutState: { note: "cizí" } });
      assert.equal(res.status, 404);
      assert.deepEqual(recorder.emits, []);
    } finally {
      recorder.restore();
    }
  });
});
