/**
 * Pojistka seedu fiktivní chaty „Chata Pod Lipou“ (`seedDemo.ts`, #697). Lokální Postgres na 5432 má
 * DB `cabin_reservation` s produkčními daty rodiny, proto seed běží jen proti DB, jejíž název obsahuje
 * „demo“ nebo „test“, a známou produkční DB odmítne vždy (vzor: testing/integration/dbGuard.ts).
 * Bez importu config.ts (ten bez JWT_SECRET ukončí proces).
 */
import { KNOWN_PRODUCTION_DATABASES } from "../testing/integration/dbGuard";
import { requirePassword } from "./seedStagingConfig";

export interface DemoSeedConfig {
  databaseUrl: string;
  /** Společné heslo všech fiktivních účtů. */
  password: string;
}

type Env = Record<string, string | undefined>;

/** Ověří DATABASE_URL pro demo seed a vrátí název databáze. */
export function assertSafeDemoDatabaseUrl(rawUrl: string | undefined): string {
  if (!rawUrl?.trim()) {
    throw new Error("Demo seed needs DATABASE_URL pointing to a disposable demo database.");
  }
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("Demo seed: DATABASE_URL is not a valid URL.");
  }
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (KNOWN_PRODUCTION_DATABASES.has(name)) {
    throw new Error(`Demo seed refused database "${name}": it is a known production database.`);
  }
  const lower = name.toLowerCase();
  if (!lower.includes("demo") && !lower.includes("test")) {
    throw new Error(`Demo seed refused database "${name}": the name must contain "demo" or "test".`);
  }
  return name;
}

export function resolveDemoSeedConfig(env: Env): DemoSeedConfig {
  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  assertSafeDemoDatabaseUrl(databaseUrl);
  return { databaseUrl, password: requirePassword(env, "DEMO_SEED_PASSWORD") };
}
