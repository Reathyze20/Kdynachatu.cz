import "./env"; // musí zůstat první import
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import prisma from "../../utils/prisma";
import { setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";
import { runDiaryDateFix } from "../../scripts/diaryDateFix";

let world: TestWorld;
let marker: string;
const range = { since: new Date("2026-04-03T14:16:55Z"), until: new Date("2026-11-28T09:30:00Z") };

async function folder(author: TestUser): Promise<string> {
  const data = { name: "Léto", createdById: author.id, cabinId: author.cabinId, startDate: new Date("2026-07-10"), endDate: new Date("2026-07-12") };
  return (await prisma.diaryFolder.create({ data })).id;
}

async function entry(author: TestUser, folderId: string, date: string, createdAt: string): Promise<string> {
  const data = { folderId, authorId: author.id, entryDate: new Date(date), content: "Zápis", createdAt: new Date(createdAt) };
  return (await prisma.diaryEntry.create({ data })).id;
}

async function dates(): Promise<Record<string, string>> {
  const rows = await prisma.diaryEntry.findMany({ select: { id: true, entryDate: true } });
  return Object.fromEntries(rows.map((r) => [r.id, r.entryDate.toISOString().slice(0, 10)]));
}

before(async () => ({ world } = await setupIntegrationFile()));
beforeEach(async () => {
  await prisma.diaryFolder.deleteMany();
  marker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "diary-fix-")), "maintenance", "marker.json");
});
after(teardownIntegrationFile);

test("diary date fix: dry run writes nothing, the real run shifts both cabins once, a second run does nothing", async () => {
  const [folderA, folderB] = [await folder(world.memberA), await folder(world.memberB)];
  const legacyA = await entry(world.memberA, folderA, "2026-07-12", "2026-03-30T08:00:00Z");
  const buggyA = await entry(world.memberA, folderA, "2026-07-09", "2026-07-10T20:00:00Z");
  const buggyB = await entry(world.memberB, folderB, "2026-07-11", "2026-07-12T20:00:00Z");
  const fixedB = await entry(world.memberB, folderB, "2026-07-10", "2026-11-28T10:00:00Z");
  const original = await dates();
  const dry = await runDiaryDateFix(prisma, { ...range, dryRun: true }, marker);
  assert.deepEqual(dry.plan.shifts.map((s) => [s.id, s.cabinId, s.to]), [[buggyA, world.cabinA.id, "2026-07-10"], [buggyB, world.cabinB.id, "2026-07-12"]]);
  assert.deepEqual(await dates(), original);
  assert.equal(fs.existsSync(marker), false);
  assert.equal((await runDiaryDateFix(prisma, { ...range, dryRun: false }, marker)).applied, true);
  const fixed = { [legacyA]: "2026-07-12", [buggyA]: "2026-07-10", [buggyB]: "2026-07-12", [fixedB]: "2026-07-10" };
  assert.deepEqual(await dates(), fixed);
  assert.deepEqual(JSON.parse(fs.readFileSync(marker, "utf8")).shifted.map((s: { id: string }) => s.id), [buggyA, buggyB]);

  assert.equal((await runDiaryDateFix(prisma, { ...range, dryRun: true }, marker)).plan.shifts.length, 0);
  assert.equal((await runDiaryDateFix(prisma, { ...range, dryRun: false }, marker)).applied, false);
  assert.deepEqual(await dates(), fixed);
});

test("diary date fix: one conflict stops the whole run, nothing moves and no marker is written", async () => {
  const [folderA, folderB] = [await folder(world.memberA), await folder(world.memberB)];
  await entry(world.memberB, folderB, "2026-07-09", "2026-07-10T20:00:00Z");
  await entry(world.memberA, folderA, "2026-07-11", "2026-03-30T08:00:00Z");
  const collides = await entry(world.memberA, folderA, "2026-07-10", "2026-07-11T20:00:00Z");
  const original = await dates();

  const report = await runDiaryDateFix(prisma, { ...range, dryRun: false }, marker);
  assert.equal(report.applied, false);
  assert.equal(report.plan.problems.length, 1);
  assert.match(report.plan.problems[0], new RegExp(`zápis ${collides} .*na den 2026-07-11 už je neposouvaný zápis`));
  assert.deepEqual(await dates(), original);
  assert.equal(fs.existsSync(marker), false);
});
