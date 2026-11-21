/**
 * Importuje se jako první modul harnessu – dřív, než config.ts načte `.env` (dotenv nepřepisuje
 * už nastavené proměnné, ale chybějící by doplnil z `.env`, tedy z DB s daty rodiny).
 */
import { assertSafeTestDatabaseUrl } from "./dbGuard";

if (process.env.INTEGRATION_TEST_RUN !== "1") {
  throw new Error("Integrační testy se spouští jen přes `npm run test:integration` (nastaví DATABASE_URL a dočasnou DB).");
}

assertSafeTestDatabaseUrl(process.env.DATABASE_URL);
