import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import type { Express } from "express";
import request from "supertest";
import prisma from "../../utils/prisma";
import { hashPassword } from "../../utils/password";
import { as, setupIntegrationFile, teardownIntegrationFile, TEST_PASSWORD, type TestWorld } from "./harness";

// Auth endpointy jsou mountované na `/api` (NE `/api/auth`), viz src/backend/app.ts.
// Voláme je přímo přes supertest nad `app` – NEpoužíváme `as`/`tokenFor`, které login obcházejí.
// Rate limity jsou v harnessu vypnuté (createApp({ enableRateLimits: false })).

let app: Express;
let world: TestWorld;

const NEW_PASSWORD = "nove-heslo-123";

/** SHA-256 hash resetovacího tokenu – přesně tak, jak ho auth.ts ukládá do DB. */
const hashToken = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");

/** 64hex token – splňuje min. délku resetPasswordSchema (20). */
const rawToken = () => crypto.randomBytes(32).toString("hex");

const login = (username: string, password: string) =>
  request(app).post("/api/login").send({ username, password });

before(async () => {
  ({ app, world } = await setupIntegrationFile());
});

after(teardownIntegrationFile);

describe("auth login", () => {
  test("správné heslo ověřeného usera → 200 + token", async () => {
    const res = await login(world.memberA.username, TEST_PASSWORD);
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.token, "string");
    assert.ok(res.body.token.length > 0);
  });

  test("špatné heslo → 401 s generickou hláškou", async () => {
    const res = await login(world.memberA.username, "spatne-heslo");
    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Nesprávné uživatelské jméno nebo heslo.");
  });

  test("neznámý username → 401 se STEJNOU generickou hláškou (anti-enumerace)", async () => {
    const res = await login("neexistujici-user", TEST_PASSWORD);
    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Nesprávné uživatelské jméno nebo heslo.");
  });

  test("zabanovaný uživatel → 403 + code ACCOUNT_BANNED", async () => {
    const passwordHash = await hashPassword(TEST_PASSWORD);
    const banned = await prisma.user.create({
      data: {
        username: "banned-a",
        email: "banned-a@example.test",
        passwordHash,
        color: "#5d9b62",
        role: "user",
        cabinId: world.cabinA.id,
        isVerified: true,
        isEmailVerified: true,
        isBanned: true,
      },
    });

    const res = await login(banned.username, TEST_PASSWORD);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "ACCOUNT_BANNED");
  });

  test("neověřený uživatel (s verificationToken) → 403 + needsVerification, žádný e-mail", async () => {
    const passwordHash = await hashPassword(TEST_PASSWORD);
    const unverified = await prisma.user.create({
      data: {
        username: "unverified-a",
        email: "unverified-a@example.test",
        passwordHash,
        color: "#5d9b62",
        role: "user",
        cabinId: world.cabinA.id,
        isVerified: false,
        isEmailVerified: false,
        verificationToken: rawToken(),
      },
    });

    const res = await login(unverified.username, TEST_PASSWORD);
    assert.equal(res.status, 403);
    assert.equal(res.body.needsVerification, true);
  });
});

describe("auth: jen ověření odkazem, žádný legacy PIN (#476)", () => {
  async function unverifiedUser(username: string, role: string, verificationToken: string | null) {
    return prisma.user.create({
      data: {
        username,
        email: `${username}@example.test`,
        passwordHash: await hashPassword(TEST_PASSWORD),
        color: "#5d9b62",
        role,
        cabinId: world.cabinA.id,
        isVerified: false,
        isEmailVerified: false,
        verificationToken,
      },
    });
  }

  test("POST /api/verify-email → 404 (endpoint zrušen)", async () => {
    const res = await request(app).post("/api/verify-email").send({ username: world.memberA.username, code: "123456" });
    assert.equal(res.status, 404);
  });

  test("neověřený admin se nepřihlásí a dostane stejnou hlášku jako neověřený člen", async () => {
    const admin = await unverifiedUser("unverified-admin-a", "admin", rawToken());
    const member = await unverifiedUser("unverified-member-a", "user", rawToken());

    const adminRes = await login(admin.username, TEST_PASSWORD);
    const memberRes = await login(member.username, TEST_PASSWORD);

    assert.equal(adminRes.status, 403);
    assert.equal(adminRes.body.token, undefined);
    assert.equal(adminRes.body.needsVerification, true);
    assert.equal(adminRes.status, memberRes.status);
    assert.equal(adminRes.body.message, memberRes.body.message);
  });

  test("neověřený účet bez verificationToken (dřív PIN větev) → 403 needsVerification, žádný PIN", async () => {
    const legacy = await unverifiedUser("legacy-no-token-a", "user", null);

    const res = await login(legacy.username, TEST_PASSWORD);

    assert.equal(res.status, 403);
    assert.equal(res.body.needsVerification, true);
    assert.equal(res.body.testCode, undefined);
    const stored = await prisma.user.findUnique({ where: { id: legacy.id } });
    assert.equal(stored?.verificationCode, null);
  });

  test("uživatel založený adminem chaty se rovnou přihlásí", async () => {
    const created = await as(app, world.adminA).post("/api/users").send({ username: "zalozeny-adminem-a", password: NEW_PASSWORD });
    assert.equal(created.status, 201);

    const res = await login("zalozeny-adminem-a", NEW_PASSWORD);
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.token, "string");
    assert.equal(res.body.cabinId, world.cabinA.id);
  });
});

describe("auth verify-token (GET /api/verify-token)", () => {
  test("platný token → 200 a user se poté aktivuje (login projde 200)", async () => {
    const passwordHash = await hashPassword(TEST_PASSWORD);
    const token = rawToken();
    const user = await prisma.user.create({
      data: {
        username: "verify-me-a",
        email: "verify-me-a@example.test",
        passwordHash,
        color: "#5d9b62",
        role: "user",
        cabinId: world.cabinA.id,
        isVerified: false,
        isEmailVerified: false,
        verificationToken: token,
      },
    });

    // Před ověřením login selže (403, needsVerification).
    const before = await login(user.username, TEST_PASSWORD);
    assert.equal(before.status, 403);
    assert.equal(before.body.needsVerification, true);

    const verify = await request(app).get("/api/verify-token").query({ token });
    assert.equal(verify.status, 200);

    // DB stav: user je aktivní, token vynulován.
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(updated?.isVerified, true);
    assert.equal(updated?.verificationToken, null);

    // Po ověření login projde.
    const after = await login(user.username, TEST_PASSWORD);
    assert.equal(after.status, 200);
    assert.equal(typeof after.body.token, "string");
  });

  test("neplatný/neexistující token → 400", async () => {
    const res = await request(app).get("/api/verify-token").query({ token: "neexistujici-token" });
    assert.equal(res.status, 400);
  });

  test("chybějící token → 400", async () => {
    const res = await request(app).get("/api/verify-token");
    assert.equal(res.status, 400);
  });

  // Mimo rozsah: prošlý verify token nelze otestovat – verificationToken nemá expirační pole (jen platný/neplatný/chybějící).
});

describe("auth forgot-password (POST /api/forgot-password)", () => {
  test("existující identifier → 200 generická hláška", async () => {
    const res = await request(app).post("/api/forgot-password").send({ identifier: world.memberA.username });
    assert.equal(res.status, 200);
    assert.match(res.body.message, /Pokud účet existuje/);
  });

  test("neexistující identifier → 200 STEJNÁ generická hláška (anti-enumerace)", async () => {
    const existing = await request(app).post("/api/forgot-password").send({ identifier: world.memberA.username });
    const missing = await request(app).post("/api/forgot-password").send({ identifier: "nikdo@nikde.test" });
    assert.equal(missing.status, 200);
    assert.equal(missing.body.message, existing.body.message);
  });
});

describe("auth reset-password (POST /api/reset-password)", () => {
  async function userWithResetToken(username: string, expiresAt: Date) {
    const passwordHash = await hashPassword(TEST_PASSWORD);
    const raw = rawToken();
    const user = await prisma.user.create({
      data: {
        username,
        email: `${username}@example.test`,
        passwordHash,
        color: "#5d9b62",
        role: "user",
        cabinId: world.cabinA.id,
        isVerified: true,
        isEmailVerified: true,
        passwordResetToken: hashToken(raw),
        passwordResetExpiresAt: expiresAt,
      },
    });
    return { user, raw };
  }

  test("platný token → 200, nové heslo funguje na login, token vynulován", async () => {
    const { user, raw } = await userWithResetToken("reset-ok-a", new Date(Date.now() + 60 * 60 * 1000));

    const res = await request(app).post("/api/reset-password").send({ token: raw, password: NEW_PASSWORD });
    assert.equal(res.status, 200);

    // Token je vynulován.
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(updated?.passwordResetToken, null);
    assert.equal(updated?.passwordResetExpiresAt, null);

    // Nové heslo funguje, staré ne.
    const withNew = await login(user.username, NEW_PASSWORD);
    assert.equal(withNew.status, 200);
    const withOld = await login(user.username, TEST_PASSWORD);
    assert.equal(withOld.status, 401);
  });

  test("neplatný token → 400, heslo se nezmění", async () => {
    const { user } = await userWithResetToken("reset-bad-a", new Date(Date.now() + 60 * 60 * 1000));

    // 64hex token, který ale neodpovídá žádnému uloženému hashi.
    const res = await request(app).post("/api/reset-password").send({ token: rawToken(), password: NEW_PASSWORD });
    assert.equal(res.status, 400);

    // Původní heslo stále platí.
    const stillOld = await login(user.username, TEST_PASSWORD);
    assert.equal(stillOld.status, 200);
  });

  test("prošlý token → 400, heslo se nezmění", async () => {
    const { user, raw } = await userWithResetToken("reset-expired-a", new Date(Date.now() - 1000));

    const res = await request(app).post("/api/reset-password").send({ token: raw, password: NEW_PASSWORD });
    assert.equal(res.status, 400);

    // Nové heslo NEfunguje, staré stále platí.
    const withNew = await login(user.username, NEW_PASSWORD);
    assert.equal(withNew.status, 401);
    const withOld = await login(user.username, TEST_PASSWORD);
    assert.equal(withOld.status, 200);
  });
});

// Mimo rozsah (faktická omezení):
// - Logout: backend endpoint neexistuje (stateless JWT), netestuje se.
// - Prošlý verify token: verificationToken nemá expirační pole, nelze otestovat.
