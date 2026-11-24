import "./env"; // musí zůstat první import
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { UPLOADS_PATH } from "../../config/config";
import { createApp } from "../../backend/app";
import { runStagingSeed } from "../../scripts/seedStaging";
import { stagingFeedbackFilePath } from "../../backend/routes/stagingFeedback";
import type { StagingFeedbackRecord } from "../../types";
import { as, setupIntegrationFile, teardownIntegrationFile, type TestWorld } from "./harness";

const PASSWORDS = { adminPassword: "integ-admin-heslo", memberPassword: "integ-clen-heslo" };
const STAGING_ENV = { DEPLOY_TARGET: "staging", STAGING_SEED_ADMIN_PASSWORD: PASSWORDS.adminPassword, STAGING_SEED_MEMBER_PASSWORD: PASSWORDS.memberPassword };
const savedEnv = Object.fromEntries(Object.keys(STAGING_ENV).map((key) => [key, process.env[key]]));
const feedbackFile = stagingFeedbackFilePath(UPLOADS_PATH);
let stagingApp: Express;
let productionApp: Express;
let world: TestWorld;

const readRecords = (): StagingFeedbackRecord[] =>
  fs.existsSync(feedbackFile) ? fs.readFileSync(feedbackFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
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

test("staging feedback: stores all fields from the login, ignores cabinId from the body", async () => {
  const res = await as(stagingApp, world.memberA)
    .post("/api/staging-feedback")
    .send({ ...body("  Nenašla jsem nákup.  "), cabinId: world.cabinB.id, userId: world.memberB.id });

  assert.equal(res.status, 201);
  const { id, createdAt, ...rest } = readRecords().find((r) => r.id === res.body.id)!;
  assert.deepEqual(rest, {
    text: "Nenašla jsem nákup.", taskId: "prehled", screen: "/dashboard", viewportWidth: 360,
    cabinId: world.cabinA.id, userId: world.memberA.id, username: world.memberA.username,
  });
  assert.equal(id, res.body.id);
  assert.ok(Math.abs(Date.parse(createdAt) - Date.now()) < 60_000);
  // Mimo veřejně servírované uploady (/uploads)
  assert.ok(!feedbackFile.startsWith(path.resolve(UPLOADS_PATH) + path.sep));
});

test("staging feedback: empty/too long text, unknown task, anonymous and non-staging write nothing", async () => {
  const before = readRecords().length;
  for (const invalid of [body("   "), body("x".repeat(2001)), { ...body("ok"), taskId: "neexistuje" }]) {
    assert.equal((await as(stagingApp, world.memberA).post("/api/staging-feedback").send(invalid)).status, 400);
  }
  assert.equal((await request(stagingApp).post("/api/staging-feedback").send(body("anonym"))).status, 401);
  assert.equal((await as(productionApp, world.memberA).post("/api/staging-feedback").send(body("prod"))).status, 404);
  assert.equal(readRecords().length, before);
});

test("staging feedback: a demo cabin record survives another staging seed run", async () => {
  await runStagingSeed(prisma, { ...PASSWORDS, uploadsPath: UPLOADS_PATH });
  const jana = await prisma.user.findUniqueOrThrow({ where: { username: "demo-jana" } });
  const tester = { id: jana.id, username: jana.username, role: jana.role, cabinId: jana.cabinId as string };
  const res = await as(stagingApp, tester).post("/api/staging-feedback").send(body("Přežiju seed?"));
  assert.equal(res.status, 201);

  await runStagingSeed(prisma, { ...PASSWORDS, uploadsPath: UPLOADS_PATH });

  const record = readRecords().find((r) => r.id === res.body.id);
  assert.equal(record?.text, "Přežiju seed?");
  assert.equal(record?.cabinId, tester.cabinId);
});
