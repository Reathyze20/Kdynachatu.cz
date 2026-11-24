import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { hashPassword } from "../../utils/password";
import { as, setupIntegrationFile, teardownIntegrationFile, TEST_PASSWORD, type TestUser, type TestWorld } from "./harness";

// Superadmin je pro správce chaty neviditelný (#474): i když má `cabinId` jeho chaty, adminské
// endpointy `/api/users/:id*` odpoví stejně jako na neexistujícího uživatele (404, stejná hláška)
// a superadmin v DB zůstane beze změny. V seznamu členů chaty chybí. Jeho vlastní endpointy jedou dál.

let app: Express;
let world: TestWorld;
let superadmin: TestUser;

type Call = (user: TestUser, targetId: string) => Promise<{ status: number; body: unknown }>;

const userSnapshot = (id: string) =>
  prisma.user.findUnique({
    where: { id },
    select: { username: true, role: true, passwordHash: true, cabinId: true, isSuperAdmin: true, email: true, color: true },
  });

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  const user = await prisma.user.create({
    data: {
      username: "superadmin-v-a",
      passwordHash: await hashPassword(TEST_PASSWORD),
      color: "#123456",
      email: "superadmin-v-a@example.test",
      isEmailVerified: true,
      isVerified: true,
      isSuperAdmin: true,
      role: "user",
      cabinId: world.cabinA.id,
    },
  });
  superadmin = { id: user.id, username: user.username, role: user.role, cabinId: world.cabinA.id };
});

after(teardownIntegrationFile);

describe("superadmin: cabin admin endpoints answer 404 like for a non-existent user", () => {
  const cases: [string, Call][] = [
    ["PUT /api/users/:id/role", (u, id) => as(app, u).put(`/api/users/${id}/role`).send({ role: "guest" })],
    ["PUT /api/users/:id/password", (u, id) => as(app, u).put(`/api/users/${id}/password`).send({ password: "prevzate-heslo-123" })],
    ["PATCH /api/users/:id", (u, id) => as(app, u).patch(`/api/users/${id}`).send({ role: "guest", password: "prevzate-heslo-123" })],
    ["PATCH /api/users/:id/remove-from-cabin (soft)", (u, id) => as(app, u).patch(`/api/users/${id}/remove-from-cabin`).send({ deleteData: false })],
    ["PATCH /api/users/:id/remove-from-cabin (deleteData)", (u, id) => as(app, u).patch(`/api/users/${id}/remove-from-cabin`).send({ deleteData: true })],
    ["DELETE /api/users/:id", (u, id) => as(app, u).delete(`/api/users/${id}`)],
  ];

  for (const [name, call] of cases) {
    test(name, async () => {
      const before = await userSnapshot(superadmin.id);
      const missing = await call(world.adminA, randomUUID());
      const res = await call(world.adminA, superadmin.id);
      assert.equal(missing.status, 404);
      assert.equal(res.status, 404);
      assert.deepEqual(res.body, missing.body);
      assert.deepEqual(await userSnapshot(superadmin.id), before);
    });
  }
});

describe("superadmin: GET /api/users of the cabin does not list the superadmin", () => {
  for (const actor of ["adminA", "memberA"] as const) {
    test(`as ${actor}`, async () => {
      const res = await as(app, world[actor]).get("/api/users");
      assert.equal(res.status, 200);
      const ids = res.body.map((u: { id: string }) => u.id);
      assert.ok(ids.includes(world.adminA.id) && ids.includes(world.memberA.id));
      const body = JSON.stringify(res.body);
      for (const leak of [superadmin.id, superadmin.username]) {
        assert.equal(body.includes(leak), false, `leaked ${leak}`);
      }
    });
  }

  test("the superadmin still sees themselves in the list of their cabin", async () => {
    const res = await as(app, superadmin).get("/api/users");
    assert.equal(res.status, 200);
    assert.ok(res.body.some((u: { id: string }) => u.id === superadmin.id));
  });
});

describe("superadmin: own endpoints keep working", () => {
  test("GET /api/superadmin/users lists everyone including the superadmin", async () => {
    const res = await as(app, superadmin).get("/api/superadmin/users");
    assert.equal(res.status, 200);
    const ids = res.body.map((u: { id: string }) => u.id);
    for (const id of [superadmin.id, world.adminA.id, world.memberB.id]) assert.ok(ids.includes(id));
  });

  test("GET /api/users/me returns the superadmin's profile", async () => {
    const res = await as(app, superadmin).get("/api/users/me");
    assert.equal(res.status, 200);
    assert.equal(res.body.id, superadmin.id);
  });

  test("PATCH /api/users/me updates the superadmin's profile", async () => {
    const res = await as(app, superadmin).patch("/api/users/me").send({ color: "#654321" });
    assert.equal(res.status, 200);
    assert.equal((await userSnapshot(superadmin.id))?.color, "#654321");
  });

  test("positive control: admin A still changes the role of a regular cabin A member", async () => {
    const res = await as(app, world.adminA).put(`/api/users/${world.memberA.id}/role`).send({ role: "guest" });
    assert.equal(res.status, 200);
    assert.equal((await userSnapshot(world.memberA.id))?.role, "guest");
  });
});
