/**
 * Registry tenant mutací (#361): co spouštěč (#365) s nalezenými mutanty udělá.
 *  - `ROUTE_ITEST_MAP`: soubor rout → itesty, které se pro jeho mutanty spustí. Prázdný seznam
 *    = „bez testu“: mutanti se nespouštějí a hlásí se jako „přežil – bez testu“.
 *  - `TENANT_MUTANT_EXCEPTIONS`: prokazatelně ekvivalentní mutanti s povinným důvodem. Páruje se
 *    podle souboru, routy (přesně jak ji dá `findTenantMutants`, u helperu i s `, `) a úryvku
 *    s normalizovanými mezerami – číslo řádku se nepoužije, ať výjimku nerozbije vedlejší úprava.
 *    Výjimka musí odpovídat právě jednomu mutantu, jinak je nejednoznačná a úryvek se zpřesní.
 * `checkMutantRegistries` (čistá, vzor `reconcileCoverage`) hlídá, že registry neodplavou od kódu;
 * meta-test v `tenantMutantRegistry.test.ts` ji pouští nad skutečnými soubory.
 */
import fs from "node:fs";
import path from "node:path";
import { integrationDir } from "./integration/cabinTenantCoverage";
import type { TenantMutant } from "./tenantMutants";

/**
 * Klíč = název souboru v `src/backend/routes/`, hodnota = názvy `*.itest.ts` v
 * `src/testing/integration/`, které volají jeho endpointy. `users.ts` → `auth.itest.ts`, i když
 * `/api/users` žádný itest nevolá: mutace tu díru ukáže. Soubor bez mutantů (`workspace.ts`)
 * zápis nepotřebuje.
 */
export type RouteItestMap = Readonly<Record<string, readonly string[]>>;

export const ROUTE_ITEST_MAP: RouteItestMap = {
  "admin.ts": ["admin.itest.ts"],
  "cabin.ts": ["cabinCoverPhoto.itest.ts", "cabinMunicipality.itest.ts"],
  "channels.ts": ["chat.itest.ts"],
  "dashboard.ts": ["handover.itest.ts", "shopping.itest.ts"],
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
  "users.ts": ["auth.itest.ts"],
  "wallpapers.ts": ["wallpapers.itest.ts"],
};

export interface TenantMutantException {
  file: string; // název souboru rout, např. `diary.ts`
  route: string | null; // přesně jako `TenantMutant.route`
  original: string; // úryvek mutovaného místa; mezery a zalomení se při párování normalizují
  reason: string; // povinný: proč je mutant ekvivalentní
}

/** Ekvivalentní mutanti. Na začátku prázdné; každý přeživší je nejdřív kandidát na test, ne sem. */
export const TENANT_MUTANT_EXCEPTIONS: readonly TenantMutantException[] = [];

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

const describeException = (e: TenantMutantException) => `${e.file} ${e.route ?? "(bez routy)"} "${normalize(e.original)}"`;

function matches(mutant: TenantMutant, exception: TenantMutantException): boolean {
  return routeFileOf(mutant) === exception.file &&
    mutant.route === exception.route &&
    normalize(mutant.original) === normalize(exception.original);
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
    } else if (matched.length > 1) {
      // Holý úryvek `cabinId` sdílí v jedné routě i desítka mutantů; výjimka by umlčela všechny.
      const places = matched.map((mutant) => `${mutant.file}:${mutant.line}`).join(", ");
      errors.push({ kind: "ambiguous-exception", message: `Výjimka ${describeException(exception)} odpovídá ${matched.length} mutantům (${places}) – zpřesni úryvek.` });
    }
  }
  return errors;
}

/** Názvy existujících `*.itest.ts` v `src/testing/integration/`. */
export function itestFileNames(): string[] {
  return fs.readdirSync(integrationDir).filter((name) => name.endsWith(".itest.ts")).sort();
}
