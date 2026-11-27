import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { as, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";

// Preference Přehledu patří uživateli z tokenu, ne chatě (#681): GET /users/me je vrací,
// PATCH /users/me je slučuje s uloženými a nikdy nesáhne na jiného uživatele.

let app: Express;
let world: TestWorld;

before(async () => {
  ({ app, world } = await setupIntegrationFile());
});

after(teardownIntegrationFile);

const getMe = (user: TestUser) => as(app, user).get("/api/users/me");
const patchMe = (user: TestUser, body: Record<string, unknown>) => as(app, user).patch("/api/users/me").send(body);
const storedPrefs = async (user: TestUser) =>
  (await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { dashboardPrefs: true } })).dashboardPrefs;

// Testy běží za sebou a navazují na stav memberA z předchozího testu (první uložení → sloučení → reset).
describe("dashboard preferences on /api/users/me (#681)", () => {
  test("a user who never set anything gets null", async () => {
    const res = await getMe(world.memberA);
    assert.equal(res.status, 200);
    assert.equal(res.body.dashboardPrefs, null);
  });

  test("PATCH stores the preferences for the caller only and GET returns them", async () => {
    const res = await patchMe(world.memberA, { dashboardPrefs: { weather: false, cabinScene: true, sceneMode: "static" } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.user.dashboardPrefs, { weather: false, cabinScene: true, sceneMode: "static" });

    assert.deepEqual((await getMe(world.memberA)).body.dashboardPrefs, { weather: false, cabinScene: true, sceneMode: "static" });
    // Nikdo jiný – ani ze stejné chaty – nic nedostal.
    assert.equal(await storedPrefs(world.adminA), null);
    assert.equal(await storedPrefs(world.memberB), null);
  });

  test("a later change is merged, a null key falls back to the default", async () => {
    const res = await patchMe(world.memberA, { dashboardPrefs: { noticeboard: true, sceneMode: null } });
    assert.equal(res.status, 200);
    assert.deepEqual((await getMe(world.memberA)).body.dashboardPrefs, { weather: false, cabinScene: true, noticeboard: true });
  });

  test("dashboardPrefs: null resets everything to the defaults", async () => {
    const res = await patchMe(world.memberA, { dashboardPrefs: null });
    assert.equal(res.status, 200);
    assert.equal((await getMe(world.memberA)).body.dashboardPrefs, null);
  });

  test("a cabinId in the body is ignored, the preferences stay on the caller", async () => {
    const res = await patchMe(world.memberB, { cabinId: world.cabinA.id, dashboardPrefs: { regionEvents: true } });
    assert.equal(res.status, 200);
    const memberB = await prisma.user.findUniqueOrThrow({ where: { id: world.memberB.id }, select: { cabinId: true, dashboardPrefs: true } });
    assert.equal(memberB.cabinId, world.cabinB.id);
    assert.deepEqual(memberB.dashboardPrefs, { regionEvents: true });
  });

  const invalid: [string, unknown][] = [
    ["an unknown key", { weather: true, quickLinks: true }],
    ["a cabinId inside the preferences", { cabinId: "cizi-chata" }],
    ["a string instead of a boolean", { weather: "false" }],
    ["an unknown scene mode", { sceneMode: "hidden" }],
    ["an array instead of an object", ["weather"]],
  ];

  for (const [name, dashboardPrefs] of invalid) {
    test(`${name} → 400 and nothing is saved`, async () => {
      await patchMe(world.adminB, { dashboardPrefs: { stayForecast: true } });
      const res = await patchMe(world.adminB, { dashboardPrefs });
      assert.equal(res.status, 400);
      assert.deepEqual(await storedPrefs(world.adminB), { stayForecast: true });
    });
  }
});
