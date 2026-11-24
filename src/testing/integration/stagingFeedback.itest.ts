import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import request from "supertest";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { UPLOADS_PATH } from "../../config/config";
import { createApp } from "../../backend/app";
import { runStagingSeed } from "../../scripts/seedStaging";
import { stagingFeedbackFilePath } from "../../backend/routes/stagingFeedbackStore";
import type { StagingFeedbackRecord } from "../../types";
import { as, setupIntegrationFile, teardownIntegrationFile, type TestWorld } from "./harness";

const PASSWORDS = { adminPassword: "integ-admin-heslo", memberPassword: "integ-clen-heslo" };
const STAGING_ENV = {
  DEPLOY_TARGET: "staging",
  STAGING_SEED_ADMIN_PASSWORD: PASSWORDS.adminPassword,
  STAGING_SEED_MEMBER_PASSWORD: PASSWORDS.memberPassword,
};
const feedbackFile = stagingFeedbackFilePath(UPLOADS_PATH);
const savedEnv = Object.fromEntries(Object.keys(STAGING_ENV).map((key) => [key, process.env[key]]));

let stagingApp: Express;
let productionApp: Express;
let world: TestWorld;

function readRecords(): StagingFeedbackRecord[] {
  if (!fs.existsSync(feedbackFile)) return [];
  return fs.readFileSync(feedbackFile, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

const body = (text: string) => ({ taskId: "prehled", text, screen: "/dashboard", viewportWidth: 360 });

before(async () => {
  fs.rmSync(feedbackFile, { force: true });
  // Brána stagingu se čte při createApp(): DEPLOY_TARGET=staging + DB s `test` v názvu + seed hesla
  Object.assign(process.env, STAGING_ENV);
  ({ app: stagingApp, world } = await setupIntegrationFile());
  delete process.env.DEPLOY_TARGET;
  productionApp = createApp({ enableRateLimits: false }).app;
});

after(async () => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(feedbackFile, { force: true });
  await teardownIntegrationFile();
});

describe("POST /api/staging-feedback", () => {
  test("stores text, user, cabin, task, screen, width and time; cabinId from the body is ignored", async () => {
    const res = await as(stagingApp, world.memberA)
      .post("/api/staging-feedback")
      .send({ ...body("  Nenašla jsem, kde je nákup.  "), cabinId: world.cabinB.id, userId: world.memberB.id });

    assert.equal(res.status, 201);
    const record = readRecords().find((r) => r.id === res.body.id);
    assert.ok(record, "záznam je v souboru");
    assert.equal(record.text, "Nenašla jsem, kde je nákup.");
    assert.equal(record.cabinId, world.cabinA.id);
    assert.equal(record.userId, world.memberA.id);
    assert.equal(record.username, world.memberA.username);
    assert.equal(record.taskId, "prehled");
    assert.equal(record.screen, "/dashboard");
    assert.equal(record.viewportWidth, 360);
    assert.ok(Math.abs(Date.parse(record.createdAt) - Date.now()) < 60_000);
  });

  test("rejects empty text, too long text and an unknown task", async () => {
    const before = readRecords().length;
    for (const invalid of [body("   "), body("x".repeat(2001)), { ...body("ok"), taskId: "neexistuje" }]) {
      const res = await as(stagingApp, world.memberA).post("/api/staging-feedback").send(invalid);
      assert.equal(res.status, 400);
    }
    assert.equal(readRecords().length, before);
  });

  test("anonymous request is refused and nothing is written", async () => {
    const before = readRecords().length;
    const res = await request(stagingApp).post("/api/staging-feedback").send(body("anonym"));
    assert.equal(res.status, 401);
    assert.equal(readRecords().length, before);
  });

  test("outside staging returns 404 and nothing is written", async () => {
    const before = readRecords().length;
    const res = await as(productionApp, world.memberA).post("/api/staging-feedback").send(body("mimo staging"));
    assert.equal(res.status, 404);
    assert.equal(readRecords().length, before);
  });

  test("feedback from the demo cabin survives another staging seed run", async () => {
    await runStagingSeed(prisma, { ...PASSWORDS, uploadsPath: UPLOADS_PATH });
    const demoUser = await prisma.user.findUniqueOrThrow({ where: { username: "demo-jana" } });
    const tester = { id: demoUser.id, username: demoUser.username, role: demoUser.role, cabinId: demoUser.cabinId as string };
    const res = await as(stagingApp, tester).post("/api/staging-feedback").send(body("Přežiju seed?"));
    assert.equal(res.status, 201);

    await runStagingSeed(prisma, { ...PASSWORDS, uploadsPath: UPLOADS_PATH });

    const record = readRecords().find((r) => r.id === res.body.id);
    assert.equal(record?.text, "Přežiju seed?");
    assert.equal(record?.cabinId, tester.cabinId);
  });
});
