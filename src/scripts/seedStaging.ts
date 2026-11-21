/**
 * Fiktivní data pro staging: chata `demo` se správcem a dvěma členy a kompletním, realistickým
 * obsahem napříč všemi obrazovkami (rezervace včetně minulé předávky, nákupy + spíž, inventář,
 * poznámky + vlákna + reakce, galerie + fotky, deník, rekonstrukce + hlasování, dovolené,
 * měsíční poznámky, pozvánky, wallpapery, branding chaty). Žádná reálná data rodiny.
 *
 * Run: npm run db:seed   (DEPLOY_TARGET=staging, DB končící na _staging,
 *      STAGING_SEED_ADMIN_PASSWORD + STAGING_SEED_MEMBER_PASSWORD, viz .env.staging.example)
 *
 * Idempotentní: chata a účty se upsertují, obsah chaty `demo` se smaže a vytvoří znovu v jedné
 * transakci; seed soubory (prefix `seed-`) v UPLOADS_PATH se při každém běhu přepíšou. Jiné chaty,
 * uživatelé a uploady se nemění. Data se tvoří relativně ke dnešku. Smoke: npm run staging:seed-smoke.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";
import { hashPassword } from "../utils/password";
import { DEMO_USERS, resolveSeedConfig, resolveUploadsPath } from "./seedStagingConfig";
import { cleanSeedFiles, writeSeedImage, SEED_FILE_PREFIX, type SeedColor } from "./seedStagingFiles";

dotenv.config();

const DEMO_SUBDOMAIN = "demo";

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
type DemoUserIds = Record<(typeof DEMO_USERS)[number]["key"], string>;

export interface RunSeedOptions {
  adminPassword: string;
  memberPassword: string;
  uploadsPath: string;
}

/** Veřejné cesty seed fotek (`/uploads/seed-*.webp`), předané do DB. */
interface SeedImages {
  cover: string;
  galleryLeto: [string, string];
  galleryZima: string;
  wallpapers: [string, string];
}

/** Datum (UTC půlnoc) posunuté o `offset` dní od dneška – data zůstávají „aktuální“. */
function day(offset: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
}

/** Rok a měsíc (1–12) posunuté o `offset` měsíců od dneška – pro měsíční poznámky. */
function yearMonth(offset: number): { year: number; month: number } {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

// ── Soubory ─────────────────────────────────────────────────────────────────

// Jediný zdroj pravdy pro seed fotky: slug + barva. Cesty i fyzické soubory z něj nemůžou utéct.
const SEED_IMAGE_SPECS: { slug: string; color: SeedColor }[] = [
  { slug: "cover", color: { r: 94, g: 155, b: 98 } },
  { slug: "gallery-leto-1", color: { r: 126, g: 188, b: 232 } },
  { slug: "gallery-leto-2", color: { r: 244, g: 208, b: 111 } },
  { slug: "gallery-zima-1", color: { r: 176, g: 196, b: 222 } },
  { slug: "wallpaper-1", color: { r: 60, g: 80, b: 60 } },
  { slug: "wallpaper-2", color: { r: 40, g: 55, b: 90 } },
];

/** Veřejná cesta seed fotky (deterministická, bez IO) – jako galerie `/uploads/<name>`. */
const seedSrc = (slug: string) => `/uploads/${SEED_FILE_PREFIX}${slug}.webp`;

/** Deterministické cesty fotek pro DB (bez zápisu souborů) – aby šel seed „fail before write“. */
function buildSeedImages(): SeedImages {
  return {
    cover: seedSrc("cover"),
    galleryLeto: [seedSrc("gallery-leto-1"), seedSrc("gallery-leto-2")],
    galleryZima: seedSrc("gallery-zima-1"),
    wallpapers: [seedSrc("wallpaper-1"), seedSrc("wallpaper-2")],
  };
}

/** Přepíše fyzické seed soubory (prefix `seed-`). Volá se až po úspěšné DB transakci. */
async function writeSeedImageFiles(uploadsPath: string): Promise<void> {
  await cleanSeedFiles(uploadsPath);
  await Promise.all(SEED_IMAGE_SPECS.map((s) => writeSeedImage(uploadsPath, s.slug, s.color)));
}

// ── Chata a uživatelé ─────────────────────────────────────────────────────────

async function upsertCabin(tx: Tx, images: SeedImages) {
  const cabinData = {
    name: "Testovací chata",
    description: "Fiktivní chata pro staging – data nepatří žádné rodině, slouží jen k vyzkoušení aplikace.",
    welcomeMessage: "Vítejte na demo chatě! Všechno si tu můžete bez obav vyzkoušet.",
    address: "Chatová osada 7, 254 01 Jílové u Prahy",
    rules: "## Domácí řád\n\n- Po sobě uklidit a vynést koš.\n- Dřevo doplnit, když dojde.\n- Poslední zhasíná a zamyká kůlnu.",
    departureChecklist: ["Vypnuté a vypuštěné topení/voda", "Zavřené okenice", "Vybraný popel z kamen", "Vyprázdněná lednice", "Zamčeno"],
    coverPhotoUrl: images.cover,
    weatherLocation: "Jílové u Prahy",
    isWinterized: false,
    features: { reservations: true, shopping: true, notes: true, gallery: true, diary: true, reconstruction: true, inventory: true },
  };
  return tx.cabin.upsert({
    where: { subdomain: DEMO_SUBDOMAIN },
    update: cabinData,
    create: { ...cabinData, subdomain: DEMO_SUBDOMAIN },
  });
}

async function upsertDemoUsers(tx: Tx, cabinId: string, hashes: { admin: string; member: string }) {
  const ids = {} as DemoUserIds;
  for (const { key, ...user } of DEMO_USERS) {
    const existing = await tx.user.findUnique({ where: { username: user.username }, select: { cabinId: true } });
    if (existing && existing.cabinId !== cabinId) {
      throw new Error(`User '${user.username}' exists outside the demo cabin; refusing to take it over.`);
    }
    const data = {
      ...user,
      passwordHash: key === "admin" ? hashes.admin : hashes.member,
      cabinId,
      isVerified: true,
      isEmailVerified: true,
      isBanned: false,
      isSuperAdmin: false,
      verificationToken: null, passwordResetToken: null, passwordResetExpiresAt: null,
    };
    const saved = await tx.user.upsert({ where: { username: user.username }, update: data, create: data });
    ids[key] = saved.id;
  }
  return ids;
}

/** Smaže obsah chaty `demo` (jen tyto tabulky, jen tato chata) – druhý běh pak nic nezduplikuje.
 * Join tabulky (účastníci, watcheři, reakce, splity, hlasy, deníkové fotky) odejdou kaskádou. */
async function clearDemoContent(tx: Tx, cabinId: string) {
  await tx.threadReadStatus.deleteMany({ where: { cabinId } });
  await tx.note.deleteMany({ where: { cabinId } }); // reakce + odpovědi kaskádou
  await tx.noteThread.deleteMany({ where: { cabinId } });
  await tx.shoppingList.deleteMany({ where: { cabinId } }); // položky + splity kaskádou
  await tx.diaryFolder.deleteMany({ where: { cabinId } }); // záznamy + vazby na fotky kaskádou
  await tx.galleryFolder.deleteMany({ where: { cabinId } }); // fotky + vazby na deník kaskádou
  await tx.reconstructionItem.deleteMany({ where: { cabinId } }); // hlasy kaskádou
  await tx.inventoryItem.deleteMany({ where: { cabinId } });
  await tx.userAvailability.deleteMany({ where: { cabinId } });
  await tx.inviteLink.deleteMany({ where: { cabinId } });
  await tx.wallpaper.deleteMany({ where: { cabinId } });
  await tx.reservation.deleteMany({ where: { cabinId } }); // účastníci + watcheři kaskádou
  await tx.monthlyNote.deleteMany({ where: { cabinId } });
}

// ── Obsah ────────────────────────────────────────────────────────────────────

async function seedReservations(tx: Tx, cabinId: string, u: DemoUserIds) {
  // Minulá dokončená rezervace s předávkou + stavem chaty (zdroj arrival briefingu na dashboardu).
  const past = await tx.reservation.create({
    data: {
      cabinId, userId: u.jana, dateFrom: day(-10), dateTo: day(-7), purpose: "Prodloužený víkend",
      handoverNote: "Dřevo dochází, plyn je skoro prázdný. Kape kohoutek v koupelně.",
      status: "primary", isCheckoutCompleted: true, checkoutCompletedBy: u.jana, checkoutCompletedAt: day(-7),
      checkoutState: {
        gas: "low", heatingOff: true, waterOff: true,
        broken: "Kape kohoutek v koupelně.", leftBehind: "Suché dřevo u kamen, 2 piva v lednici.",
        note: "V kůlně nastražená past na myši.",
      },
      checkoutStateAt: day(-7),
    },
  });
  // Budoucí potvrzená rezervace se spolucestujícím (účastník).
  const upcoming = await tx.reservation.create({
    data: {
      cabinId, userId: u.admin, dateFrom: day(14), dateTo: day(21), purpose: "Rodinná dovolená",
      notes: "Vezmeme malý člun a gril.", status: "primary",
    },
  });
  await tx.reservationParticipant.create({ data: { reservationId: upcoming.id, userId: u.petr } });
  // Další budoucí potvrzená + záložní a předběžná rezervace (okrajové stavy kalendáře).
  const fishing = await tx.reservation.create({
    data: { cabinId, userId: u.petr, dateFrom: day(5), dateTo: day(8), purpose: "Rybaření s kamarády", status: "primary" },
  });
  await tx.reservation.create({
    data: { cabinId, userId: u.jana, dateFrom: day(16), dateTo: day(18), purpose: "Kdyby se uvolnilo", status: "backup" },
  });
  await tx.reservation.create({
    data: { cabinId, userId: u.admin, dateFrom: day(40), dateTo: day(43), purpose: "Předběžně – sběr hub", status: "soft" },
  });
  // Hlídací pes termínu: Jana sleduje Petrovo rybaření.
  await tx.reservationWatcher.create({ data: { reservationId: fishing.id, userId: u.jana } });
  return { past, upcoming };
}

async function seedShopping(tx: Tx, cabinId: string, u: DemoUserIds) {
  const weekend = await tx.shoppingList.create({ data: { cabinId, name: "Nákup na víkend", createdById: u.petr } });
  const paid = await tx.shoppingListItem.create({
    data: {
      listId: weekend.id, name: "Dřevěné uhlí", addedById: u.petr, status: "purchased",
      purchasedById: u.jana, purchasedAt: day(-8), price: "189.00",
    },
  });
  // Rozúčtování zaplacené položky mezi Janu a Petra.
  await tx.shoppingItemSplit.createMany({ data: [{ itemId: paid.id, userId: u.jana }, { itemId: paid.id, userId: u.petr }] });
  await tx.shoppingListItem.createMany({
    data: [
      { listId: weekend.id, name: "Rohlíky", addedById: u.petr, status: "pending" },
      { listId: weekend.id, name: "Káva", addedById: u.jana, status: "pending", isEssential: true },
      { listId: weekend.id, name: "Pytle na odpadky", addedById: u.admin, status: "bring_from_home" },
    ],
  });
  // Uzavřený (vyřízený) seznam – okrajový stav.
  const done = await tx.shoppingList.create({ data: { cabinId, name: "Nákup minulý týden", createdById: u.jana, isResolved: true } });
  await tx.shoppingListItem.createMany({
    data: [
      { listId: done.id, name: "Toaletní papír", addedById: u.jana, status: "purchased", purchasedById: u.jana, purchasedAt: day(-9), price: "79.90" },
      { listId: done.id, name: "Houbička na nádobí", addedById: u.jana, status: "purchased", purchasedById: u.jana, purchasedAt: day(-9), price: "24.90" },
    ],
  });
}

async function seedInventory(tx: Tx, cabinId: string, u: DemoUserIds) {
  await tx.inventoryItem.createMany({
    data: [
      { cabinId, name: "Sůl", category: "KOŘENÍ", status: "OK", isEssential: true, updatedById: u.admin },
      { cabinId, name: "Těstoviny", category: "TRVANLIVÉ", status: "OK", location: "Spíž", updatedById: u.jana },
      { cabinId, name: "Toaletní papír", category: "HYGIENA", status: "LOW", location: "Koupelna", isEssential: true, updatedById: u.petr },
      { cabinId, name: "Pivo", category: "NÁPOJE", status: "EMPTY", location: "Sklep", updatedById: u.petr },
      { cabinId, name: "Baterky AA", category: "OSTATNÍ", status: "LOW", location: "Kuchyňská linka", inCart: true, updatedById: u.admin },
      { cabinId, name: "Olej", category: "TRVANLIVÉ", status: "OK", location: "Spíž", updatedById: u.jana },
    ],
  });
}

async function seedNotes(tx: Tx, cabinId: string, u: DemoUserIds) {
  // Hlavní nástěnka (threadId = null).
  const pinned = await tx.note.create({
    data: { cabinId, userId: u.admin, message: "Vítejte na testovací chatě! Tady si můžete vše bez obav vyzkoušet.", isPinned: true },
  });
  const question = await tx.note.create({
    data: { cabinId, userId: u.jana, message: "Kdo veze tento víkend dřevo?" },
  });
  await tx.note.create({
    data: { cabinId, userId: u.petr, message: "Já beru, mám plný kufr.", replyToId: question.id },
  });
  await tx.note.create({
    data: { cabinId, userId: u.jana, message: "Klíče jsou zase v krabičce u branky.", isResolvedAsTask: true },
  });
  // Reakce (jen povolená emoji 👍 ❤️ 😂 ✅).
  await tx.noteReaction.createMany({
    data: [
      { noteId: pinned.id, userId: u.jana, emoji: "👍" },
      { noteId: pinned.id, userId: u.petr, emoji: "❤️" },
      { noteId: question.id, userId: u.admin, emoji: "✅" },
    ],
  });
  // Vlákna.
  const fence = await tx.noteThread.create({ data: { cabinId, name: "Oprava plotu", createdById: u.admin } });
  await tx.note.createMany({
    data: [
      { cabinId, threadId: fence.id, userId: u.admin, message: "U potoka je vyvrácený sloupek, kdo pomůže?" },
      { cabinId, threadId: fence.id, userId: u.petr, message: "Můžu v sobotu, vezmu vrták." },
    ],
  });
  const bathroom = await tx.noteThread.create({ data: { cabinId, name: "Rekonstrukce koupelny", createdById: u.jana } });
  await tx.note.create({ data: { cabinId, threadId: bathroom.id, userId: u.jana, message: "Vybíráme obklady, hodím sem fotky." } });
  // Stav přečtení – hlavní nástěnka přečtená, vlákno plotu nepřečtené (edge: nepřečtené zprávy).
  await tx.threadReadStatus.createMany({
    data: [
      { cabinId, userId: u.admin, threadId: null, lastReadAt: day(0) },
      { cabinId, userId: u.jana, threadId: null, lastReadAt: day(-1) },
      { cabinId, userId: u.petr, threadId: fence.id, lastReadAt: day(-2) },
    ],
  });
}

async function seedGalleryAndDiary(tx: Tx, cabinId: string, u: DemoUserIds, images: SeedImages) {
  const summer = await tx.galleryFolder.create({ data: { cabinId, name: "Léto na chatě", createdById: u.admin } });
  const [summerPhoto1] = await Promise.all([
    tx.galleryPhoto.create({ data: { folderId: summer.id, src: images.galleryLeto[0], uploadedById: u.admin, description: "Výhled od vody" } }),
    tx.galleryPhoto.create({ data: { folderId: summer.id, src: images.galleryLeto[1], uploadedById: u.jana, description: "Grilovačka na terase" } }),
  ]);
  const winter = await tx.galleryFolder.create({ data: { cabinId, name: "Zima", createdById: u.jana } });
  await tx.galleryPhoto.create({ data: { folderId: winter.id, src: images.galleryZima, uploadedById: u.petr, description: "Zasněžená kůlna" } });

  // Deník – složka s obdobím a aktivitou, záznam s navázanou fotkou z galerie.
  const easter = await tx.diaryFolder.create({
    data: { cabinId, name: "Velikonoce na chatě", createdById: u.admin, startDate: day(-30), endDate: day(-27), activityTag: "family" },
  });
  const entry = await tx.diaryEntry.create({
    data: { folderId: easter.id, authorId: u.jana, entryDate: day(-29), content: "Grilovačka, pak déšť. Děti stavěly bunkr v lese." },
  });
  await tx.diaryEntryPhoto.create({ data: { entryId: entry.id, photoId: summerPhoto1.id } });
  await tx.diaryEntry.create({
    data: { folderId: easter.id, authorId: u.admin, entryDate: day(-28), content: "Hledání vajíček na zahradě, odpoledne výlet k rozhledně." },
  });
  // Druhá složka deníku – jiná aktivita (druhá fotka z galerie je navázaná jen vizuálně).
  const mushrooms = await tx.diaryFolder.create({
    data: { cabinId, name: "Houbařská sezóna", createdById: u.petr, startDate: day(-60), endDate: day(-55), activityTag: "mushroom" },
  });
  await tx.diaryEntry.create({
    data: { folderId: mushrooms.id, authorId: u.petr, entryDate: day(-58), content: "Plný košík hřibů, k večeři smaženice." },
  });
}

async function seedReconstruction(tx: Tx, cabinId: string, u: DemoUserIds) {
  // Nápad s hlasováním.
  const pergola = await tx.reconstructionItem.create({
    data: {
      cabinId, category: "idea", title: "Pergola na terasu", description: "Zastínění nad posezením u vchodu.",
      link: "https://example.invalid/pergoly", status: "pending", createdById: u.jana,
    },
  });
  await tx.reconstructionVote.createMany({ data: [{ itemId: pergola.id, userId: u.jana }, { itemId: pergola.id, userId: u.admin }] });
  await tx.reconstructionItem.create({
    data: { cabinId, category: "idea", title: "Nové schody na půdu", description: "Stávající jsou vratké.", status: "approved", createdById: u.admin },
  });
  // Firma/kontakt.
  await tx.reconstructionItem.create({
    data: {
      cabinId, category: "company", title: "Novák – pokrývač", description: "Oprava střechy kůlny.",
      phone: "+420 777 123 456", email: "novak@example.invalid", specialization: "Pokrývačství",
      link: "https://example.invalid/strechy-novak", status: "contacted", createdById: u.admin,
    },
  });
  // Úkoly – jeden otevřený s termínem a cenou, jeden hotový.
  await tx.reconstructionItem.create({
    data: {
      cabinId, category: "task", title: "Vyměnit baterii v koupelně", description: "Kape, koupit novou.",
      cost: "1200.00", deadline: day(25), tag: "koupelna", status: "pending", createdById: u.petr,
    },
  });
  await tx.reconstructionItem.create({
    data: {
      cabinId, category: "task", title: "Natřít plot", description: "Hotovo na jaře.", cost: "850.00",
      tag: "zahrada", status: "done", createdById: u.jana,
    },
  });
}

async function seedAvailabilityAndNotes(tx: Tx, cabinId: string, u: DemoUserIds) {
  // Osobní volno / dovolené (zobrazí se v kalendáři).
  await tx.userAvailability.createMany({
    data: [
      { cabinId, userId: u.jana, startDate: day(30), endDate: day(44) },
      { cabinId, userId: u.petr, startDate: day(60), endDate: day(67) },
    ],
  });
  // Měsíční poznámky – tento i příští měsíc.
  const thisMonth = yearMonth(0);
  const nextMonth = yearMonth(1);
  await tx.monthlyNote.createMany({
    data: [
      { cabinId, year: thisMonth.year, month: thisMonth.month, updatedById: u.admin, text: "Tento měsíc: vymést komín a zkontrolovat okapy." },
      { cabinId, year: nextMonth.year, month: nextMonth.month, updatedById: u.jana, text: "Příští měsíc: otevřít vodu a připravit chatu na sezónu." },
    ],
  });
}

async function seedInvitesAndWallpapers(tx: Tx, cabinId: string, u: DemoUserIds, images: SeedImages) {
  await tx.inviteLink.createMany({
    data: [
      { cabinId, createdById: u.admin, role: "user", maxUses: 5, usedCount: 1, expiresAt: day(7) },
      { cabinId, createdById: u.admin, role: "admin", maxUses: 1, usedCount: 0, expiresAt: day(14) },
      { cabinId, createdById: u.admin, role: "user", maxUses: 3, usedCount: 3, expiresAt: day(-2) }, // vyčerpaná + prošlá (edge)
    ],
  });
  await tx.wallpaper.createMany({ data: images.wallpapers.map((url) => ({ cabinId, url })) });
}

async function createDemoContent(tx: Tx, cabinId: string, u: DemoUserIds, images: SeedImages) {
  await seedReservations(tx, cabinId, u);
  await seedShopping(tx, cabinId, u);
  await seedInventory(tx, cabinId, u);
  await seedNotes(tx, cabinId, u);
  await seedGalleryAndDiary(tx, cabinId, u, images);
  await seedReconstruction(tx, cabinId, u);
  await seedAvailabilityAndNotes(tx, cabinId, u);
  await seedInvitesAndWallpapers(tx, cabinId, u, images);
}

// ── Orchestrace ───────────────────────────────────────────────────────────────

/** Naseeduje demo chatu do zadané (staging / integrační) DB. Idempotentní. */
export async function runStagingSeed(prisma: PrismaClient, options: RunSeedOptions): Promise<void> {
  const hashes = { admin: await hashPassword(options.adminPassword), member: await hashPassword(options.memberPassword) };
  const images = buildSeedImages();
  await prisma.$transaction(async (tx) => {
    const cabin = await upsertCabin(tx, images);
    const userIds = await upsertDemoUsers(tx, cabin.id, hashes);
    await clearDemoContent(tx, cabin.id);
    await createDemoContent(tx, cabin.id, userIds, images);
  }, { timeout: 60_000 });
  // Teprve po úspěšné DB transakci zapiš fyzické soubory. Když seed skončí chybou dřív
  // (guard, cizí uživatel), na disku nic nevznikne – „fail before writing anything“.
  await writeSeedImageFiles(options.uploadsPath);
}

async function main(): Promise<void> {
  const config = resolveSeedConfig(process.env);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  try {
    await runStagingSeed(prisma, {
      adminPassword: config.adminPassword,
      memberPassword: config.memberPassword,
      uploadsPath: resolveUploadsPath(process.env),
    });
    console.log(`Staging seed OK: cabin '${DEMO_SUBDOMAIN}', users ${DEMO_USERS.map((u) => u.username).join(", ")}.`);
  } finally {
    await prisma.$disconnect();
  }
}

// Spustit jen jako skript (db:seed, smoke), ne při importu z integračního testu.
// Porovnání case-insensitive kvůli písmenu disku na Windows (c:\ vs C:\).
function invokedAsScript(): boolean {
  if (!process.argv[1]) return false;
  const norm = (p: string) => path.normalize(p).toLowerCase();
  return norm(fileURLToPath(import.meta.url)) === norm(path.resolve(process.argv[1]));
}

if (invokedAsScript()) {
  main().catch((error) => {
    console.error("Staging seed failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
