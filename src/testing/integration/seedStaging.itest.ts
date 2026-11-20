import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import prisma from "../../utils/prisma";
import { resetDatabase, teardownIntegrationFile } from "./harness";
import { verifyPassword } from "../../utils/password";
import { runStagingSeed } from "../../scripts/seedStaging";
import { SEED_FILE_PREFIX } from "../../scripts/seedStagingFiles";

const PASSWORDS = { adminPassword: "integ-admin-heslo", memberPassword: "integ-clen-heslo" };

/** Počty napříč všemi tabulkami, které seed plní – pro ověření pokrytí i idempotence. */
async function snapshot() {
  return {
    cabins: await prisma.cabin.count(),
    users: await prisma.user.count(),
    reservations: await prisma.reservation.count(),
    reservationParticipants: await prisma.reservationParticipant.count(),
    reservationWatchers: await prisma.reservationWatcher.count(),
    shoppingLists: await prisma.shoppingList.count(),
    shoppingListItems: await prisma.shoppingListItem.count(),
    shoppingItemSplits: await prisma.shoppingItemSplit.count(),
    inventoryItems: await prisma.inventoryItem.count(),
    notes: await prisma.note.count(),
    noteThreads: await prisma.noteThread.count(),
    noteReactions: await prisma.noteReaction.count(),
    threadReadStatuses: await prisma.threadReadStatus.count(),
    galleryFolders: await prisma.galleryFolder.count(),
    galleryPhotos: await prisma.galleryPhoto.count(),
    diaryFolders: await prisma.diaryFolder.count(),
    diaryEntries: await prisma.diaryEntry.count(),
    diaryEntryPhotos: await prisma.diaryEntryPhoto.count(),
    reconstructionItems: await prisma.reconstructionItem.count(),
    reconstructionVotes: await prisma.reconstructionVote.count(),
    userAvailabilities: await prisma.userAvailability.count(),
    monthlyNotes: await prisma.monthlyNote.count(),
    inviteLinks: await prisma.inviteLink.count(),
    wallpapers: await prisma.wallpaper.count(),
  };
}

describe("seedStaging – kompletní fiktivní data", () => {
  let uploadsPath: string;
  let foreignCabinId: string;
  let foreignUserId: string;
  let snap1: Awaited<ReturnType<typeof snapshot>>;
  let snap2: Awaited<ReturnType<typeof snapshot>>;

  before(async () => {
    uploadsPath = fs.mkdtempSync(path.join(os.tmpdir(), "seed-itest-uploads-"));
    await resetDatabase();
    // Cizí chata s vlastním uživatelem a rezervací – seed se jí nesmí dotknout.
    const foreign = await prisma.cabin.create({ data: { name: "Cizí chata", subdomain: "cizi-itest" } });
    foreignCabinId = foreign.id;
    const foreignUser = await prisma.user.create({
      data: { username: "cizi-clen", passwordHash: "x", color: "#123456", cabinId: foreign.id },
    });
    foreignUserId = foreignUser.id;
    await prisma.reservation.create({
      data: { userId: foreignUser.id, cabinId: foreign.id, purpose: "Cizí pobyt", dateFrom: new Date("2026-12-01"), dateTo: new Date("2026-12-03") },
    });

    await runStagingSeed(prisma, { ...PASSWORDS, uploadsPath });
    snap1 = await snapshot();
    await runStagingSeed(prisma, { ...PASSWORDS, uploadsPath });
    snap2 = await snapshot();
  });

  after(async () => {
    try {
      fs.rmSync(uploadsPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* temp adresář uklidí OS */
    }
    await teardownIntegrationFile();
  });

  test("vytvoří demo chatu se správcem, dvěma členy a brandingem", async () => {
    const cabin = await prisma.cabin.findUniqueOrThrow({ where: { subdomain: "demo" } });
    assert.equal(cabin.name, "Testovací chata");
    assert.ok(cabin.coverPhotoUrl?.startsWith(`/uploads/${SEED_FILE_PREFIX}`), "cover fotka je seed soubor");
    assert.ok(Array.isArray(cabin.departureChecklist) && (cabin.departureChecklist as unknown[]).length > 0, "odjezdový checklist");
    assert.ok(cabin.features && typeof cabin.features === "object", "feature flags");

    const demoUsers = await prisma.user.findMany({ where: { cabinId: cabin.id } });
    assert.equal(demoUsers.length, 3);
    assert.equal(demoUsers.filter((x) => x.role === "admin").length, 1);
    assert.equal(demoUsers.filter((x) => x.role === "user").length, 2);
    assert.ok(demoUsers.every((x) => x.email?.endsWith("@example.invalid")), "e-maily na example.invalid");
    const admin = demoUsers.find((x) => x.role === "admin")!;
    assert.ok(await verifyPassword(PASSWORDS.adminPassword, admin.passwordHash), "heslo správce z env");
  });

  test("naplní každou doménu aplikace (každá obrazovka má co ukázat)", () => {
    for (const [key, value] of Object.entries(snap1)) {
      if (key === "cabins" || key === "users") continue;
      assert.ok(value > 0, `seed musí vytvořit alespoň jeden záznam: ${key} (bylo ${value})`);
    }
  });

  test("naseeduje okrajové stavy: minulá předávka, záložní a předběžná rezervace", async () => {
    const cabin = await prisma.cabin.findUniqueOrThrow({ where: { subdomain: "demo" } });
    const completed = await prisma.reservation.findFirst({
      where: { cabinId: cabin.id, isCheckoutCompleted: true },
    });
    assert.ok(completed?.checkoutState, "minulá rezervace s vyplněným stavem chaty");
    assert.ok(await prisma.reservation.findFirst({ where: { cabinId: cabin.id, status: "backup" } }), "záložní rezervace");
    assert.ok(await prisma.reservation.findFirst({ where: { cabinId: cabin.id, status: "soft" } }), "předběžná rezervace");
  });

  test("je idempotentní – druhý běh dá stejné počty, žádné duplicity", () => {
    assert.deepEqual(snap2, snap1);
  });

  test("seed soubory mají prefix seed- a existují v uploadech i v náhledech", () => {
    const originals = fs.readdirSync(uploadsPath).filter((n) => n.startsWith(SEED_FILE_PREFIX));
    const thumbs = fs.readdirSync(path.join(uploadsPath, "thumbs")).filter((n) => n.startsWith(SEED_FILE_PREFIX));
    assert.ok(originals.length >= 1, "originály seed fotek");
    assert.equal(thumbs.length, originals.length, "ke každému originálu náhled");
  });

  test("nedotkne se cizí chaty ani jejího uživatele", async () => {
    assert.equal(await prisma.reservation.count({ where: { cabinId: foreignCabinId } }), 1);
    const foreignUser = await prisma.user.findUniqueOrThrow({ where: { id: foreignUserId } });
    assert.equal(foreignUser.cabinId, foreignCabinId);
  });
});

describe("seedStaging – guard proti převzetí cizího uživatele", () => {
  let uploadsPath: string;

  before(async () => {
    uploadsPath = fs.mkdtempSync(path.join(os.tmpdir(), "seed-itest-guard-"));
    await resetDatabase();
    // Uživatel se seed jménem, ale v jiné chatě → seed musí skončit chybou, než cokoli změní.
    const foreign = await prisma.cabin.create({ data: { name: "Cizí chata", subdomain: "cizi-guard" } });
    await prisma.user.create({ data: { username: "demo-jana", passwordHash: "x", color: "#abcdef", cabinId: foreign.id } });
  });

  after(async () => {
    try {
      fs.rmSync(uploadsPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* temp adresář uklidí OS */
    }
    await teardownIntegrationFile();
  });

  test("odmítne převzít uživatele mimo demo chatu a nic nevytvoří", async () => {
    await assert.rejects(runStagingSeed(prisma, { ...PASSWORDS, uploadsPath }), /outside the demo cabin/);
    assert.equal(await prisma.cabin.count({ where: { subdomain: "demo" } }), 0, "demo chata nevznikla (rollback)");
    // Fail before writing anything: soubory se zapisují až po úspěšné transakci.
    const seedFiles = fs.readdirSync(uploadsPath).filter((n) => n.startsWith(SEED_FILE_PREFIX));
    assert.equal(seedFiles.length, 0, "při odmítnutí nevznikl žádný seed soubor");
  });
});
