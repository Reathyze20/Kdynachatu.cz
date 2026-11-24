/**
 * Registry tenant mutací (#361): co spouštěč (#365) s nalezenými mutanty udělá.
 *  - `ROUTE_ITEST_MAP`: soubor rout → itesty, které se pro jeho mutanty spustí. Prázdný seznam
 *    = „bez testu“: mutanti se nespouštějí a hlásí se jako „přežil – bez testu“.
 *  - `TENANT_MUTANT_EXCEPTIONS`: prokazatelně ekvivalentní mutanti s povinným důvodem. Páruje se
 *    podle souboru, routy (přesně jak ji dá `findTenantMutants`, u helperu i s `, `) a úryvku
 *    s normalizovanými mezerami – číslo řádku se nepoužije, ať výjimku nerozbije vedlejší úprava.
 *    Výjimka musí odpovídat právě jednomu mutantu, jinak je nejednoznačná a úryvek se zpřesní.
 *    Když holý úryvek (`cabinId`) sdílí v routě víc mutantů, zpřesní ho `mutatedLine` (úryvek řádku
 *    po mutaci); textově shodná místa se stejným důvodem pokryje jedna výjimka s `count`.
 * `checkMutantRegistries` (čistá, vzor `reconcileCoverage`) hlídá, že registry neodplavou od kódu;
 * meta-test v `tenantMutantRegistry.test.ts` ji pouští nad skutečnými soubory.
 */
import fs from "node:fs";
import path from "node:path";
import { integrationDir } from "./integration/cabinTenantCoverage";
import type { TenantMutant } from "./tenantMutants";

/**
 * Klíč = název souboru v `src/backend/routes/`, hodnota = názvy `*.itest.ts` v
 * `src/testing/integration/`, které volají jeho endpointy. Soubor bez mutantů (`workspace.ts`)
 * zápis nepotřebuje.
 */
export type RouteItestMap = Readonly<Record<string, readonly string[]>>;

export const ROUTE_ITEST_MAP: RouteItestMap = {
  "admin.ts": ["admin.itest.ts"],
  "cabin.ts": ["cabinCoverPhoto.itest.ts", "cabinMunicipality.itest.ts"],
  "channels.ts": ["chat.itest.ts"],
  "dashboard.ts": ["dashboard.itest.ts", "handover.itest.ts", "shopping.itest.ts"],
  "diary.ts": ["diary.itest.ts"],
  "gallery.ts": ["gallery.itest.ts", "cabinCoverPhoto.itest.ts"],
  "inventory.ts": ["inventory.itest.ts", "shopping.itest.ts"],
  "invites.ts": ["invites.itest.ts"],
  "logs.ts": [],
  "messages.ts": ["chat.itest.ts"],
  "noteThreads.ts": ["notes.itest.ts"],
  "notes.ts": ["notes.itest.ts"],
  "reconstruction.ts": ["reconstruction.itest.ts"],
  "reservations.ts": ["reservations.itest.ts", "monthlyNote.itest.ts", "handover.itest.ts", "notes.itest.ts"],
  "shoppingList.ts": ["shopping.itest.ts"],
  "shoppingLists.ts": ["shopping.itest.ts"],
  "users.ts": ["users.itest.ts"],
  "wallpapers.ts": ["wallpapers.itest.ts"],
};

export interface TenantMutantException {
  file: string; // název souboru rout, např. `diary.ts`
  route: string | null; // přesně jako `TenantMutant.route`
  original: string; // úryvek mutovaného místa; mezery a zalomení se při párování normalizují
  mutatedLine?: string; // volitelně: úryvek, který musí obsahovat řádek mutanta po mutaci (normalizovaně)
  count?: number; // kolik mutantů výjimka pokrývá, default 1; víc jen pro textově shodná místa
  reason: string; // povinný: proč je mutant ekvivalentní
}

/** Ekvivalentní mutanti. Každý přeživší je nejdřív kandidát na test, sem jen s doloženým důvodem. */
export const TENANT_MUTANT_EXCEPTIONS: readonly TenantMutantException[] = [
  {
    file: "users.ts",
    route: "POST /api/users",
    original: "cabinId: req.user.cabinId",
    reason:
      "Kontrola duplicity jména před create. `User.username` je ve schématu globálně @unique, takže jméno " +
      "z cizí chaty nevznikne ani bez filtru: originál skončí na unikátním indexu (500), mutant hláškou " +
      "„Uživatel již existuje.“ (400). Nic se nevytvoří ani nezmění a mutant neprozradí nic nového – " +
      "globální obsazenost jména hlásí už veřejná registrace (409). Test v users.itest.ts to ověřuje.",
  },
  {
    file: "users.ts",
    route: "DELETE /api/users/me",
    original: "cabinId: user.cabinId",
    reason:
      "Nedosažitelný kód: `router.delete(\"/:id\")` je registrovaný dřív a `DELETE /api/users/me` obslouží " +
      "s id `me` (člen 403, správce 404), handler `/me` se nespustí nikdy – mutant je ekvivalentní. " +
      "Bug #419; s jeho opravou výjimku smazat a doplnit test posledního admina do users.itest.ts.",
  },
  {
    file: "inventory.ts",
    route: "POST /api/inventory/:id/pledge",
    original: "cabinId",
    mutatedLine: "tx.inventoryItem.updateMany({ where: { id: supply.id }",
    count: 2,
    reason:
      "Doplnění zásoby v obou větvích „Koupím já“ (existující i nová položka nákupu). `supply` route " +
      "načetla přes `findFirst({ id, cabinId })` (jeho mutanta zabíjí shopping.itest.ts) a `id` je " +
      "primární klíč; `cabinId` zásoby žádná route nemění. `{ id: supply.id }` tak označí právě tutéž " +
      "zásobu chaty A jako `{ id: supply.id, cabinId }` – mutant je ekvivalentní.",
  },
];

export type RegistryErrorKind =
  | "unmapped-route-file"
  | "stale-map-entry"
  | "missing-itest"
  | "exception-without-reason"
  | "unmatched-exception"
  | "ambiguous-exception";

export interface RegistryError {
  kind: RegistryErrorKind;
  message: string;
}

export interface RegistryInput {
  mutants: TenantMutant[];
  routeFiles: string[]; // existující soubory rout (názvy)
  itestFiles: string[]; // existující `*.itest.ts` (názvy)
  map: RouteItestMap;
  exceptions: readonly TenantMutantException[];
}

/** Soubor rout mutanta tak, jak se píše v mapě a výjimkách (`notes.ts`). */
export const routeFileOf = (mutant: TenantMutant) => path.posix.basename(mutant.file);

const normalize = (snippet: string) => snippet.replace(/\s+/g, " ").trim();

const describeException = (e: TenantMutantException) =>
  `${e.file} ${e.route ?? "(bez routy)"} "${normalize(e.original)}"${e.mutatedLine ? ` (řádek po mutaci "${normalize(e.mutatedLine)}")` : ""}`;

/** Řádek mutanta v jeho zmutovaném zdroji (mutace v rámci řádku čísla řádků neposune). */
const mutatedLineOf = (mutant: TenantMutant) => mutant.mutatedSource.split("\n")[mutant.line - 1] ?? "";

function matches(mutant: TenantMutant, exception: TenantMutantException): boolean {
  return routeFileOf(mutant) === exception.file &&
    mutant.route === exception.route &&
    normalize(mutant.original) === normalize(exception.original) &&
    (exception.mutatedLine === undefined || normalize(mutatedLineOf(mutant)).includes(normalize(exception.mutatedLine)));
}

/** Výjimka, pod kterou mutant spadá (s důvodem), jinak `undefined`. */
export function exceptionFor(mutant: TenantMutant, exceptions = TENANT_MUTANT_EXCEPTIONS): TenantMutantException | undefined {
  return exceptions.find((exception) => matches(mutant, exception));
}

export function checkMutantRegistries({ mutants, routeFiles, itestFiles, map, exceptions }: RegistryInput): RegistryError[] {
  const errors: RegistryError[] = [];
  const mutatedFiles = [...new Set(mutants.map(routeFileOf))].sort();
  for (const file of mutatedFiles.filter((f) => !(f in map))) {
    errors.push({ kind: "unmapped-route-file", message: `${file}: má tenant mutanty, ale chybí v ROUTE_ITEST_MAP (přidej itesty, nebo [] = bez testu).` });
  }
  for (const [file, itests] of Object.entries(map)) {
    if (!routeFiles.includes(file)) {
      errors.push({ kind: "stale-map-entry", message: `${file}: záznam v ROUTE_ITEST_MAP, ale soubor rout neexistuje.` });
    }
    for (const itest of itests.filter((name) => !itestFiles.includes(name))) {
      errors.push({ kind: "missing-itest", message: `${file}: odkazovaný itest ${itest} neexistuje.` });
    }
  }
  for (const exception of exceptions) {
    if (!exception.reason.trim()) {
      errors.push({ kind: "exception-without-reason", message: `Výjimka ${describeException(exception)} nemá důvod.` });
    }
    const matched = mutants.filter((mutant) => matches(mutant, exception));
    if (matched.length === 0) {
      errors.push({ kind: "unmatched-exception", message: `Výjimce ${describeException(exception)} neodpovídá žádný mutant – smaž ji.` });
    } else if (matched.length !== (exception.count ?? 1)) {
      // Holý úryvek `cabinId` sdílí v jedné routě i desítka mutantů; výjimka by umlčela všechny.
      const places = matched.map((mutant) => `${mutant.file}:${mutant.line}`).join(", ");
      const expected = exception.count === undefined ? "" : `, čeká se ${exception.count}`;
      errors.push({ kind: "ambiguous-exception", message: `Výjimka ${describeException(exception)} odpovídá ${matched.length} mutantům (${places})${expected} – zpřesni úryvek.` });
    }
  }
  return errors;
}

/** Názvy existujících `*.itest.ts` v `src/testing/integration/`. */
export function itestFileNames(): string[] {
  return fs.readdirSync(integrationDir).filter((name) => name.endsWith(".itest.ts")).sort();
}
