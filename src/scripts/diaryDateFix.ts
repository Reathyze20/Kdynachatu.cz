/**
 * Jádro jednorázové opravy dat deníku (#185). Frontend-v2 stavěl klíč dne přes `setHours(0)` + `toISOString()`,
 * takže v Europe/Prague uložil každý zápis pod „zobrazený den − 1“. Týká se zápisů s `created_at` od prvního
 * produkčního nasazení frontend-v2 (commit 7eb9cf2, běh Deploy 2026-04-03 14:16:55 UTC) do nasazení opravy (`--until`).
 * Ostrý běh je jedna transakce; při problému se nezapíše nic. Posledním krokem je značka (JSON se seznamem
 * posunutých zápisů, i pro rollback); když existuje, skript nic neposune.
 */import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "../generated/prisma/client.js";

export const DIARY_DATE_FIX_DEFAULT_SINCE = "2026-04-03T14:16:55Z";
export const DIARY_DATE_FIX_MARKER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/maintenance/diary-date-fix-185.json");
const NO_CABIN = "(bez chaty)";
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export interface DiaryDateFixOptions { dryRun: boolean; since: Date; until: Date }
/** Zápis s termínem pobytu; data jsou kalendářní dny "YYYY-MM-DD". */
export interface DiaryEntryRow { id: string; folderId: string; cabinId: string | null; entryDate: string; createdAt: Date; folderStart: string | null; folderEnd: string | null }
export interface DiaryDateShift { id: string; folderId: string; cabinId: string | null; createdAt: Date; from: string; to: string }
export interface DiaryDateFixPlan { shifts: DiaryDateShift[]; beforeSince: number; afterUntil: DiaryEntryRow[]; problems: string[] }
export interface DiaryDateFixReport { options: DiaryDateFixOptions; plan: DiaryDateFixPlan; alreadyApplied: { appliedAt: string; shifted: unknown[] } | null; applied: boolean; markerPath: string }

function parseInstant(flag: string, value: string | undefined): Date {
  if (!value || !ISO_INSTANT.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${flag} potřebuje okamžik v ISO 8601 i s časovou zónou, třeba 2026-11-28T09:30:00Z.`);
  }
  return new Date(value);
}

export function parseDiaryDateFixArgs(argv: string[], now: Date = new Date()): DiaryDateFixOptions {
  let dryRun = false;
  let since = new Date(DIARY_DATE_FIX_DEFAULT_SINCE);
  let until: Date | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") dryRun = true;
    else if (argv[i] === "--since") since = parseInstant("--since", argv[++i]);
    else if (argv[i] === "--until") until = parseInstant("--until", argv[++i]);
    else throw new Error(`Neznámý argument: ${argv[i]}. Povolené jsou --dry-run, --until <čas>, --since <čas>.`);
  }
  if (!until) throw new Error("Chybí --until <čas>: okamžik, kdy na produkci naběhla verze s opravou #185.");
  if (until > now) throw new Error("--until nesmí být v budoucnosti.");
  if (since >= until) throw new Error("--since musí být dřív než --until.");
  return { dryRun, since, until };
}

/** Posun kalendářního dne "YYYY-MM-DD" o `n` dní (v UTC, bez vlivu letního času). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Čistý výpočet: které zápisy posunout o +1 den a co by posun rozbilo. */
export function planDiaryDateFix(rows: DiaryEntryRow[], range: { since: Date; until: Date }): DiaryDateFixPlan {
  const isAffected = (row: DiaryEntryRow) => row.createdAt >= range.since && row.createdAt < range.until;
  // Neposouvané zápisy zůstanou, kde jsou; posunutý zápis nesmí přistát na jejich dni.
  const staying = new Map(rows.filter((r) => !isAffected(r)).map((r) => [`${r.folderId}|${r.entryDate}`, r.id]));
  const shifts: DiaryDateShift[] = [];
  const problems: string[] = [];
  for (const row of rows.filter(isAffected)) {
    const to = addDays(row.entryDate, 1);
    shifts.push({ id: row.id, folderId: row.folderId, cabinId: row.cabinId, createdAt: row.createdAt, from: row.entryDate, to });
    const label = `zápis ${row.id} (chata ${row.cabinId ?? NO_CABIN})`;
    if (!row.folderStart || !row.folderEnd) problems.push(`${label}: pobyt nemá termín, posun nejde ověřit`);
    else if (to < row.folderStart || to > row.folderEnd) problems.push(`${label}: po posunu na ${to} by ležel mimo pobyt ${row.folderStart} – ${row.folderEnd}`);
    const blocker = staying.get(`${row.folderId}|${to}`);
    if (blocker) problems.push(`${label}: na den ${to} už je neposouvaný zápis ${blocker}`);
  }
  return { shifts, beforeSince: rows.filter((r) => r.createdAt < range.since).length, afterUntil: rows.filter((r) => r.createdAt >= range.until), problems };
}

async function loadRows(db: Pick<PrismaClient, "diaryEntry">): Promise<DiaryEntryRow[]> {
  const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);
  const entries = await db.diaryEntry.findMany({
    select: { id: true, folderId: true, entryDate: true, createdAt: true, folder: { select: { cabinId: true, startDate: true, endDate: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return entries.map((e) => ({
    id: e.id, folderId: e.folderId, cabinId: e.folder.cabinId, entryDate: day(e.entryDate)!, createdAt: e.createdAt,
    folderStart: day(e.folder.startDate), folderEnd: day(e.folder.endDate),
  }));
}

/** Dry run jen spočítá plán. Ostrý běh v jedné transakci posune zápisy a zapíše značku; s problémy v plánu nezapíše nic. */
export async function runDiaryDateFix(prisma: PrismaClient, options: DiaryDateFixOptions, markerPath = DIARY_DATE_FIX_MARKER): Promise<DiaryDateFixReport> {
  const base = { options, alreadyApplied: null, applied: false, markerPath };
  const marker = await fs.readFile(markerPath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (marker) return { ...base, plan: { shifts: [], beforeSince: 0, afterUntil: [], problems: [] }, alreadyApplied: JSON.parse(marker) };
  if (options.dryRun) return { ...base, plan: planDiaryDateFix(await loadRows(prisma), options) };

  return prisma.$transaction(async (tx) => {
    const report: DiaryDateFixReport = { ...base, plan: planDiaryDateFix(await loadRows(tx), options) };
    if (report.plan.problems.length > 0) return report;
    for (const s of report.plan.shifts) {
      const { count } = await tx.diaryEntry.updateMany({
        where: { id: s.id, folderId: s.folderId, entryDate: new Date(s.from) },
        data: { entryDate: new Date(s.to) },
      });
      if (count !== 1) throw new Error(`Zápis ${s.id} se během opravy změnil. Nic se nezapsalo, spusť skript znovu.`);
    }
    const shifted = report.plan.shifts.map(({ id, cabinId, folderId, from, to }) => ({ id, cabinId, folderId, from, to }));
    const content = { appliedAt: new Date().toISOString(), since: options.since.toISOString(), until: options.until.toISOString(), shifted };
    await fs.mkdir(path.dirname(markerPath), { recursive: true });
    // "wx": souběžný druhý běh značku nepřepíše a jeho transakce se vrátí.
    await fs.writeFile(markerPath, JSON.stringify(content, null, 2) + "\n", { flag: "wx" });
    return { ...report, applied: true };
  }, { timeout: 60_000 });
}

export function formatDiaryDateFixReport(report: DiaryDateFixReport): string {
  const { options, plan, alreadyApplied } = report;
  const lines = [
    `Oprava dat deníku (#185)${options.dryRun ? " – DRY RUN, nic se nezapíše" : ""}`,
    `Hranice created_at: od ${options.since.toISOString()} do ${options.until.toISOString()}`,
  ];
  if (alreadyApplied) {
    lines.push(`Oprava už proběhla ${alreadyApplied.appliedAt} (posunuto ${alreadyApplied.shifted.length} zápisů), značka ${report.markerPath}.`, "K posunu: 0");
    return lines.join("\n");
  }
  const cabins = [...new Set(plan.shifts.map((s) => s.cabinId ?? NO_CABIN))].sort();
  for (const cabin of cabins) {
    const shifts = plan.shifts.filter((s) => (s.cabinId ?? NO_CABIN) === cabin);
    lines.push(`Chata ${cabin}: k posunu ${shifts.length}`, ...shifts.map((s) => `  ${s.id}  ${s.from} → ${s.to}  (vytvořeno ${s.createdAt.toISOString()})`));
  }
  lines.push(`Před hranicí (beze změny): ${plan.beforeSince}`, `Vytvořeno od --until (beze změny): ${plan.afterUntil.length}`);
  lines.push(...plan.afterUntil.map((r) => `  ${r.id}  chata ${r.cabinId ?? NO_CABIN}  ${r.entryDate}  (vytvořeno ${r.createdAt.toISOString()})`));
  lines.push(`Problémy: ${plan.problems.length}${plan.problems.length ? " – s problémy ostrý běh nic nezapíše" : ""}`, ...plan.problems.map((p) => `  ${p}`));
  lines.push(report.applied ? `Posunuto: ${plan.shifts.length}
Značka zapsána: ${report.markerPath}` : `K posunu: ${plan.shifts.length}`);
  return lines.join("\n");
}
