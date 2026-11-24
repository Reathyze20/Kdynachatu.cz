/**
 * Sdílená příprava dočasné testovací DB pro backendové spouštěče nad reálným PostgreSQL 16
 * (`npm run test:integration`, později `npm run test:tenant-mutations`).
 *
 * Lokálně: dočasný Docker `postgres:16` na portu 5433 → `prisma migrate deploy` → callback.
 * CI / cloud session: TEST_DATABASE_URL ukazuje na service container; Docker se nespouští.
 * Guard bezpečné DB URL běží dřív, než cokoli sáhne na DB. Lokální DB na 5432 (data rodiny)
 * se nepoužije nikdy. Kontejner a dočasné uploady se smažou vždy, i při selhání.
 * `.env` se nečte – callback dostane DATABASE_URL, JWT_SECRET, UPLOADS_PATH a prázdné SMTP explicitně.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeTestDatabaseUrl } from "./dbGuard";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const LOCAL_PORT = "5433";
const LOCAL_DB = "kdynachatu_test";

/** Spustí příkaz v kořeni projektu; při nenulovém exit kódu odmítne s jeho výstupem. */
export type CommandRunner = (command: string, args: string[], env: NodeJS.ProcessEnv, inherit?: boolean) => Promise<void>;

export const runCommand: CommandRunner = (command, args, env, inherit = false) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, env, stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout?.on("data", (chunk) => (output += chunk.toString()));
    child.stderr?.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}\n${output}`)),
    );
  });

export interface TestDatabaseOptions {
  /** Výchozí prostředí (čte se z něj TEST_DATABASE_URL a předává se dál). Default `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Spouštěč příkazů (docker, prisma). Default skutečný `runCommand`; testy podstrčí falešný. */
  run?: CommandRunner;
  log?: (message: string) => void;
}

async function waitForPostgres(run: CommandRunner, container: string, env: NodeJS.ProcessEnv): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await run("docker", ["exec", container, "pg_isready", "-U", "postgres", "-d", LOCAL_DB], env);
      return;
    } catch (error) {
      if (attempt >= 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

/**
 * Připraví a zmigruje dočasnou testovací DB, zavolá `callback` s env pro testy a vždy po sobě uklidí.
 * Chyba guardu, Dockeru, migrace i callbacku se po úklidu propaguje volajícímu.
 */
export async function withTestDatabase<T>(
  callback: (env: NodeJS.ProcessEnv) => Promise<T>,
  { env: baseEnv = process.env, run = runCommand, log = console.log }: TestDatabaseOptions = {},
): Promise<T> {
  const externalUrl = baseEnv.TEST_DATABASE_URL?.trim();
  const databaseUrl = externalUrl || `postgresql://postgres:postgres@localhost:${LOCAL_PORT}/${LOCAL_DB}`;

  // Guard dřív než cokoli sáhne na DB (kontejner, migrace, truncate).
  assertSafeTestDatabaseUrl(databaseUrl);

  const container = externalUrl ? null : `kdynachatu-itest-${Date.now()}`;
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "kdynachatu-itest-uploads-"));

  try {
    const env: NodeJS.ProcessEnv = {
      ...baseEnv,
      NODE_ENV: "test",
      INTEGRATION_TEST_RUN: "1",
      DATABASE_URL: databaseUrl,
      JWT_SECRET: randomBytes(32).toString("hex"),
      UPLOADS_PATH: uploadsDir,
      // Prázdné SMTP = e-maily jen simulované (dotenv existující klíče z .env nepřepíše).
      SMTP_HOST: "",
      SMTP_USER: "",
      SMTP_PASS: "",
    };

    if (container) {
      log(`=== Dočasný PostgreSQL 16 (${container}) na portu ${LOCAL_PORT} ===`);
      await run("docker", [
        "run", "--rm", "-d", "--name", container,
        "-e", "POSTGRES_PASSWORD=postgres", "-e", `POSTGRES_DB=${LOCAL_DB}`,
        "-p", `${LOCAL_PORT}:5432`, "postgres:16",
      ], baseEnv);
      await waitForPostgres(run, container, baseEnv);
    }

    log("=== prisma migrate deploy ===");
    await run(process.execPath, [path.join(projectRoot, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], env);

    return await callback(env);
  } finally {
    if (container) await run("docker", ["rm", "-f", container], baseEnv).catch(() => undefined);
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  }
}
