import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, formatDiaryDateFixReport, parseDiaryDateFixArgs, planDiaryDateFix, type DiaryDateFixReport, type DiaryEntryRow } from "./diaryDateFix";

const NOW = new Date("2026-11-28T12:00:00Z");
const UNTIL = "2026-11-28T09:30:00Z";
const range = { since: new Date("2026-04-03T14:16:55Z"), until: new Date(UNTIL) };

function row(id: string, entryDate: string, createdAt: string, over: Partial<DiaryEntryRow> = {}): DiaryEntryRow {
  return { id, folderId: "f-1", cabinId: "cabin-a", entryDate, createdAt: new Date(createdAt), folderStart: "2026-07-10", folderEnd: "2026-07-12", ...over };
}

test("args: require --until, defaults --since to the first frontend-v2 deploy and rejects unknown arguments", () => {
  assert.throws(() => parseDiaryDateFixArgs(["--dry-run"], NOW), /Chybí --until/);
  assert.deepEqual(parseDiaryDateFixArgs(["--until", UNTIL, "--dry-run"], NOW), { dryRun: true, ...range });
  assert.equal(parseDiaryDateFixArgs(["--until", UNTIL], NOW).dryRun, false);
  assert.throws(() => parseDiaryDateFixArgs(["--dryrun", "--until", UNTIL], NOW), /Neznámý argument: --dryrun/);
});

test("args: instants need an explicit time zone and a sane order", () => {
  for (const bad of [["2026-11-28"], ["2026-11-28T09:30:00"], []]) assert.throws(() => parseDiaryDateFixArgs(["--until", ...bad], NOW), /časovou zónou/);
  assert.throws(() => parseDiaryDateFixArgs(["--until", "2026-11-29T00:00:00Z"], NOW), /budoucnosti/);
  assert.throws(() => parseDiaryDateFixArgs(["--until", "2026-04-01T00:00:00Z"], NOW), /--since musí být dřív/);
  const options = parseDiaryDateFixArgs(["--since", "2026-04-03T16:00:00+02:00", "--until", "2026-11-28T10:30:00+01:00"], NOW);
  assert.deepEqual([options.since.toISOString(), options.until.toISOString()], ["2026-04-03T14:00:00.000Z", "2026-11-28T09:30:00.000Z"]);
});

test("addDays crosses DST, month and year boundaries as plain calendar days", () => {
  assert.deepEqual(["2026-03-28", "2026-10-24", "2026-04-30", "2026-12-31"].map((d) => addDays(d, 1)), ["2026-03-29", "2026-10-25", "2026-05-01", "2027-01-01"]);
});

test("plan: shifts by one day only entries created in [since, until), consecutive ones without collisions", () => {
  const plan = planDiaryDateFix([
    row("legacy", "2026-03-01", "2026-04-03T14:16:54.999Z", { folderId: "f-0" }),
    row("first", "2026-07-09", "2026-04-03T14:16:55Z"),
    row("second", "2026-07-10", "2026-07-11T18:00:00Z"),
    row("last", "2026-07-11", "2026-07-12T18:00:00Z"),
    row("fixed", "2026-07-11", UNTIL, { folderId: "f-3" }),
  ], range);
  assert.deepEqual(plan.shifts.map((s) => [s.id, s.from, s.to]), [
    ["first", "2026-07-09", "2026-07-10"], ["second", "2026-07-10", "2026-07-11"], ["last", "2026-07-11", "2026-07-12"],
  ]);
  assert.equal(plan.beforeSince, 1);
  assert.deepEqual(plan.afterUntil.map((r) => r.id), ["fixed"]);
  assert.deepEqual(plan.problems, []);
});

test("plan: reports a shift onto an unshifted entry in the same stay, outside the stay, or without a stay", () => {
  const plan = planDiaryDateFix([
    row("legacy", "2026-07-10", "2026-03-30T08:00:00Z"),
    row("other-stay", "2026-07-13", "2026-03-30T08:00:00Z", { folderId: "f-9" }),
    row("collides", "2026-07-09", "2026-07-10T08:00:00Z"),
    row("past-end", "2026-07-12", "2026-07-12T08:00:00Z"),
    row("no-stay", "2026-07-01", "2026-07-02T08:00:00Z", { folderId: "f-2", cabinId: null, folderStart: null, folderEnd: null }),
  ], range);
  assert.equal(plan.problems.length, 3);
  assert.match(plan.problems[0], /zápis collides \(chata cabin-a\): na den 2026-07-10 už je neposouvaný zápis legacy/);
  assert.match(plan.problems[1], /zápis past-end .*2026-07-13 by ležel mimo pobyt 2026-07-10 – 2026-07-12/);
  assert.match(plan.problems[2], /zápis no-stay \(chata \(bez chaty\)\): pobyt nemá termín/);
});

const report = (over: Pick<DiaryDateFixReport, "plan"> & Partial<DiaryDateFixReport>): DiaryDateFixReport => ({ options: { ...range, dryRun: true }, alreadyApplied: null, applied: false, markerPath: "/m.json", ...over });

test("report: lists shifts per cabin with the old and new date", () => {
  const plan = planDiaryDateFix([row("b-1", "2026-07-09", "2026-07-10T08:00:00Z", { cabinId: "cabin-b", folderId: "f-b" }), row("a-1", "2026-07-11", "2026-07-12T08:00:00Z")], range);
  const text = formatDiaryDateFixReport(report({ plan }));
  assert.match(text, /Chata cabin-a: k posunu 1\n {2}a-1 {2}2026-07-11 → 2026-07-12/);
  assert.match(text, /Chata cabin-b: k posunu 1\n {2}b-1 {2}2026-07-09 → 2026-07-10/);
  assert.match(text, /^Oprava dat deníku \(#185\) – DRY RUN[^]*Problémy: 0\nK posunu: 2$/);
});

test("report: after an applied run it shows nothing to shift", () => {
  const plan = { shifts: [], beforeSince: 0, afterUntil: [], problems: [] };
  const text = formatDiaryDateFixReport(report({ plan, alreadyApplied: { appliedAt: "2026-11-28T10:00:00.000Z", shifted: [{}] } }));
  assert.match(text, /Oprava už proběhla 2026-11-28T10:00:00.000Z \(posunuto 1 zápisů\)[^]*K posunu: 0$/);
});
