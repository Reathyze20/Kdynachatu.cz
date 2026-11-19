/**
 * Pojistka integračních testů: harness smí migrovat a truncatovat jen databázi, která je
 * zjevně testovací (lokální Postgres na 5432 má DB `cabin_reservation` s produkčními daty rodiny).
 * Lokální běh navíc používá vždy dočasný kontejner na portu 5433 (runIntegrationTests.ts).
 * Bez importů z aplikace, aby šel použít ještě před načtením config.ts (dotenv).
 */

const KNOWN_PRODUCTION_DATABASES = new Set(["cabin_reservation"]);

/** Vyhodí chybu, pokud název databáze nevypadá jako testovací. */
export function assertSafeTestDatabaseName(name: string): void {
  if (KNOWN_PRODUCTION_DATABASES.has(name)) {
    throw new Error(`Integrační testy odmítly databázi "${name}": je to známá produkční databáze.`);
  }
  if (!name.toLowerCase().includes("test")) {
    throw new Error(`Integrační testy odmítly databázi "${name}": název musí obsahovat "test".`);
  }
}

/** Ověří DATABASE_URL pro integrační testy a vrátí název databáze. */
export function assertSafeTestDatabaseUrl(rawUrl: string | undefined): string {
  if (!rawUrl?.trim()) {
    throw new Error("Integrační testy potřebují DATABASE_URL nastavenou skriptem `npm run test:integration`.");
  }

  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("Integrační testy: DATABASE_URL je neplatná URL.");
  }

  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  assertSafeTestDatabaseName(name);
  return name;
}
