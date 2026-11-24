import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { hashPassword } from "../../utils/password";
import { as, setupIntegrationFile, teardownIntegrationFile, TEST_PASSWORD, type TestUser, type TestWorld } from "./harness";

// Tenant kontrakt správy členů `/api/users` (#407): správce chaty A na člena chaty B dostane 404
// a člen B zůstane beze změny, seznam členů A neobsahuje nikoho z B, hromadné mazání rezervací
// z A nesáhne na B a kontrola „poslední admin" počítá jen správce vlastní chaty.

let app: Express;
let world: TestWorld;
let reservationB: string;

type Call = (user: TestUser) => Promise<{ status: number }>;

const userSnapshot = (id: string) =>
  prisma.user.findUnique({ where: { id }, select: { username: true, role: true, passwordHash: true, cabinId: true } });

async function createUser(username: string, role: string, cabinId: string): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(TEST_PASSWORD),
      color: "#5d9b62",
      email: `${username}@example.test`,
      isEmailVerified: true,
      isVerified: true,
      role,
      cabinId,
    },
  });
  return { id: user.id, username, role, cabinId };
}

/** Nová chata s jediným správcem; v chatách A a B jsou další správci, ti se do počtu nesmí plést. */
async function soleAdminOfNewCabin(slug: string): Promise<TestUser> {
  const cabin = await prisma.cabin.create({ data: { name: `Chata ${slug}`, subdomain: `chata-${slug}` } });
  return createUser(`jediny-spravce-${slug}`, "admin", cabin.id);
}

const createReservation = async (user: TestUser) =>
  (await prisma.reservation.create({
    data: { userId: user.id, cabinId: user.cabinId, dateFrom: new Date("2027-07-01"), dateTo: new Date("2027-07-05"), purpose: "Dovolená" },
  })).id;

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  reservationB = await createReservation(world.memberB);
});

after(teardownIntegrationFile);

describe("users: admin A on a cabin B member gets 404 and the member is unchanged", () => {
  const cases: [string, Call][] = [
    ["PUT /api/users/:id/role", (u) => as(app, u).put(`/api/users/${world.memberB.id}/role`).send({ role: "admin" })],
    [
      "PUT /api/users/:id/password",
      (u) => as(app, u).put(`/api/users/${world.memberB.id}/password`).send({ password: "prevzate-heslo-123" }),
    ],
    [
      "PATCH /api/users/:id",
      (u) => as(app, u).patch(`/api/users/${world.memberB.id}`).send({ role: "admin", password: "prevzate-heslo-123" }),
    ],
    [
      "PATCH /api/users/:id/remove-from-cabin (soft)",
      (u) => as(app, u).patch(`/api/users/${world.memberB.id}/remove-from-cabin`).send({ deleteData: false }),
    ],
    [
      "PATCH /api/users/:id/remove-from-cabin (deleteData)",
      (u) => as(app, u).patch(`/api/users/${world.memberB.id}/remove-from-cabin`).send({ deleteData: true }),
    ],
    ["DELETE /api/users/:id", (u) => as(app, u).delete(`/api/users/${world.memberB.id}`)],
  ];

  for (const [name, call] of cases) {
    test(name, async () => {
      const before = await userSnapshot(world.memberB.id);
      const res = await call(world.adminA);
      assert.equal(res.status, 404);
      assert.deepEqual(await userSnapshot(world.memberB.id), before);
    });
  }

  test("positive control: admin A changes the role of a cabin A member", async () => {
    const own = await createUser("clen-a-role", "user", world.cabinA.id);
    const res = await as(app, world.adminA).put(`/api/users/${own.id}/role`).send({ role: "guest" });
    assert.equal(res.status, 200);
    assert.equal((await userSnapshot(own.id))?.role, "guest");
  });
});

describe("users: GET /api/users for cabin A contains nothing from cabin B", () => {
  for (const actor of ["adminA", "memberA"] as const) {
    test(`as ${actor}`, async () => {
      const res = await as(app, world[actor]).get("/api/users");
      assert.equal(res.status, 200);
      const ids = res.body.map((u: { id: string }) => u.id);
      assert.ok(ids.includes(world.adminA.id) && ids.includes(world.memberA.id));
      const body = JSON.stringify(res.body);
      for (const leak of [world.adminB.id, world.memberB.id, world.adminB.username, world.memberB.username]) {
        assert.equal(body.includes(leak), false, `leaked ${leak}`);
      }
    });
  }
});

describe("users: bulk changes from cabin A do not touch cabin B", () => {
  test("DELETE /api/users/:id/reservations on a cabin B member keeps their reservation", async () => {
    const res = await as(app, world.adminA).delete(`/api/users/${world.memberB.id}/reservations`);
    assert.equal(res.status, 200);
    assert.ok(await prisma.reservation.findUnique({ where: { id: reservationB } }));
  });

  test("positive control: DELETE /api/users/:id/reservations removes a cabin A member's reservations", async () => {
    const own = await createReservation(world.memberA);
    const res = await as(app, world.adminA).delete(`/api/users/${world.memberA.id}/reservations`);
    assert.equal(res.status, 200);
    assert.equal(await prisma.reservation.findUnique({ where: { id: own } }), null);
  });

  // Uživatelské jméno je v DB globálně unikátní, takže jméno z chaty B v A nevznikne nikdy;
  // filtr `cabinId` tu mění jen chybový kód (viz výjimka v TENANT_MUTANT_EXCEPTIONS).
  test("POST /api/users with a cabin B username creates nothing and leaves the B member unchanged", async () => {
    const before = await userSnapshot(world.memberB.id);
    const res = await as(app, world.adminA).post("/api/users").send({ username: world.memberB.username, password: "nove-heslo-123" });
    assert.notEqual(res.status, 201);
    assert.equal(await prisma.user.count({ where: { username: world.memberB.username } }), 1);
    assert.deepEqual(await userSnapshot(world.memberB.id), before);
  });
});

describe("users: the last-admin check on leave-cabin counts only admins of the own cabin", () => {
  // DELETE /api/users/me se sem nepíše: route zastiňuje DELETE /:id (bug #419, výjimka v registru).
  test("POST /api/users/me/leave-cabin by the only admin of a cabin → 400 and they stay in it", async () => {
    const admin = await soleAdminOfNewCabin("odejit");
    const res = await as(app, admin).post("/api/users/me/leave-cabin");
    assert.equal(res.status, 400);
    const after = await userSnapshot(admin.id);
    assert.equal(after?.cabinId, admin.cabinId);
    assert.equal(after?.role, "admin");
  });
});
