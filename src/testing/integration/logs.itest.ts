import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { Express } from "express";
import { LOGS_DIR } from "../../utils/logger";
import { as, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";

// Tenant kontrakt čtení logů `/api/logs` (#416): správce chaty A vidí jen záznamy své chaty – se
// `cabinId` chaty A, nebo bez chaty, ale od člena A (`userId`/`actorId`, např. hlášení z frontendu).
// Záznamy členů chaty B bez `cabinId` se pro A nesmí ukázat ani přes filtr `userId`. Logy nemají
// zdroj s ID, takže tu není případ „cizí ID → 404“; tenant hranice je filtr seznamu.
// Logy se v testech do souboru nezapisují (NODE_ENV=test), fixture je proto ručně napsaný soubor
// pevného dne v `LOGS_DIR`, mimo rozsah skutečných logů; po testech se smaže.

const LOG_DATE = "2000-01-01";
const logFile = path.join(LOGS_DIR, `${LOG_DATE}.log`);
let createdLogsDir = false;

let app: Express;
let world: TestWorld;

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  const { cabinA, cabinB, adminA, memberA, adminB, memberB } = world;

  if (fs.existsSync(logFile)) throw new Error(`Fixture logů ${logFile} už existuje – nepřepisuji cizí soubor.`);
  createdLogsDir = !fs.existsSync(LOGS_DIR);
  fs.mkdirSync(LOGS_DIR, { recursive: true });

  const records = [
    { msg: "A: request v chatě A", cabinId: cabinA.id, actorId: adminA.id },
    { msg: "A: frontend člena A", userId: memberA.id, source: "frontend" },
    { msg: "A: akce člena A", actorId: memberA.id },
    { msg: "B: request v chatě B", cabinId: cabinB.id, actorId: memberB.id },
    { msg: "B: frontend člena B", userId: memberB.id, source: "frontend" },
    { msg: "B: akce správce B", actorId: adminB.id },
    { msg: "systém bez chaty a uživatele" },
  ];
  const lines = records.map((record, index) => JSON.stringify({ time: `${LOG_DATE}T10:00:0${index}.000Z`, level: "info", ...record }));
  fs.writeFileSync(logFile, `${lines.join("\n")}\n`);
});

after(async () => {
  fs.rmSync(logFile, { force: true });
  if (createdLogsDir && fs.readdirSync(LOGS_DIR).length === 0) fs.rmdirSync(LOGS_DIR);
  await teardownIntegrationFile();
});

const readLogs = async (user: TestUser, query = "") => {
  const res = await as(app, user).get(`/api/logs?date=${LOG_DATE}${query}`);
  assert.equal(res.status, 200);
  return res.body as { date: string; count: number; logs: { msg: string }[] };
};

// Nejnovější první (route vrací záznamy dne pozpátku).
const messages = (body: { logs: { msg: string }[] }) => body.logs.map((record) => record.msg);

describe("logs: GET /api/logs for cabin A admin lists only cabin A records", () => {
  test("cabin B records without cabinId are left out, own members' records are in", async () => {
    const body = await readLogs(world.adminA);
    assert.deepEqual(messages(body), ["A: akce člena A", "A: frontend člena A", "A: request v chatě A"]);
    assert.equal(body.count, 3);
    assert.equal(body.date, LOG_DATE);
  });

  test("filtering by a cabin B member's userId returns nothing", async () => {
    assert.deepEqual(messages(await readLogs(world.adminA, `&userId=${world.memberB.id}`)), []);
    assert.deepEqual(messages(await readLogs(world.adminA, `&userId=${world.adminB.id}`)), []);
  });

  test("control: cabin B admin sees cabin B records, none of cabin A", async () => {
    assert.deepEqual(messages(await readLogs(world.adminB)), ["B: akce správce B", "B: frontend člena B", "B: request v chatě B"]);
  });

  test("a cabin A member without admin role gets 403", async () => {
    const res = await as(app, world.memberA).get(`/api/logs?date=${LOG_DATE}`);
    assert.equal(res.status, 403);
  });
});
