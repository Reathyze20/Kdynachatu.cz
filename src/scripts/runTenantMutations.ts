/**
 * `npm run test:tenant-mutations [-- notes.ts …]` — kontrola tenant izolace mutacemi (#361, #365).
 * Spouští se ručně před release tagem. Pro každého tenant mutanta v souborech rout pustí itesty
 * z `ROUTE_ITEST_MAP` a vypíše, které úniky dat mezi chatami žádný test nezachytí.
 *
 *  1. Kontrola registrů (mapa, výjimky) – při chybě konec dřív, než se cokoli spustí.
 *  2. Dočasná kopie projektu v os.tmpdir(): `src/`, `prisma/`, tsconfig, prisma.config.ts,
 *     `package.json`; `node_modules` jen odkazem (na Windows junction). Mutace se zapisují jen do
 *     kopie, do pracovního stromu nikdy. Kopie se maže ve `finally`, při SIGINT/SIGTERM i při `exit`.
 *  3. Jedna testovací DB a jedna migrace na celý běh (`withTestDatabase`, lokálně Docker 5433,
 *     jinak TEST_DATABASE_URL). Lokální DB na 5432 se nepoužije nikdy.
 *  4. Kontrolní běh bez mutací pro každou skupinu itestů; selhání = konec s chybou, bez mutantů.
 *  5. Mutanti sériově: zmutovaný soubor v kopii → itesty skupiny (timeout 3× kontrolní doba,
 *     min. 60 s) → obnova souboru. Výsledek na řádek, na konci souhrn a doba; exit kód 1 při
 *     přeživším mimo výjimky.
 * Volitelné argumenty = názvy souborů rout, na které se běh omezí (registry se kontrolují vždy celé).
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { projectRoot, withTestDatabase } from "../testing/integration/testDatabase";
import { checkMutantRegistries, itestFileNames, ROUTE_ITEST_MAP, TENANT_MUTANT_EXCEPTIONS } from "../testing/tenantMutantRegistry";
import { findRouteFileMutants, routeFileNames } from "../testing/tenantMutants";
import {
  columnWidths,
  exitCodeFor,
  formatMutantLine,
  formatSummary,
  mutantTimeoutMs,
  planMutant,
  resultOfOutcome,
  type MutantResult,
  type TestOutcome,
} from "../testing/tenantMutationRun";

const COPIED_ENTRIES = ["src", "prisma", "tsconfig.json", "prisma.config.ts", "package.json"];
const ITEST_DIR = "src/testing/integration";
/** Pojistka proti zaseknutému kontrolnímu běhu; ten pak selže jako každé jiné selhání. */
const CONTROL_TIMEOUT_MS = 10 * 60_000;

let copyDir: string | null = null;
let currentChild: ChildProcess | null = null;
let interrupted = false;

function createProjectCopy(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kdynachatu-mutations-"));
  copyDir = dir;
  for (const entry of COPIED_ENTRIES) fs.cpSync(path.join(projectRoot, entry), path.join(dir, entry), { recursive: true });
  // "junction" funguje na Windows bez admin práv; jinde Node typ ignoruje a vytvoří symlink adresáře.
  fs.symlinkSync(path.join(projectRoot, "node_modules"), path.join(dir, "node_modules"), "junction");
  return dir;
}

function removeProjectCopy(): void {
  if (!copyDir) return;
  const dir = copyDir;
  copyDir = null;
  // Odkaz nejdřív odpojit, ať rekurzivní mazání nikdy nesáhne do skutečných node_modules.
  try {
    fs.unlinkSync(path.join(dir, "node_modules"));
  } catch {
    // rmSync odkaz stejně jen odpojí (lstat ho vidí jako symlink)
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Cesta souboru v kopii; nikdy mimo ni (mutace nesmí skončit v pracovním stromu). */
function pathInCopy(root: string, relative: string): string {
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error(`${relative}: cesta mimo dočasnou kopii.`);
  return target;
}

function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL"); // detached → vlastní skupina procesů (i podprocesy node --test)
    } catch {
      child.kill("SIGKILL");
    }
  }
}

function checkInterrupted(): void {
  if (interrupted) throw new Error("Běh přerušen.");
}

interface ItestRun {
  outcome: TestOutcome;
  output: string;
  durationMs: number;
}

/** Itesty skupiny v kopii, se stejnými volbami jako `test:integration` (sériově, --test-force-exit). */
function runItests(cwd: string, itests: readonly string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<ItestRun> {
  const files = itests.map((name) => `${ITEST_DIR}/${name}`);
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", "--test-force-exit", ...files], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    currentChild = child;
    let output = "";
    const collect = (chunk: Buffer) => (output = (output + chunk.toString()).slice(-20_000));
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      currentChild = null;
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      currentChild = null;
      const outcome: TestOutcome = timedOut ? "timeout" : code === 0 ? "passed" : "failed";
      resolve({ outcome, output, durationMs: Date.now() - started });
    });
  });
}

function onSignal(signal: NodeJS.Signals): void {
  if (interrupted) {
    removeProjectCopy();
    process.exit(130);
  }
  interrupted = true;
  console.error(`\n${signal}: ukončuji běh a uklízím (dočasná kopie, testovací DB)…`);
  if (currentChild) killTree(currentChild);
}

async function main(): Promise<number> {
  const started = Date.now();
  const routeFiles = routeFileNames();
  const allMutants = findRouteFileMutants();
  const registryErrors = checkMutantRegistries({
    mutants: allMutants,
    routeFiles,
    itestFiles: itestFileNames(),
    map: ROUTE_ITEST_MAP,
    exceptions: TENANT_MUTANT_EXCEPTIONS,
  });
  if (registryErrors.length > 0) {
    console.error("Chyba kontroly registrů tenant mutací:");
    for (const error of registryErrors) console.error(`  ${error.message}`);
    return 1;
  }

  const only = process.argv.slice(2);
  const unknown = only.filter((name) => !routeFiles.includes(name));
  if (unknown.length > 0) {
    console.error(`Neznámý soubor rout: ${unknown.join(", ")}`);
    return 1;
  }
  const mutants = only.length > 0 ? allMutants.filter((m) => only.includes(path.posix.basename(m.file))) : allMutants;
  const plans = mutants.map((mutant) => ({ mutant, plan: planMutant(mutant, ROUTE_ITEST_MAP, TENANT_MUTANT_EXCEPTIONS) }));
  const groups = new Map<string, readonly string[]>();
  for (const { plan } of plans) if ("itests" in plan) groups.set(plan.itests.join(","), plan.itests);
  console.log(`=== Tenant mutace: ${mutants.length} mutantů, ${groups.size} skupin itestů ===`);

  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  process.on("exit", removeProjectCopy);
  const cwd = createProjectCopy();
  try {
    const results = await withTestDatabase(async (env) => {
      const controlMs = new Map<string, number>();
      for (const [key, itests] of groups) {
        checkInterrupted();
        const run = await runItests(cwd, itests, env, CONTROL_TIMEOUT_MS);
        checkInterrupted();
        if (run.outcome !== "passed") {
          throw new Error(`Kontrolní běh bez mutací selhal (${itests.join(", ")}), mutanti se nespouští.\n${run.output}`);
        }
        controlMs.set(key, run.durationMs);
        console.log(`Kontrolní běh ${itests.join(", ")}: ok za ${Math.round(run.durationMs / 1000)} s`);
      }

      const widths = columnWidths(mutants);
      const results: MutantResult[] = [];
      for (const { mutant, plan } of plans) {
        checkInterrupted();
        let result: MutantResult;
        if ("result" in plan) {
          result = plan.result;
        } else {
          const target = pathInCopy(cwd, mutant.file);
          const original = fs.readFileSync(target, "utf8");
          fs.writeFileSync(target, mutant.mutatedSource);
          try {
            const run = await runItests(cwd, plan.itests, env, mutantTimeoutMs(controlMs.get(plan.itests.join(","))!));
            checkInterrupted();
            result = resultOfOutcome(run.outcome);
          } finally {
            fs.writeFileSync(target, original);
          }
        }
        results.push(result);
        console.log(formatMutantLine(mutant, result, widths));
      }
      return results;
    });
    console.log(formatSummary(results, Date.now() - started));
    return exitCodeFor(results);
  } finally {
    removeProjectCopy();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
