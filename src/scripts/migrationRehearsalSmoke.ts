/**
 * Migration rehearsal smoke test for the 2026-11-06 backup cutover.
 *
 * Rehearses the real migration path against a disposable `postgres:16` container
 * (in the spirit of `backupRestoreSmoke.ts`):
 *
 *   restore  ->  backfillCabin  ->  count-check
 *
 * It seeds a source database that mimics the pre-multi-tenancy backup (most rows
 * have a NULL cabinId, one reservation is already assigned to a cabin), backs it
 * up with the real `backupManager`, restores into a fresh target database, runs
 * the real `backfillCabin` script, and then reconciles:
 *
 *   - every entity in `MIGRATION_COUNT_ENTITIES` has the same row count end-to-end
 *     (restore + backfill must not drop, duplicate, or skip rows),
 *   - a spot-checked reservation survives restore unchanged and gets a cabinId,
 *   - the pre-assigned reservation keeps its original cabinId (backfill only
 *     fills NULLs — it never rewrites an existing cabin),
 *   - the uploads archive restores with the same file count.
 *
 * Run: npm run migration:rehearsal   (requires Docker)
 *
 * The container is published on REHEARSAL_PG_PORT (default 59432) so it never
 * collides with a local Postgres on 5432.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { compareCounts, MIGRATION_COUNT_ENTITIES, type CountSnapshot } from "./migrationCountCheck.js";

interface CommandResult {
  stdout: string;
  stderr: string;
}

interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const prismaCli = path.join(projectRoot, "node_modules", "prisma", "build", "index.js");
const keepArtifacts = process.argv.includes("--keep-artifacts");

const smokeId = Date.now().toString();
const containerName = `cabin-migration-rehearsal-${smokeId}`;
const workDir = path.join(os.tmpdir(), `cabin-migration-rehearsal-${smokeId}`);
const backupRoot = path.join(workDir, "backups");
const uploadsSourcePath = path.join(workDir, "uploads-live");
const uploadsRestorePath = path.join(workDir, "uploads-restored", path.basename(uploadsSourcePath));

const hostPort = process.env.REHEARSAL_PG_PORT?.trim() || "59432";
// URLs for connections FROM the host (Prisma client, prisma CLI, backfillCabin).
const hostSourceUrl = `postgresql://postgres:postgres@localhost:${hostPort}/cabin_source`;
const hostTargetUrl = `postgresql://postgres:postgres@localhost:${hostPort}/cabin_target`;
// URLs for pg_dump/pg_restore which run INSIDE the container (port 5432).
const containerSourceUrl = "postgresql://postgres:postgres@localhost:5432/cabin_source";
const containerTargetUrl = "postgresql://postgres:postgres@localhost:5432/cabin_target";

// Markers so the spot-check can find its rows by content, not by position.
const SPOTCHECK_PURPOSE = "rehearsal-spotcheck-reservation";
const SPOTCHECK_DATE_FROM = "2026-07-01";
const PREASSIGNED_PURPOSE = "rehearsal-preassigned-reservation";

async function runCommand(command: string, args: string[], options: RunOptions = {}): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}\n${stderr}`.trim()));
    });
  });
}

async function waitForPostgres(): Promise<void> {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await runCommand("docker", [
        "exec", "-i", containerName,
        "psql", "-U", "postgres", "-d", "cabin_source", "-tA", "-v", "ON_ERROR_STOP=1", "-c", "SELECT 1;",
      ]);
      return;
    } catch (error) {
      if (attempt === 30) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

function logStdout(result: CommandResult): void {
  if (result.stdout.trim().length > 0) {
    console.log(result.stdout.trim());
  }
}

async function runPrisma(args: string[], databaseUrl: string): Promise<void> {
  logStdout(await runCommand(process.execPath, [prismaCli, ...args], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  }));
}

async function runBackupManager(args: string[], envOverrides: NodeJS.ProcessEnv): Promise<void> {
  logStdout(await runCommand(process.execPath, ["--import", "tsx", "src/scripts/backupManager.ts", ...args], {
    cwd: projectRoot,
    env: { ...process.env, ...envOverrides },
  }));
}

async function runBackfillCabin(databaseUrl: string): Promise<void> {
  logStdout(await runCommand(process.execPath, ["--import", "tsx", "src/scripts/backfillCabin.ts"], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  }));
}

function createClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

interface SeedResult {
  staraCabinId: string;
  spotcheckReservationId: string;
}

/**
 * Seed the source database to look like the old single-cabin backup: users and
 * content with NULL cabinId, plus one cabin ("Chata Stará") that already owns a
 * reservation. `backfillCabin` must leave that one alone.
 */
async function seedSource(client: PrismaClient): Promise<SeedResult> {
  const staraCabin = await client.cabin.create({
    data: { name: "Chata Stará", subdomain: "stara-rehearsal" },
  });

  const [userA, userB] = await Promise.all([
    client.user.create({ data: { username: "rehearsal-anna", passwordHash: "x", color: "#aa0000" } }),
    client.user.create({ data: { username: "rehearsal-bedrich", passwordHash: "x", color: "#0000aa" } }),
  ]);

  const spotcheck = await client.reservation.create({
    data: {
      userId: userA.id,
      dateFrom: new Date(`${SPOTCHECK_DATE_FROM}T00:00:00.000Z`),
      dateTo: new Date("2026-07-05T00:00:00.000Z"),
      purpose: SPOTCHECK_PURPOSE,
      notes: "léto u vody",
    },
  });

  await client.reservation.create({
    data: {
      userId: userB.id,
      dateFrom: new Date("2026-08-10T00:00:00.000Z"),
      dateTo: new Date("2026-08-12T00:00:00.000Z"),
      purpose: "rehearsal-filler-reservation",
    },
  });

  // Pre-assigned reservation — backfill must NOT touch its cabinId.
  await client.reservation.create({
    data: {
      userId: userA.id,
      dateFrom: new Date("2026-09-01T00:00:00.000Z"),
      dateTo: new Date("2026-09-03T00:00:00.000Z"),
      purpose: PREASSIGNED_PURPOSE,
      cabinId: staraCabin.id,
    },
  });

  const shoppingList = await client.shoppingList.create({
    data: { name: "Rehearsal nákup", createdById: userA.id },
  });
  await client.shoppingListItem.createMany({
    data: [
      { listId: shoppingList.id, name: "rohlíky", addedById: userA.id },
      { listId: shoppingList.id, name: "máslo", addedById: userB.id },
    ],
  });

  const thread = await client.noteThread.create({
    data: { name: "Rehearsal vlákno", createdById: userA.id },
  });
  await client.note.createMany({
    data: [
      { userId: userA.id, threadId: thread.id, message: "poznámka 1" },
      { userId: userB.id, threadId: thread.id, message: "poznámka 2" },
    ],
  });

  const folder = await client.galleryFolder.create({
    data: { name: "Rehearsal album", createdById: userA.id },
  });
  await client.galleryPhoto.createMany({
    data: [
      { folderId: folder.id, src: "rehearsal/photo-1.jpg", uploadedById: userA.id },
      { folderId: folder.id, src: "rehearsal/photo-2.jpg", uploadedById: userB.id },
    ],
  });

  const diaryFolder = await client.diaryFolder.create({
    data: { name: "Rehearsal deník", createdById: userA.id },
  });
  await client.diaryEntry.create({
    data: {
      folderId: diaryFolder.id,
      authorId: userA.id,
      entryDate: new Date("2026-07-02T00:00:00.000Z"),
      content: "první zápis",
    },
  });

  await client.reconstructionItem.create({
    data: { category: "idea", title: "Nová pergola", description: "stín na terase", createdById: userA.id },
  });

  await client.inventoryItem.create({
    data: { name: "Plynová bomba", updatedById: userA.id },
  });

  return { staraCabinId: staraCabin.id, spotcheckReservationId: spotcheck.id };
}

async function snapshotCounts(client: PrismaClient): Promise<CountSnapshot> {
  const snapshot: CountSnapshot = {};
  for (const { entity, table } of MIGRATION_COUNT_ENTITIES) {
    const rows = await client.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT count(*)::int AS count FROM "${table}"`,
    );
    snapshot[entity] = rows[0]?.count ?? 0;
  }
  return snapshot;
}

async function createUploadsFixture(): Promise<number> {
  await fs.mkdir(path.join(uploadsSourcePath, "thumbs"), { recursive: true });
  await fs.mkdir(path.join(uploadsSourcePath, "wallpapers"), { recursive: true });

  const files: Array<[string, string]> = [
    ["rehearsal/photo-1.jpg".replace("/", path.sep), "photo one\n"],
    [path.join("thumbs", "photo-1-thumb.jpg"), "thumb one\n"],
    [path.join("wallpapers", "cabin.jpg"), "wallpaper\n"],
    ["photo-2.jpg", "photo two\n"],
    ["handover-note.txt", "klíče pod rohožkou\n"],
  ];

  await fs.mkdir(path.join(uploadsSourcePath, "rehearsal"), { recursive: true });
  for (const [relativePath, content] of files) {
    await fs.writeFile(path.join(uploadsSourcePath, relativePath), content, "utf8");
  }

  return files.length;
}

async function countFiles(rootPath: string): Promise<number> {
  let total = 0;
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      total += await countFiles(fullPath);
    } else {
      total += 1;
    }
  }
  return total;
}

async function getLatestFile(dirPath: string, suffix: string): Promise<string> {
  const entries = await fs.readdir(dirPath);
  const latest = entries.filter((entry) => entry.endsWith(suffix)).sort().at(-1);
  if (!latest) {
    throw new Error(`Missing expected backup artifact (${suffix}) in ${dirPath}`);
  }
  return path.join(dirPath, latest);
}

async function cleanup(clients: PrismaClient[]): Promise<void> {
  for (const client of clients) {
    try {
      await client.$disconnect();
    } catch {
      // best effort
    }
  }
  try {
    await runCommand("docker", ["stop", containerName]);
  } catch {
    // best effort
  }
  if (!keepArtifacts) {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const clients: PrismaClient[] = [];

  try {
    await fs.rm(workDir, { recursive: true, force: true });
    await fs.mkdir(backupRoot, { recursive: true });
    const expectedUploadCount = await createUploadsFixture();

    console.log("=== Starting disposable PostgreSQL container ===");
    await runCommand("docker", [
      "run", "--rm", "-d",
      "--name", containerName,
      "-e", "POSTGRES_PASSWORD=postgres",
      "-e", "POSTGRES_DB=cabin_source",
      "-p", `${hostPort}:5432`,
      "postgres:16-alpine",
    ]);
    await waitForPostgres();
    await runCommand("docker", ["exec", "-i", containerName, "createdb", "-U", "postgres", "cabin_target"]);

    console.log("=== Applying schema to source via prisma migrate deploy ===");
    await runPrisma(["migrate", "deploy"], hostSourceUrl);

    console.log("=== Seeding source (pre-multi-tenancy backup shape) ===");
    const sourceClient = createClient(hostSourceUrl);
    clients.push(sourceClient);
    const seed = await seedSource(sourceClient);
    const sourceSnapshot = await snapshotCounts(sourceClient);
    console.log("Source counts:", JSON.stringify(sourceSnapshot));

    console.log("=== Backing up source (db + uploads) via backupManager ===");
    const pgDumpCommand = JSON.stringify(["docker", "exec", "-i", containerName, "pg_dump"]);
    const pgRestoreCommand = JSON.stringify(["docker", "exec", "-i", containerName, "pg_restore"]);
    await runBackupManager(["backup", "all"], {
      DATABASE_URL: containerSourceUrl,
      UPLOADS_PATH: uploadsSourcePath,
      BACKUP_ROOT: backupRoot,
      BACKUP_RETENTION_DAYS: "14",
      PG_DUMP_COMMAND: pgDumpCommand,
    });
    const dbBackupFile = await getLatestFile(path.join(backupRoot, "db"), ".dump");
    const uploadsBackupFile = await getLatestFile(path.join(backupRoot, "uploads"), ".tar.gz");

    console.log("=== Restoring db backup into target ===");
    await runBackupManager(["restore", "db", "--file", dbBackupFile, "--yes"], {
      DATABASE_URL: containerTargetUrl,
      PG_RESTORE_COMMAND: pgRestoreCommand,
    });

    const targetClient = createClient(hostTargetUrl);
    clients.push(targetClient);

    // Spot-check BEFORE backfill: restore must preserve the reservation verbatim.
    const spotBefore = await targetClient.reservation.findUnique({ where: { id: seed.spotcheckReservationId } });
    if (!spotBefore) {
      throw new Error("Spot-check reservation missing after restore.");
    }
    if (spotBefore.purpose !== SPOTCHECK_PURPOSE) {
      throw new Error(`Spot-check reservation purpose changed by restore: got '${spotBefore.purpose}'.`);
    }
    if (spotBefore.dateFrom.toISOString().slice(0, 10) !== SPOTCHECK_DATE_FROM) {
      throw new Error(`Spot-check reservation dateFrom changed by restore: got '${spotBefore.dateFrom.toISOString()}'.`);
    }
    if (spotBefore.cabinId !== null) {
      throw new Error(`Spot-check reservation should have NULL cabinId before backfill, got '${spotBefore.cabinId}'.`);
    }

    console.log("=== Running backfillCabin against target ===");
    await runBackfillCabin(hostTargetUrl);

    // Spot-check AFTER backfill: null cabinId filled, everything else intact.
    const spotAfter = await targetClient.reservation.findUnique({ where: { id: seed.spotcheckReservationId } });
    if (!spotAfter) {
      throw new Error("Spot-check reservation disappeared after backfill.");
    }
    if (spotAfter.purpose !== SPOTCHECK_PURPOSE || spotAfter.dateFrom.toISOString().slice(0, 10) !== SPOTCHECK_DATE_FROM) {
      throw new Error("Backfill altered spot-check reservation content.");
    }
    if (spotAfter.cabinId === null) {
      throw new Error("Backfill did not assign a cabinId to the NULL reservation.");
    }
    console.log(`Spot-check reservation cabinId: NULL -> ${spotAfter.cabinId}`);

    // Pre-assigned reservation must keep its original cabin (backfill only fills NULLs).
    const preassigned = await targetClient.reservation.findFirst({ where: { purpose: PREASSIGNED_PURPOSE } });
    if (!preassigned) {
      throw new Error("Pre-assigned reservation missing after restore.");
    }
    if (preassigned.cabinId !== seed.staraCabinId) {
      throw new Error(
        `Backfill overwrote an existing cabinId: expected '${seed.staraCabinId}', got '${preassigned.cabinId}'.`,
      );
    }
    if (preassigned.cabinId === spotAfter.cabinId) {
      throw new Error("Pre-assigned reservation was merged into the backfill cabin — existing cabinId not respected.");
    }
    console.log(`Pre-assigned reservation kept cabinId: ${preassigned.cabinId}`);

    console.log("=== Count-check reconciliation (source vs restored+backfilled) ===");
    const targetSnapshot = await snapshotCounts(targetClient);
    console.log("Target counts:", JSON.stringify(targetSnapshot));
    const report = compareCounts(sourceSnapshot, targetSnapshot);
    if (!report.ok) {
      throw new Error(`Count-check failed:\n${JSON.stringify(report.mismatches, null, 2)}`);
    }
    console.log("Count-check OK — every entity reconciled.");

    console.log("=== Restoring uploads backup and verifying file count ===");
    await runBackupManager(["restore", "uploads", "--file", uploadsBackupFile, "--yes"], {
      UPLOADS_PATH: uploadsRestorePath,
    });
    const restoredUploadCount = await countFiles(uploadsRestorePath);
    if (restoredUploadCount !== expectedUploadCount) {
      throw new Error(`Uploads restore count mismatch: expected ${expectedUploadCount}, got ${restoredUploadCount}.`);
    }
    console.log(`Uploads restore OK — ${restoredUploadCount} files.`);

    console.log("\nMigration rehearsal smoke passed.");
    console.log(`Artifacts: ${keepArtifacts ? workDir : "cleaned up"}`);
    await cleanup(clients);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    await cleanup(clients);
  }
}

void main();
