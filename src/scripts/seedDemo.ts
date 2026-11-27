/**
 * Fiktivní chata „Chata Pod Lipou“ pro screenshoty landing page a demo (#697): správce a tři smyšlené
 * domácnosti, pobyty v nejbližších týdnech, vyplněná předávka posledního pobytu (briefing k příjezdu)
 * a zásoby, z nichž několik dochází. Žádná reálná data rodiny.
 *
 * Run: DATABASE_URL=…/kdynachatu_demo DEMO_SEED_PASSWORD=… npm run demo:seed
 * Pojistka (seedDemoGuard.ts): název DB musí obsahovat „demo“ nebo „test“, `cabin_reservation` nikdy.
 * Postup s dočasnou DB: README.md, „Fiktivní chata pro screenshoty a demo“.
 *
 * Idempotentní: chata a účty se upsertují, pobyty, zásoby a nákupy chaty se smažou a vytvoří znovu
 * v jedné transakci. Data se tvoří relativně ke dnešku. Seed schválně nečte `.env`: DATABASE_URL se
 * předává výslovně, aby omylem nepřevzal lokální produkční DB.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../utils/password";
import { resolveDemoSeedConfig } from "./seedDemoGuard";

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const SUBDOMAIN = "pod-lipou";

/** Účty = domácnosti; v kalendáři a předávce se ukazuje uživatelské jméno. */
const HOUSEHOLDS = [
  { key: "svobodovi", username: "Svobodovi", role: "admin", color: "#AB47BC", animalIcon: "liska" },
  { key: "novakovi", username: "Novákovi", role: "user", color: "#42A5F5", animalIcon: "veverka" },
  { key: "dvorakovi", username: "Dvořákovi", role: "user", color: "#66BB6A", animalIcon: "jezek" },
  { key: "krejcovi", username: "Krejčovi", role: "user", color: "#EF6C00", animalIcon: "kralik" },
] as const;

type HouseholdIds = Record<(typeof HOUSEHOLDS)[number]["key"], string>;

/** Datum (UTC půlnoc) posunuté o `offset` dní od dneška. */
function day(offset: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
}

async function upsertCabin(tx: Tx) {
  const data = {
    name: "Chata Pod Lipou",
    description: "Dřevěná chata u lesa, kterou se střídají čtyři rodiny. Fiktivní chata pro ukázku aplikace.",
    welcomeMessage: "Vítej Pod Lipou! Dřevo je v kůlně, klíč v krabičce u branky.",
    address: "Pod Lipou 7, Horní Lhota",
    rules: "## Domácí řád\n\n- Po sobě uklidit a vynést koš.\n- Dřevo doplnit, když dojde.\n- Poslední zhasíná a zamyká kůlnu.",
    departureChecklist: ["Vypnuté topení", "Uzavřená voda", "Vybraný popel z kamen", "Prázdná lednice", "Zamčeno"],
    weatherLocation: null,
    isWinterized: false,
    features: { reservations: true, shopping: true, inventory: true, notes: true, gallery: false, diary: false, reconstruction: false },
  };
  return tx.cabin.upsert({ where: { subdomain: SUBDOMAIN }, update: data, create: { ...data, subdomain: SUBDOMAIN } });
}

async function upsertHouseholds(tx: Tx, cabinId: string, passwordHash: string): Promise<HouseholdIds> {
  const ids = {} as HouseholdIds;
  for (const { key, ...household } of HOUSEHOLDS) {
    const existing = await tx.user.findUnique({ where: { username: household.username }, select: { cabinId: true } });
    if (existing && existing.cabinId !== cabinId) {
      throw new Error(`User '${household.username}' exists outside the demo cabin; refusing to take it over.`);
    }
    const data = {
      ...household,
      email: `${key}@example.invalid`,
      passwordHash,
      cabinId,
      isVerified: true,
      isEmailVerified: true,
      isBanned: false,
      isSuperAdmin: false,
    };
    ids[key] = (await tx.user.upsert({ where: { username: household.username }, update: data, create: data })).id;
  }
  return ids;
}

async function clearContent(tx: Tx, cabinId: string) {
  await tx.reservation.deleteMany({ where: { cabinId } }); // účastníci kaskádou
  await tx.inventoryItem.deleteMany({ where: { cabinId } });
  await tx.shoppingList.deleteMany({ where: { cabinId } }); // položky kaskádou
}

async function seedReservations(tx: Tx, cabinId: string, households: HouseholdIds) {
  // Poslední pobyt s vyplněnou předávkou = briefing k příjezdu („Od minule“).
  await tx.reservation.create({
    data: {
      cabinId, userId: households.novakovi, dateFrom: day(-5), dateTo: day(-2), purpose: "Prodloužený víkend",
      status: "primary", isCheckoutCompleted: true, checkoutCompletedBy: households.novakovi, checkoutCompletedAt: day(-2),
      checkoutState: {
        gas: "low", heatingOff: true, waterOff: true,
        broken: "Kape kohoutek v kuchyni.",
        leftBehind: "Nařezané dřevo pod přístřeškem, sklenice medu ve spíži.",
        note: "Klíč od kůlny visí za dveřmi na háčku.",
      },
      checkoutStateAt: day(-2),
    },
  });
  await tx.reservation.create({
    data: { cabinId, userId: households.krejcovi, dateFrom: day(-16), dateTo: day(-12), purpose: "Podzimní úklid zahrady", status: "primary", isCheckoutCompleted: true },
  });
  const family = await tx.reservation.create({
    data: { cabinId, userId: households.svobodovi, dateFrom: day(2), dateTo: day(5), purpose: "Víkend s dětmi", status: "primary" },
  });
  await tx.reservationParticipant.create({ data: { reservationId: family.id, userId: households.krejcovi } });
  await tx.reservation.createMany({
    data: [
      { cabinId, userId: households.dvorakovi, dateFrom: day(9), dateTo: day(12), purpose: "Pečení cukroví", status: "primary" },
      { cabinId, userId: households.novakovi, dateFrom: day(16), dateTo: day(19), purpose: "Rybaření", status: "primary" },
      { cabinId, userId: households.krejcovi, dateFrom: day(21), dateTo: day(24), purpose: "Výlet na běžky", status: "primary" },
      { cabinId, userId: households.dvorakovi, dateFrom: day(26), dateTo: day(32), purpose: "Vánoce na chatě", status: "soft" },
    ],
  });
}

async function seedSupplies(tx: Tx, cabinId: string, households: HouseholdIds) {
  await tx.inventoryItem.createMany({
    data: [
      { cabinId, name: "Dřevo na topení", category: "OSTATNÍ", status: "LOW", location: "Kůlna", isEssential: true, updatedById: households.novakovi },
      { cabinId, name: "Toaletní papír", category: "HYGIENA", status: "LOW", location: "Koupelna", isEssential: true, updatedById: households.novakovi },
      { cabinId, name: "Káva", category: "NÁPOJE", status: "EMPTY", location: "Spíž", isEssential: true, updatedById: households.krejcovi },
      { cabinId, name: "Sirky", category: "OSTATNÍ", status: "LOW", location: "U kamen", inCart: true, updatedById: households.svobodovi },
      { cabinId, name: "Jar na nádobí", category: "HYGIENA", status: "LOW", location: "Pod dřezem", updatedById: households.dvorakovi },
      { cabinId, name: "Sůl", category: "KOŘENÍ", status: "OK", location: "Spíž", isEssential: true, updatedById: households.svobodovi },
      { cabinId, name: "Těstoviny", category: "TRVANLIVÉ", status: "OK", location: "Spíž", updatedById: households.dvorakovi },
      { cabinId, name: "Olej", category: "TRVANLIVÉ", status: "OK", location: "Spíž", updatedById: households.krejcovi },
      { cabinId, name: "Čaj", category: "NÁPOJE", status: "OK", location: "Spíž", updatedById: households.krejcovi },
      { cabinId, name: "Pytle na odpadky", category: "OSTATNÍ", status: "OK", location: "Pod dřezem", updatedById: households.svobodovi },
    ],
  });
  const list = await tx.shoppingList.create({ data: { cabinId, name: "Nákup na víkend", createdById: households.svobodovi } });
  await tx.shoppingListItem.createMany({
    data: [
      { listId: list.id, name: "Rohlíky", addedById: households.svobodovi, status: "pending" },
      { listId: list.id, name: "Mléko", addedById: households.krejcovi, status: "pending" },
      { listId: list.id, name: "Brambory", addedById: households.svobodovi, status: "bring_from_home" },
    ],
  });
}

/** Naseeduje „Chatu Pod Lipou“ do zadané (demo / testovací) DB. Idempotentní. */
export async function runDemoSeed(prisma: PrismaClient, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const cabin = await upsertCabin(tx);
    const ids = await upsertHouseholds(tx, cabin.id, passwordHash);
    await clearContent(tx, cabin.id);
    await seedReservations(tx, cabin.id, ids);
    await seedSupplies(tx, cabin.id, ids);
  }, { timeout: 60_000 });
}

async function main(): Promise<void> {
  const config = resolveDemoSeedConfig(process.env);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  try {
    await runDemoSeed(prisma, config.password);
    console.log(`Demo seed OK: cabin '${SUBDOMAIN}', users ${HOUSEHOLDS.map((h) => h.username).join(", ")}.`);
  } finally {
    await prisma.$disconnect();
  }
}

// Spustit jen jako skript, ne při importu. Case-insensitive kvůli písmenu disku na Windows.
const invokedAsScript = Boolean(process.argv[1])
  && path.normalize(fileURLToPath(import.meta.url)).toLowerCase() === path.resolve(process.argv[1]).toLowerCase();

if (invokedAsScript) {
  main().catch((error) => {
    console.error("Demo seed failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
