/**
 * Čisté části spouštěče tenant mutací (#365, `npm run test:tenant-mutations`): timeout, klasifikace
 * mutanta, formát výpisu a exit kód. Žádný disk, proces ani DB – to dělá
 * `src/scripts/runTenantMutations.ts`.
 */
import path from "node:path";
import { exceptionFor, type RouteItestMap, type TenantMutantException } from "./tenantMutantRegistry";
import type { TenantMutant } from "./tenantMutants";

/** Spodní hranice timeoutu mutanta: start tsx + import aplikace trvá i bez testů desítky sekund. */
export const MIN_MUTANT_TIMEOUT_MS = 60_000;

/** Timeout mutanta = 3× doba kontrolního běhu téže skupiny itestů, minimálně 60 s. */
export function mutantTimeoutMs(controlMs: number): number {
  return Math.max(3 * controlMs, MIN_MUTANT_TIMEOUT_MS);
}

export type MutantResult =
  | { kind: "killed" }
  | { kind: "killed-timeout" }
  | { kind: "survived" }
  | { kind: "survived-untested" }
  | { kind: "exception"; reason: string };

/** Jak dopadl běh itestů nad mutantem. */
export type TestOutcome = "failed" | "passed" | "timeout";

/** Buď je výsledek jasný bez spouštění (výjimka, bez testu), nebo itesty, které se mají pustit. */
export type MutantPlan = { result: MutantResult } | { itests: readonly string[] };

export function planMutant(mutant: TenantMutant, map: RouteItestMap, exceptions: readonly TenantMutantException[]): MutantPlan {
  const exception = exceptionFor(mutant, exceptions);
  if (exception) return { result: { kind: "exception", reason: exception.reason } };
  const itests = map[path.posix.basename(mutant.file)];
  // Kontrola registrů běží před plánováním, sem se soubor bez záznamu nedostane.
  if (!itests) throw new Error(`${mutant.file}: chybí v ROUTE_ITEST_MAP.`);
  return itests.length === 0 ? { result: { kind: "survived-untested" } } : { itests };
}

export function resultOfOutcome(outcome: TestOutcome): MutantResult {
  if (outcome === "failed") return { kind: "killed" };
  if (outcome === "timeout") return { kind: "killed-timeout" };
  return { kind: "survived" };
}

const LABELS: Record<Exclude<MutantResult["kind"], "exception">, string> = {
  killed: "zabit",
  "killed-timeout": "zabit (timeout)",
  survived: "přežil",
  "survived-untested": "přežil – bez testu",
};

const resultLabel = (result: MutantResult) => (result.kind === "exception" ? `výjimka (${result.reason})` : LABELS[result.kind]);

const locationOf = (mutant: TenantMutant) => `${mutant.file}:${mutant.line}`;
const routeOf = (mutant: TenantMutant) => mutant.route ?? "(bez routy)";

export type ColumnWidths = { location: number; route: number };

/** Šířky sloupců předem (řádky se tisknou průběžně). Routu helperu (víc rout) nezarovnává nad 40 znaků. */
export function columnWidths(mutants: readonly TenantMutant[]): ColumnWidths {
  const widest = (texts: string[]) => Math.max(0, ...texts.map((t) => t.length));
  return { location: widest(mutants.map(locationOf)), route: Math.min(40, widest(mutants.map(routeOf))) };
}

/** `src/backend/routes/notes.ts:177  GET /api/notes/:id  zabit` */
export function formatMutantLine(mutant: TenantMutant, result: MutantResult, widths: ColumnWidths): string {
  return `${locationOf(mutant).padEnd(widths.location)}  ${routeOf(mutant).padEnd(widths.route)}  ${resultLabel(result)}`;
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

export function formatSummary(results: readonly MutantResult[], durationMs: number): string {
  const count = (kind: MutantResult["kind"]) => results.filter((r) => r.kind === kind).length;
  const counts = (Object.keys(LABELS) as (keyof typeof LABELS)[]).map((kind) => `${LABELS[kind]} ${count(kind)}`);
  return `Souhrn: ${results.length} mutantů – ${[...counts, `výjimka ${count("exception")}`].join(", ")}. Doba běhu: ${formatDuration(durationMs)}.`;
}

/**
 * 1, když přežil mutant mimo výjimky (včetně „bez testu“), jinak 0. Selhání kontroly registrů
 * a kontrolního běhu ukončí spouštěč s 1 dřív, než se k výsledkům mutantů dojde.
 */
export function exitCodeFor(results: readonly MutantResult[]): 0 | 1 {
  return results.some((r) => r.kind === "survived" || r.kind === "survived-untested") ? 1 : 0;
}
