/**
 * Guard + config for `seedStaging.ts`. The seed must never touch a non-staging DB
 * (docs/STAGING-SETUP.md): DEPLOY_TARGET=staging AND the DB name either ends in
 * `_staging` or contains `test`. The `test` branch mirrors the integration-test DB guard
 * (testing/integration/dbGuard.ts) so the seed can run against the disposable harness DB used by
 * `npm run test:integration`. The known production DB `cabin_reservation` matches neither and is
 * always refused.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface SeedConfig {
  databaseUrl: string;
  adminPassword: string;
  memberPassword: string;
}

type Env = Record<string, string | undefined>;

/** Fiktivní účty demo chaty. Sdílí je seed a přihlašovací rychlovolba na stagingu
 * (src/backend/routes/demoAccounts.ts); admin má STAGING_SEED_ADMIN_PASSWORD, ostatní MEMBER.
 * Pořadí = pořadí tlačítek na přihlašovací obrazovce: „Mamka“ (účet pro netechnického testera) první. */
export const DEMO_USERS = [
  { key: "mamka", username: "demo-mamka", email: "demo-mamka@example.invalid", role: "user", color: "#EF6C00", animalIcon: "kralik" },
  { key: "admin", username: "demo-spravce", email: "demo-spravce@example.invalid", role: "admin", color: "#AB47BC", animalIcon: "liska" },
  { key: "jana", username: "demo-jana", email: "demo-jana@example.invalid", role: "user", color: "#42A5F5", animalIcon: "veverka" },
  { key: "petr", username: "demo-petr", email: "demo-petr@example.invalid", role: "user", color: "#66BB6A", animalIcon: "jezek" },
] as const;

const MIN_PASSWORD_LENGTH = 12;

/** Cesta uploadů pro seed – z UPLOADS_PATH, jinak default `data/uploads` (shodně s config.ts).
 * Config.ts nejde importovat (process.exit bez JWT_SECRET), proto se čte env tady. */
export function resolveUploadsPath(env: Env): string {
  const fromEnv = env.UPLOADS_PATH?.trim();
  if (fromEnv) return fromEnv;
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../data/uploads");
}

function databaseName(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

function requirePassword(env: Env, key: string): string {
  const value = env[key]?.trim() ?? "";
  if (value.length < MIN_PASSWORD_LENGTH || value.startsWith("CHANGE_ME")) {
    throw new Error(`Set ${key} (min ${MIN_PASSWORD_LENGTH} characters, not a CHANGE_ME placeholder).`);
  }
  return value;
}

export function resolveSeedConfig(env: Env): SeedConfig {
  if (env.DEPLOY_TARGET?.trim() !== "staging") {
    throw new Error(`seedStaging runs only with DEPLOY_TARGET=staging (got '${env.DEPLOY_TARGET ?? ""}').`);
  }
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  const dbName = databaseName(databaseUrl);
  const normalizedName = dbName.toLowerCase();
  const isStaging = normalizedName.endsWith("_staging");
  const isIntegrationHarness = normalizedName.includes("test");
  if (!isStaging && !isIntegrationHarness) {
    throw new Error(
      `seedStaging runs only against a database ending in _staging or an integration-test DB (got '${dbName}').`,
    );
  }
  return {
    databaseUrl,
    adminPassword: requirePassword(env, "STAGING_SEED_ADMIN_PASSWORD"),
    memberPassword: requirePassword(env, "STAGING_SEED_MEMBER_PASSWORD"),
  };
}
