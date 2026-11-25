import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { JWT_SECRET } from "../../config/config";
import { hashPassword } from "../../utils/password";
import { as, setupIntegrationFile, teardownIntegrationFile, tokenFor, TEST_PASSWORD, type TestUser, type TestWorld } from "./harness";

// Zneplatnění přihlášení přes `User.tokenVersion` (#485): každá událost, která ruší relace, zvedne
// verzi a dřív vydaný token pak vrátí 401. Každá událost má vlastní oběť, aby se testy neovlivňovaly.

let app: Express;
let world: TestWorld;
let superadmin: TestUser;

const NEW_PASSWORD = "nove-heslo-485-abc";

const meWith = (token: string) => request(app).get("/api/users/me").set("Authorization", `Bearer ${token}`);
const login = (username: string, password: string) => request(app).post("/api/login").send({ username, password });

let victimCounter = 0;
async function createVictim(overrides: { isSuperAdmin?: boolean } = {}): Promise<TestUser> {
  victimCounter += 1;
  const username = `obet-${victimCounter}`;
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(TEST_PASSWORD),
      color: "#5d9b62",
      email: `${username}@example.test`,
      isEmailVerified: true,
      isVerified: true,
      role: "user",
      cabinId: world.cabinA.id,
      ...overrides,
    },
  });
  return { id: user.id, username, role: user.role, cabinId: world.cabinA.id, tokenVersion: user.tokenVersion };
}

/** Oběť s platným tokenem; po události `revoke` musí starý token vrátit 401. */
async function assertEventRevokesToken(revoke: (victim: TestUser) => Promise<{ status: number }>) {
  const victim = await createVictim();
  const oldToken = tokenFor(victim);
  assert.equal((await meWith(oldToken)).status, 200, "token před událostí platí");

  const res = await revoke(victim);
  assert.ok(res.status >= 200 && res.status < 300, `událost selhala se stavem ${res.status}`);

  assert.equal((await meWith(oldToken)).status, 401, "starý token po události neplatí");
  // Pozitivní kontrola: zneplatnění jednoho uživatele nesahá na ostatní.
  assert.equal((await as(app, world.memberA).get("/api/users/me")).status, 200);
}

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  superadmin = await createVictim({ isSuperAdmin: true });
});

after(teardownIntegrationFile);

describe("token revocation: each event invalidates earlier tokens (401)", () => {
  test("own password change (PATCH /api/users/me/password)", async () => {
    await assertEventRevokesToken((victim) =>
      as(app, victim).patch("/api/users/me/password").send({ oldPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }),
    );
  });

  test("password reset by e-mail link (POST /api/reset-password)", async () => {
    await assertEventRevokesToken(async (victim) => {
      const raw = crypto.randomBytes(32).toString("hex");
      await prisma.user.update({
        where: { id: victim.id },
        data: {
          passwordResetToken: crypto.createHash("sha256").update(raw).digest("hex"),
          passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      return request(app).post("/api/reset-password").send({ token: raw, password: NEW_PASSWORD });
    });
  });

  test("password reset by a cabin admin (PUT /api/users/:id/password)", async () => {
    await assertEventRevokesToken((victim) =>
      as(app, world.adminA).put(`/api/users/${victim.id}/password`).send({ password: NEW_PASSWORD }),
    );
  });

  test("password reset by a cabin admin from the members page (PATCH /api/users/:id with password)", async () => {
    await assertEventRevokesToken((victim) => as(app, world.adminA).patch(`/api/users/${victim.id}`).send({ password: NEW_PASSWORD }));
  });

  test("ban by the superadmin (PATCH /api/superadmin/users/:id/ban)", async () => {
    await assertEventRevokesToken((victim) => as(app, superadmin).patch(`/api/superadmin/users/${victim.id}/ban`));
  });

  test("removal from the cabin, data kept (PATCH /api/users/:id/remove-from-cabin)", async () => {
    await assertEventRevokesToken((victim) =>
      as(app, world.adminA).patch(`/api/users/${victim.id}/remove-from-cabin`).send({ deleteData: false }),
    );
  });

  test("removal from the cabin with data (PATCH /api/users/:id/remove-from-cabin, deleteData)", async () => {
    await assertEventRevokesToken((victim) =>
      as(app, world.adminA).patch(`/api/users/${victim.id}/remove-from-cabin`).send({ deleteData: true }),
    );
  });

  test("role change (PUT /api/users/:id/role)", async () => {
    await assertEventRevokesToken((victim) => as(app, world.adminA).put(`/api/users/${victim.id}/role`).send({ role: "guest" }));
  });

  test("role change from the members page (PATCH /api/users/:id with role)", async () => {
    await assertEventRevokesToken((victim) => as(app, world.adminA).patch(`/api/users/${victim.id}`).send({ role: "guest" }));
  });

  test("account deletion by the user (DELETE /api/users/me)", async () => {
    await assertEventRevokesToken((victim) => as(app, victim).delete("/api/users/me").send({ password: TEST_PASSWORD }));
  });

  test("account deletion by a cabin admin (DELETE /api/users/:id)", async () => {
    await assertEventRevokesToken((victim) => as(app, world.adminA).delete(`/api/users/${victim.id}`));
  });
});

describe("token version check", () => {
  test("a token without tokenVersion (issued before #485) → 401", async () => {
    const legacy = jwt.sign(
      { userId: world.memberA.id, username: world.memberA.username, role: world.memberA.role, cabinId: world.cabinA.id, isSuperAdmin: false },
      JWT_SECRET,
      { expiresIn: "7d" },
    );
    const res = await meWith(legacy);
    assert.equal(res.status, 401);
  });

  test("a token with a version ahead of the DB → 401", async () => {
    const res = await meWith(tokenFor({ ...world.memberA, tokenVersion: 1 }));
    assert.equal(res.status, 401);
  });

  test("an admin change that touches neither role nor password keeps the session", async () => {
    const victim = await createVictim();
    const res = await as(app, world.adminA).patch(`/api/users/${victim.id}`).send({});
    assert.equal(res.status, 200);
    assert.equal((await meWith(tokenFor(victim))).status, 200);
  });
});

describe("log out everywhere (POST /api/users/me/logout-all)", () => {
  test("all earlier tokens stop working, including the calling one; a new login works", async () => {
    const victim = await createVictim();
    const phone = (await login(victim.username, TEST_PASSWORD)).body.token as string;
    const laptop = (await login(victim.username, TEST_PASSWORD)).body.token as string;
    assert.equal((await meWith(phone)).status, 200);
    assert.equal((await meWith(laptop)).status, 200);

    const res = await request(app).post("/api/users/me/logout-all").set("Authorization", `Bearer ${laptop}`);
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.message, "string");
    assert.equal(res.body.token, undefined, "odhlásí i aktuální zařízení, nový token nevydá");

    assert.equal((await meWith(phone)).status, 401);
    assert.equal((await meWith(laptop)).status, 401);

    const relogin = await login(victim.username, TEST_PASSWORD);
    assert.equal(relogin.status, 200);
    assert.equal((await meWith(relogin.body.token)).status, 200);
  });

  test("without a token → 401", async () => {
    const res = await request(app).post("/api/users/me/logout-all");
    assert.equal(res.status, 401);
  });
});

describe("own password change keeps the current device signed in", () => {
  test("the token from the response works, the other device is signed out, the new password logs in", async () => {
    const victim = await createVictim();
    const otherDevice = (await login(victim.username, TEST_PASSWORD)).body.token as string;

    const res = await as(app, victim).patch("/api/users/me/password").send({ oldPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.token, "string");

    const me = await meWith(res.body.token);
    assert.equal(me.status, 200);
    assert.equal(me.body.username, victim.username);
    assert.equal((await meWith(otherDevice)).status, 401);

    const relogin = await login(victim.username, NEW_PASSWORD);
    assert.equal(relogin.status, 200);
    assert.equal((await meWith(relogin.body.token)).status, 200);
  });

  test("a wrong old password changes nothing and keeps the session", async () => {
    const victim = await createVictim();
    const res = await as(app, victim).patch("/api/users/me/password").send({ oldPassword: "spatne-heslo", newPassword: NEW_PASSWORD });
    assert.equal(res.status, 400);
    assert.equal((await meWith(tokenFor(victim))).status, 200);
  });
});
