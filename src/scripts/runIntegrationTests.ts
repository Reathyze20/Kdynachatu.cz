/**
 * `npm run test:integration` — backendové integrační testy (src/**\/*.itest.ts) nad reálným PostgreSQL 16.
 *
 * Lokálně: dočasný Docker `postgres:16` na portu 5433 → guard → `prisma migrate deploy` → testy
 * sériově → kontejner se smaže vždy, i při selhání. Lokální DB na 5432 (data rodiny) se nepoužije nikdy.
 * CI: TEST_DATABASE_URL ukazuje na service container; Docker se nespouští.
 * `.env` se nečte – testy dostanou DATABASE_URL, JWT_SECRET, UPLOADS_PATH a prázdné SMTP explicitně.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeTestDatabaseUrl } from "../testing/integration/dbGuard";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LOCAL_PORT = "5433";
const LOCAL_DB = "kdynachatu_test";

function run(command: string, args: string[], env: NodeJS.ProcessEnv, inherit = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, env, stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout?.on("data", (chunk) => (output += chunk.toString()));
    child.stderr?.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}\n${output}`)),
    );
  });
}

async function waitForPostgres(container: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await run("docker", ["exec", container, "pg_isready", "-U", "postgres", "-d", LOCAL_DB], process.env);
      return;
    } catch (error) {
      if (attempt >= 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

function findIntegrationFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : findIntegrationFiles(full);
    return entry.name.endsWith(".itest.ts") ? [path.relative(projectRoot, full)] : [];
  });
}

async function main(): Promise<void> {
  const externalUrl = process.env.TEST_DATABASE_URL?.trim();
  const container = externalUrl ? null : `kdynachatu-itest-${Date.now()}`;
  const databaseUrl = externalUrl || `postgresql://postgres:postgres@localhost:${LOCAL_PORT}/${LOCAL_DB}`;
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "kdynachatu-itest-uploads-"));

  try {
    // Guard dřív než cokoli sáhne na DB (migrace, truncate).
    assertSafeTestDatabaseUrl(databaseUrl);

    const env: NodeJS.ProcessEnv = {
      ...process.env,
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
      console.log(`=== Dočasný PostgreSQL 16 (${container}) na portu ${LOCAL_PORT} ===`);
      await run("docker", [
        "run", "--rm", "-d", "--name", container,
        "-e", "POSTGRES_PASSWORD=postgres", "-e", `POSTGRES_DB=${LOCAL_DB}`,
        "-p", `${LOCAL_PORT}:5432`, "postgres:16",
      ], process.env);
      await waitForPostgres(container);
    }

    console.log("=== prisma migrate deploy ===");
    await run(process.execPath, [path.join(projectRoot, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], env);

    const files = findIntegrationFiles(path.join(projectRoot, "src"));
    if (files.length === 0) throw new Error("Nenalezen žádný soubor *.itest.ts.");
    console.log(`=== Integrační testy (${files.length} soubor/ů, sériově) ===`);
    // --test-force-exit: moduly rout drží časovače (např. setInterval v logs.ts), proces by po testech nedoběhl.
    await run(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", "--test-force-exit", ...files], env, true);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    if (container) await run("docker", ["rm", "-f", container], process.env).catch(() => undefined);
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  }
}

void main();
