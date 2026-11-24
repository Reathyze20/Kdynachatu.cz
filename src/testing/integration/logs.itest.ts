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
let createdLogFile = false;

let app: Express;
let world: TestWorld;

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  const { cabinA, cabinB, adminA, memberA, adminB, memberB } = world;

  if (fs.existsSync(logFile)) throw new Error(`Fixture logů ${logFile} už existuje – nepřepisuji cizí soubor.`);
  createdLogsDir = !fs.existsSync(LOGS_DIR);
  fs.mkdirSync(LOGS_DIR, { recursive: true });

  const records = [
    { msg: "A: úloha chaty A bez uživatele", cabinId: cabinA.id },
    { msg: "A: request správce A", cabinId: cabinA.id, actorId: adminA.id },
    { msg: "A: frontend člena A", userId: memberA.id, source: "frontend" },
    { msg: "A: akce člena A", actorId: memberA.id },
    { msg: "B: request v chatě B", cabinId: cabinB.id, actorId: memberB.id },
    { msg: "B: frontend člena B", userId: memberB.id, source: "frontend" },
    { msg: "B: akce správce B", actorId: adminB.id },
    { msg: "systém bez chaty a uživatele" },
  ];
  const time = (index: number) => `${LOG_DATE}T10:00:${String(index).padStart(2, "0")}.000Z`;
  const lines = records.map((record, index) => JSON.stringify({ time: time(index), level: "info", ...record }));
  fs.writeFileSync(logFile, `${lines.join("\n")}\n`);
  createdLogFile = true;
});

after(async () => {
  if (createdLogFile) fs.rmSync(logFile, { force: true });
  if (createdLogsDir && fs.readdirSync(LOGS_DIR).length === 0) fs.rmdirSync(LOGS_DIR);
  await teardownIntegrationFile();
});

const logsGet = (user: TestUser, query = "") => as(app, user).get(`/api/logs?date=${LOG_DATE}${query}`);

const listLogs = async (user: TestUser, query = "") => {
  const res = await logsGet(user, query);
  assert.equal(res.status, 200);
  return res.body as { date: string; count: number; logs: { msg: string }[] };
};

// Nejnovější první (route vrací záznamy dne pozpátku).
const messages = (body: { logs: { msg: string }[] }) => body.logs.map((record) => record.msg);

describe("logs: GET /api/logs for cabin A admin lists only cabin A records", () => {
  test("cabin B records without cabinId are left out, own cabin and members' records are in", async () => {
    const body = await listLogs(world.adminA);
    assert.deepEqual(messages(body), [
      "A: akce člena A", "A: frontend člena A", "A: request správce A", "A: úloha chaty A bez uživatele",
    ]);
    assert.equal(body.count, 4);
    assert.equal(body.date, LOG_DATE);
  });

  test("filtering by userId: a cabin B member returns nothing, an own member their records", async () => {
    assert.deepEqual(messages(await listLogs(world.adminA, `&userId=${world.memberB.id}`)), []);
    assert.deepEqual(messages(await listLogs(world.adminA, `&userId=${world.adminB.id}`)), []);
    assert.deepEqual(messages(await listLogs(world.adminA, `&userId=${world.memberA.id}`)), ["A: akce člena A", "A: frontend člena A"]);
  });

  test("control: cabin B admin sees cabin B records, none of cabin A", async () => {
    assert.deepEqual(messages(await listLogs(world.adminB)), ["B: akce správce B", "B: frontend člena B", "B: request v chatě B"]);
  });

  test("a cabin A member without admin role gets 403", async () => {
    assert.equal((await logsGet(world.memberA)).status, 403);
  });
});
