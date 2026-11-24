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

const USERNAME_TAKEN = "Uživatelské jméno již existuje.";

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
    const ownMember = await createUser("clen-a-role", "user", world.cabinA.id);
    const res = await as(app, world.adminA).put(`/api/users/${ownMember.id}/role`).send({ role: "guest" });
    assert.equal(res.status, 200);
    assert.equal((await userSnapshot(ownMember.id))?.role, "guest");
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
  // Hromadné deleteMany odpoví 200 i na neexistující id, takže 200 tu nic neprozradí; tenant
  // kontrakt je, že rezervace chaty B zůstane.
  test("DELETE /api/users/:id/reservations on a cabin B member keeps their reservation", async () => {
    const res = await as(app, world.adminA).delete(`/api/users/${world.memberB.id}/reservations`);
    assert.equal(res.status, 200);
    assert.ok(await prisma.reservation.findUnique({ where: { id: reservationB } }));
  });

  test("positive control: DELETE /api/users/:id/reservations removes a cabin A member's reservations", async () => {
    const ownReservationId = await createReservation(world.memberA);
    const res = await as(app, world.adminA).delete(`/api/users/${world.memberA.id}/reservations`);
    assert.equal(res.status, 200);
    assert.equal(await prisma.reservation.findUnique({ where: { id: ownReservationId } }), null);
  });

  // Uživatelské jméno je v DB globálně unikátní, takže jméno z chaty B v A nevznikne nikdy;
  // obsazenost hlásí stejně jako veřejná registrace (409), bez ohledu na chatu (#420).
  test("POST /api/users with a cabin B username creates nothing and leaves the B member unchanged", async () => {
    const before = await userSnapshot(world.memberB.id);
    const res = await as(app, world.adminA).post("/api/users").send({ username: world.memberB.username, password: "nove-heslo-123" });
    assert.equal(res.status, 409);
    assert.deepEqual(res.body, { message: USERNAME_TAKEN });
    assert.equal(await prisma.user.count({ where: { username: world.memberB.username } }), 1);
    assert.deepEqual(await userSnapshot(world.memberB.id), before);
  });
});

// Správce zakládá člena (#420): jméno je obsazené v jakékoli chatě a bez ohledu na velikost
// písmen, stejně jako u veřejné registrace (409 „Uživatelské jméno již existuje.“).
describe("users: POST /api/users rejects a taken username like the public registration", () => {
  const usernameCount = (username: string) =>
    prisma.user.count({ where: { username: { equals: username, mode: "insensitive" } } });
  const post = (username: string) =>
    as(app, world.adminA).post("/api/users").send({ username, password: "nove-heslo-123" });

  const cases: [string, () => string][] = [
    ["an own cabin username in different case", () => world.memberA.username.toUpperCase()],
    ["a cabin B username in different case", () => world.memberB.username.toUpperCase()],
  ];
  for (const [name, username] of cases) {
    test(`${name} → 409 and nothing is created`, async () => {
      const res = await post(username());
      assert.equal(res.status, 409);
      assert.deepEqual(res.body, { message: USERNAME_TAKEN });
      assert.equal(await usernameCount(username()), 1);
    });
  }

  // Obě žádosti projdou kontrolou dřív, než jedna z nich zapíše; druhá skončí na unikátním
  // indexu a i ta musí dostat 409, ne 500.
  test("two concurrent requests for the same new username → one 201 and one 409", async () => {
    const statuses = (await Promise.all([post("soubezny-clen"), post("soubezny-clen")])).map((r) => r.status);
    assert.deepEqual(statuses.sort(), [201, 409]);
    assert.equal(await usernameCount("soubezny-clen"), 1);
  });

  test("positive control: a free username → 201 in the admin's cabin", async () => {
    const res = await post("novy-clen-a");
    assert.equal(res.status, 201);
    const created = await prisma.user.findUnique({ where: { username: "novy-clen-a" }, select: { cabinId: true } });
    assert.equal(created?.cabinId, world.cabinA.id);
  });
});

describe("users: the last-admin check on leave-cabin counts only admins of the own cabin", () => {
  test("POST /api/users/me/leave-cabin by the only admin of a cabin → 400 and they stay in it", async () => {
    const admin = await soleAdminOfNewCabin("odejit");
    const res = await as(app, admin).post("/api/users/me/leave-cabin");
    assert.equal(res.status, 400);
    const after = await userSnapshot(admin.id);
    assert.equal(after?.cabinId, admin.cabinId);
    assert.equal(after?.role, "admin");
  });
});

describe("users: DELETE /api/users/me deletes only the caller's own account (#419)", () => {
  test("a cabin A member deletes their account with the password → 200, account gone, cabin B unchanged", async () => {
    const member = await createUser("clen-a-smazat", "user", world.cabinA.id);
    const adminB = await userSnapshot(world.adminB.id);
    const memberB = await userSnapshot(world.memberB.id);
    const res = await as(app, member).delete("/api/users/me").send({ password: TEST_PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(await userSnapshot(member.id), null);
    assert.deepEqual(await userSnapshot(world.adminB.id), adminB);
    assert.deepEqual(await userSnapshot(world.memberB.id), memberB);
    assert.ok(await prisma.reservation.findUnique({ where: { id: reservationB } }));
  });

  test("a wrong password → 400 and the account stays", async () => {
    const member = await createUser("clen-a-spatne-heslo", "user", world.cabinA.id);
    const res = await as(app, member).delete("/api/users/me").send({ password: "spatne-heslo-123" });
    assert.equal(res.status, 400);
    assert.ok(await userSnapshot(member.id));
  });

  // Chaty A a B mají vlastní správce; kdyby se počítali do kontroly, jediný správce by se smazal.
  test("the only admin of a cabin → 400 and the account stays", async () => {
    const admin = await soleAdminOfNewCabin("smazat");
    const res = await as(app, admin).delete("/api/users/me").send({ password: TEST_PASSWORD });
    assert.equal(res.status, 400);
    const after = await userSnapshot(admin.id);
    assert.equal(after?.cabinId, admin.cabinId);
    assert.equal(after?.role, "admin");
  });
});
