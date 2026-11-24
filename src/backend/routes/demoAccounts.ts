/**
 * Rychlé přihlášení demo účty na stagingu: přihlašovací obrazovka pod formulářem nabídne jména
 * fiktivních účtů ze seedu a kliknutí předvyplní jméno a heslo.
 *
 * Hesla nejsou ve frontend bundlu – posílá je jen tento endpoint, a to jen když běží staging
 * (stejná brána jako seed: DEPLOY_TARGET=staging + DB `_staging` + platná STAGING_SEED_* hesla).
 * Jinde vrací prázdný seznam. Staging je navíc za nginx basic auth a má jen fiktivní data.
 */
import type { RequestHandler } from "express";
import type { DemoAccount, DemoAccountsResponse } from "../../types";
import { DEMO_USERS, resolveSeedConfig } from "../../scripts/seedStagingConfig";

type Env = Record<string, string | undefined>;

const LABELS: Record<(typeof DEMO_USERS)[number]["key"], string> = {
  mamka: "Mamka",
  admin: "Správce",
  jana: "Jana",
  petr: "Petr",
};

export function resolveDemoAccounts(env: Env): DemoAccount[] {
  let config;
  try {
    config = resolveSeedConfig(env);
  } catch {
    return [];
  }
  return DEMO_USERS.map(({ key, username, role }) => ({
    username,
    label: LABELS[key],
    role,
    password: key === "admin" ? config.adminPassword : config.memberPassword,
  }));
}

/** GET /api/demo-accounts – veřejné, mimo staging prázdný seznam. */
export function demoAccountsHandler(accounts: DemoAccount[]): RequestHandler {
  return (_req, res) => {
    const body: DemoAccountsResponse = { accounts };
    res.set("Cache-Control", "no-store").json(body);
  };
}
