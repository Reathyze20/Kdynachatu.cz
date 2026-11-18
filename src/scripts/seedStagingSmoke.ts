/**
 * DB smoke for `seedStaging.ts` (vzor `migrationRehearsalSmoke.ts`).
 *
 * Disposable postgres:16 → prisma migrate deploy → foreign cabin fixture →
 * seed twice → asserts: demo cabin with 1 admin + 2 members and sample content,
 * second run duplicates nothing, foreign cabin untouched, seed refuses DEPLOY_TARGET≠staging.
 *
 * Run: npm run staging:seed-smoke   (requires Docker; port SEED_SMOKE_PG_PORT, default 59433)
 */
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { verifyPassword } from "../utils/password";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const containerName = `cabin-seed-smoke-${Date.now()}`;
const hostPort = process.env.SEED_SMOKE_PG_PORT?.trim() || "59433";
const databaseUrl = `postgresql://postgres:postgres@localhost:${hostPort}/kdynachatu_smoke_staging`;
const seedEnv = {
  ...process.env,
  DEPLOY_TARGET: "staging",
  DATABASE_URL: databaseUrl,
  STAGING_SEED_ADMIN_PASSWORD: "smoke-admin-heslo",
  STAGING_SEED_MEMBER_PASSWORD: "smoke-clen-heslo",
};

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`${command} ${args.join(" ")} exited ${code}\n${output}`)),
    );
  });
}

const runSeed = (env: NodeJS.ProcessEnv = seedEnv) =>
  run(process.execPath, ["--import", "tsx", "src/scripts/seedStaging.ts"], env);

async function waitForPostgres(): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await run("docker", ["exec", containerName, "pg_isready", "-U", "postgres", "-d", "kdynachatu_smoke_staging"]);
      return;
    } catch (error) {
      if (attempt >= 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

async function snapshot(client: PrismaClient) {
  return {
    cabins: await client.cabin.count(),
    users: await client.user.count(),
    reservations: await client.reservation.count(),
    shoppingLists: await client.shoppingList.count(),
    shoppingItems: await client.shoppingListItem.count(),
    noteThreads: await client.noteThread.count(),
    notes: await client.note.count(),
    monthlyNotes: await client.monthlyNote.count(),
  };
}

async function main(): Promise<void> {
  let client: PrismaClient | undefined;
  try {
    console.log("=== Starting disposable PostgreSQL 16 container ===");
    await run("docker", [
      "run", "--rm", "-d", "--name", containerName,
      "-e", "POSTGRES_PASSWORD=postgres", "-e", "POSTGRES_DB=kdynachatu_smoke_staging",
      "-p", `${hostPort}:5432`, "postgres:16-alpine",
    ]);
    await waitForPostgres();
    await run(process.execPath, [path.join(projectRoot, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
      ...process.env,
      DATABASE_URL: databaseUrl,
    });

    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    const foreign = await client.cabin.create({ data: { name: "Cizí chata", subdomain: "cizi-smoke" } });
    const foreignUser = await client.user.create({
      data: { username: "cizi-clen", passwordHash: "x", color: "#123456", cabinId: foreign.id },
    });
    await client.reservation.create({
      data: { userId: foreignUser.id, cabinId: foreign.id, purpose: "Cizí pobyt",
        dateFrom: new Date("2026-12-01"), dateTo: new Date("2026-12-03") },
    });
    const before = await snapshot(client);

    console.log("=== Guard: seed refuses DEPLOY_TARGET=production ===");
    await assert.rejects(runSeed({ ...seedEnv, DEPLOY_TARGET: "production" }));
    assert.deepEqual(await snapshot(client), before, "guarded run must not write anything");

    console.log("=== Seed run 1 ===");
    console.log((await runSeed()).trim());
    const first = await snapshot(client);
    const demo = await client.cabin.findUniqueOrThrow({ where: { subdomain: "demo" } });
    const demoUsers = await client.user.findMany({ where: { cabinId: demo.id } });
    assert.equal(first.cabins, before.cabins + 1);
    assert.equal(demoUsers.length, 3);
    assert.equal(demoUsers.filter((u) => u.role === "admin").length, 1);
    assert.equal(demoUsers.filter((u) => u.role === "user").length, 2);
    for (const key of ["reservations", "shoppingLists", "shoppingItems", "noteThreads", "notes", "monthlyNotes"] as const) {
      assert.ok(first[key] > before[key], `seed must create ${key}`);
    }
    const admin = demoUsers.find((u) => u.role === "admin")!;
    assert.ok(await verifyPassword(seedEnv.STAGING_SEED_ADMIN_PASSWORD, admin.passwordHash), "admin password from env");

    console.log("=== Seed run 2 (idempotence) ===");
    await runSeed();
    const second = await snapshot(client);
    assert.deepEqual(second, first, "second run must not duplicate anything");
    assert.equal(await client.reservation.count({ where: { cabinId: foreign.id } }), 1, "foreign cabin untouched");
    assert.equal((await client.user.findUniqueOrThrow({ where: { id: foreignUser.id } })).cabinId, foreign.id);

    console.log("Counts after run 1 and 2:", JSON.stringify(second));
    console.log("\nSeed staging smoke passed.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await client?.$disconnect().catch(() => undefined);
    await run("docker", ["stop", containerName]).catch(() => undefined);
  }
}

void main();
