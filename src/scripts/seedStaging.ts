/**
 * Fiktivní data pro staging: chata `demo`, 1 správce + 2 členové, rezervace,
 * nákupy, poznámky k měsíci a chat (vlákna/zprávy). Žádná reálná data rodiny.
 *
 * Run: npm run db:seed   (DEPLOY_TARGET=staging, DB končící na _staging,
 *      STAGING_SEED_ADMIN_PASSWORD + STAGING_SEED_MEMBER_PASSWORD, viz .env.staging.example)
 *
 * Idempotentní: chata a účty se upsertují, obsah chaty `demo` se smaže a vytvoří
 * znovu v jedné transakci. Jiné chaty se nemění. Smoke: npm run staging:seed-smoke.
 */
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";
import { hashPassword } from "../utils/password";
import { resolveSeedConfig } from "./seedStagingConfig";

dotenv.config();

const DEMO_SUBDOMAIN = "demo";
const DEMO_USERS = [
  { key: "admin", username: "demo-spravce", email: "spravce@demo.invalid", role: "admin", color: "#AB47BC", animalIcon: "liska" },
  { key: "jana", username: "demo-jana", email: "jana@demo.invalid", role: "user", color: "#42A5F5", animalIcon: "veverka" },
  { key: "petr", username: "demo-petr", email: "petr@demo.invalid", role: "user", color: "#66BB6A", animalIcon: "jezek" },
] as const;

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Datum (UTC půlnoc) posunuté o `offset` dní od dneška – data zůstávají „aktuální“. */
function day(offset: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
}

async function upsertDemoUsers(tx: Tx, cabinId: string, hashes: { admin: string; member: string }) {
  const ids = {} as Record<(typeof DEMO_USERS)[number]["key"], string>;
  for (const { key, ...user } of DEMO_USERS) {
    const existing = await tx.user.findUnique({ where: { username: user.username }, select: { cabinId: true } });
    if (existing?.cabinId && existing.cabinId !== cabinId) {
      throw new Error(`User '${user.username}' belongs to another cabin; refusing to move it.`);
    }
    const data = {
      ...user,
      passwordHash: key === "admin" ? hashes.admin : hashes.member,
      cabinId,
      isVerified: true,
      isEmailVerified: true,
      isBanned: false,
    };
    const saved = await tx.user.upsert({ where: { username: user.username }, update: data, create: data });
    ids[key] = saved.id;
  }
  return ids;
}

/** Smaže obsah chaty `demo` (jen tyto tabulky, jen tato chata) – druhý běh pak nic nezduplikuje. */
async function clearDemoContent(tx: Tx, cabinId: string) {
  await tx.note.deleteMany({ where: { cabinId } });
  await tx.threadReadStatus.deleteMany({ where: { cabinId } });
  await tx.noteThread.deleteMany({ where: { cabinId } });
  await tx.shoppingList.deleteMany({ where: { cabinId } }); // položky mažou kaskádou
  await tx.reservation.deleteMany({ where: { cabinId } });
  await tx.monthlyNote.deleteMany({ where: { cabinId } });
}

async function createDemoContent(tx: Tx, cabinId: string, u: Record<"admin" | "jana" | "petr", string>) {
  await tx.reservation.createMany({
    data: [
      { cabinId, userId: u.jana, dateFrom: day(-10), dateTo: day(-7), purpose: "Prodloužený víkend",
        handoverNote: "Dřevo dochází, plyn je zavřený.", isCheckoutCompleted: true },
      { cabinId, userId: u.petr, dateFrom: day(5), dateTo: day(8), purpose: "Rybaření s kamarády" },
      { cabinId, userId: u.admin, dateFrom: day(14), dateTo: day(21), purpose: "Rodinná dovolená" },
      { cabinId, userId: u.jana, dateFrom: day(16), dateTo: day(18), purpose: "Kdyby se uvolnilo", status: "backup" },
    ],
  });

  const list = await tx.shoppingList.create({ data: { cabinId, name: "Nákup na víkend", createdById: u.petr } });
  await tx.shoppingListItem.createMany({
    data: [
      { listId: list.id, name: "Rohlíky", addedById: u.petr },
      { listId: list.id, name: "Káva", addedById: u.jana, isEssential: true },
      { listId: list.id, name: "Pytle na odpadky", addedById: u.admin, status: "bring_from_home" },
      { listId: list.id, name: "Dřevěné uhlí", addedById: u.petr, status: "purchased", purchased: true,
        purchasedById: u.jana, purchasedAt: day(-8), price: "189.00" },
    ],
  });

  await tx.note.createMany({
    data: [
      { cabinId, userId: u.admin, message: "Vítejte na testovací chatě! Tady si můžete vše bez obav vyzkoušet.", isPinned: true },
      { cabinId, userId: u.jana, message: "Klíče jsou zase v krabičce u branky." },
      { cabinId, userId: u.petr, message: "Díky! Příští týden vezu novou hadici na zahradu." },
    ],
  });
  const thread = await tx.noteThread.create({ data: { cabinId, name: "Oprava plotu", createdById: u.admin } });
  await tx.note.createMany({
    data: [
      { cabinId, threadId: thread.id, userId: u.admin, message: "U potoka je vyvrácený sloupek, kdo pomůže?" },
      { cabinId, threadId: thread.id, userId: u.petr, message: "Můžu v sobotu, vezmu vrták." },
    ],
  });

  const today = day(0);
  await tx.monthlyNote.create({
    data: { cabinId, year: today.getUTCFullYear(), month: today.getUTCMonth() + 1, updatedById: u.admin,
      text: "Tento měsíc: vymést komín a zkontrolovat okapy." },
  });
}

async function main(): Promise<void> {
  const config = resolveSeedConfig(process.env);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  try {
    const hashes = { admin: await hashPassword(config.adminPassword), member: await hashPassword(config.memberPassword) };
    await prisma.$transaction(async (tx) => {
      const cabinData = { name: "Testovací chata", weatherLocation: "Praha",
        description: "Fiktivní chata pro staging – data nepatří žádné rodině." };
      const cabin = await tx.cabin.upsert({
        where: { subdomain: DEMO_SUBDOMAIN },
        update: cabinData,
        create: { ...cabinData, subdomain: DEMO_SUBDOMAIN },
      });
      const userIds = await upsertDemoUsers(tx, cabin.id, hashes);
      await clearDemoContent(tx, cabin.id);
      await createDemoContent(tx, cabin.id, userIds);
    });
    console.log(`Staging seed OK: cabin '${DEMO_SUBDOMAIN}', users ${DEMO_USERS.map((u) => u.username).join(", ")}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Staging seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
