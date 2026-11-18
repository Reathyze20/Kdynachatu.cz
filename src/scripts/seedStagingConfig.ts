/**
 * Guard + config for `seedStaging.ts`. The seed must never touch a non-staging DB
 * (docs/plans/SEP-1-deploy.md §4.5): DEPLOY_TARGET=staging AND DB name ends in `_staging`.
 */
export interface SeedConfig {
  databaseUrl: string;
  adminPassword: string;
  memberPassword: string;
}

type Env = Record<string, string | undefined>;

const MIN_PASSWORD_LENGTH = 12;

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
  if (!dbName.endsWith("_staging")) {
    throw new Error(`seedStaging runs only against a database ending in _staging (got '${dbName}').`);
  }
  return {
    databaseUrl,
    adminPassword: requirePassword(env, "STAGING_SEED_ADMIN_PASSWORD"),
    memberPassword: requirePassword(env, "STAGING_SEED_MEMBER_PASSWORD"),
  };
}
