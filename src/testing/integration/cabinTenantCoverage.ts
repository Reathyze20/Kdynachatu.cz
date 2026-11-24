/**
 * Meta-guard tenant pokrytí: každý model v `prisma/schema.prisma` s PŘÍMÝM polem `cabinId`
 * musí mít záznam v registru `CABIN_MODEL_COVERAGE` níže — ten říká, jak je tenant-izolace
 * daného modelu pokrytá. Když někdo přidá nový doménový model s `cabinId` a nezapíše ho sem,
 * test `cabinTenantCoverage.test.ts` zčervená a pojmenuje konkrétní model.
 *
 * Čistá statická analýza souborů (jen `fs` + parsing schématu) — běží v `npm run test:backend`
 * i preflightu bez databáze. Modely se NEHARDCODUJÍ, čtou se ze schématu parserem.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const integrationDir = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(integrationDir, "../../..");
export const SCHEMA_PATH = path.join(PROJECT_ROOT, "prisma", "schema.prisma");

export interface PrismaModel {
  name: string;
  /** Názvy polí (skalárních i relačních) v pořadí, jak jsou ve schématu. */
  fieldNames: string[];
}

/**
 * Robustně vyparsuje modely a názvy jejich polí ze schématu. Odolné vůči formátování:
 * libovolné mezery kolem `model X {`, blokové atributy (`@@index`, `@@map`) i komentáře
 * se ignorují. Komentáře se stripují PŘED hledáním bloků — jinak by `}` uvnitř komentáře
 * (např. `// JSON: { … }` u Reservation) předčasně ukončilo tělo modelu a pole za ním by
 * zmizela. Bere se první identifikátor na řádku = název pole. Relace `cabin Cabin
 * @relation(fields: [cabinId], …)` se NEzamění za pole `cabinId` (první token je `cabin`).
 */
export function parsePrismaModels(schema: string): PrismaModel[] {
  const withoutComments = schema
    .replace(/\/\*[\s\S]*?\*\//g, "") // blokové komentáře /* … */
    .replace(/\/\/[^\n]*/g, ""); // řádkové komentáře // … (vč. doc ///)
  const models: PrismaModel[] = [];
  const modelBlock = /\bmodel\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let match: RegExpExecArray | null;
  while ((match = modelBlock.exec(withoutComments)) !== null) {
    const [, name, body] = match;
    const fieldNames: string[] = [];
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (line === "" || line.startsWith("@@")) continue;
      const token = line.match(/^([A-Za-z_]\w*)/);
      if (token) fieldNames.push(token[1]);
    }
    models.push({ name, fieldNames });
  }
  return models;
}

/** Názvy modelů s přímým polem `cabinId`, abecedně seřazené. */
export function modelsWithCabinId(schema: string): string[] {
  return parsePrismaModels(schema)
    .filter((model) => model.fieldNames.includes("cabinId"))
    .map((model) => model.name)
    .sort();
}

/**
 * Jak je tenant-izolace modelu pokrytá:
 *  - `direct`   – model má vlastní endpointy a dedikovaný `*.itest.ts` s tenant testy
 *                 (soubor se ověřuje přes `fs`, že reálně existuje).
 *  - `indirect` – model nemá vlastní endpointy, izolace je zděděná přes relaci k rodiči
 *                 (join/read-status/reaction tabulky) — `reason` jmenuje rodiče/důvod.
 *  - `gap`      – model má vlastní tenant endpointy, ale dedikovaný tenant itest zatím
 *                 NEEXISTUJE. Poctivě přiznaný dluh (budoucí ticket), ne falešné „pokryto“.
 */
export type Coverage =
  | { status: "direct"; itestFile: string }
  | { status: "indirect"; reason: string }
  | { status: "gap"; reason: string };

export const coveredBy = (itestFile: string): Coverage => ({ status: "direct", itestFile });
export const coveredIndirectly = (reason: string): Coverage => ({ status: "indirect", reason });
export const coverageGap = (reason: string): Coverage => ({ status: "gap", reason });

/**
 * Registr: model → jak je pokrytý. Klíče MUSÍ přesně odpovídat množině modelů s `cabinId`
 * ve schématu (hlídá `reconcileCoverage`). `User.cabinId` je členství uživatele v chatě;
 * jeho izolaci testuje auth.itest.ts (login/ban/reset nevydá účty cizí chaty).
 */
export const CABIN_MODEL_COVERAGE: Record<string, Coverage> = {
  // ── Pokryto dedikovaným tenant itestem ───────────────────────────────────
  Reservation: coveredBy("reservations.itest.ts"),
  UserAvailability: coveredBy("reservations.itest.ts"), // izolace volna ověřena v reservations.itest.ts
  ShoppingList: coveredBy("shopping.itest.ts"),
  Note: coveredBy("notes.itest.ts"),
  NoteThread: coveredBy("notes.itest.ts"),
  GalleryFolder: coveredBy("gallery.itest.ts"),
  ThreadReadStatus: coveredBy("chat.itest.ts"), // read-status tabulka; izolace ověřena v chat.itest.ts
  User: coveredBy("auth.itest.ts"),
  Wallpaper: coveredBy("wallpapers.itest.ts"),
  InviteLink: coveredBy("invites.itest.ts"),
  DiaryFolder: coveredBy("diary.itest.ts"),
  InventoryItem: coveredBy("inventory.itest.ts"),
  ReconstructionItem: coveredBy("reconstruction.itest.ts"),
  MonthlyNote: coveredBy("monthlyNote.itest.ts"),
};

export interface CoverageReport {
  ok: boolean;
  /** Modely s `cabinId` ve schématu, které v registru chybí → přidej je. */
  missingFromRegistry: string[];
  /** Klíče registru, které už nejsou modelem s `cabinId` ve schématu → ukliď je. */
  staleRegistryKeys: string[];
}

/** Porovná množinu modelů s `cabinId` ze schématu s klíči registru (čistá logika). */
export function reconcileCoverage(schemaModels: string[], registryKeys: string[]): CoverageReport {
  const schema = new Set(schemaModels);
  const registry = new Set(registryKeys);
  const missingFromRegistry = schemaModels.filter((model) => !registry.has(model)).sort();
  const staleRegistryKeys = registryKeys.filter((key) => !schema.has(key)).sort();
  return {
    ok: missingFromRegistry.length === 0 && staleRegistryKeys.length === 0,
    missingFromRegistry,
    staleRegistryKeys,
  };
}

/** Modely, jejichž tenant itest zatím chybí (status `gap`) — poctivě vedený dluh. */
export function coverageGaps(registry: Record<string, Coverage> = CABIN_MODEL_COVERAGE): string[] {
  return Object.entries(registry)
    .filter(([, coverage]) => coverage.status === "gap")
    .map(([model]) => model)
    .sort();
}

/** Absolutní cesta k `*.itest.ts` souboru odkazovanému ze záznamu `direct`. */
export function itestPath(itestFile: string): string {
  return path.join(integrationDir, itestFile);
}

/** Načte text aktuálního `prisma/schema.prisma`. */
export function readSchema(): string {
  return fs.readFileSync(SCHEMA_PATH, "utf8");
}
