import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { demoAccountsHandler, resolveDemoAccounts } from "./demoAccounts";

const ADMIN_PASSWORD = "Admin-heslo-123";
const MEMBER_PASSWORD = "Clen-heslo-4567";
const stagingEnv = {
  DEPLOY_TARGET: "staging",
  DATABASE_URL: "postgresql://cabin:x@127.0.0.1:5432/cabin_staging",
  STAGING_SEED_ADMIN_PASSWORD: ADMIN_PASSWORD,
  STAGING_SEED_MEMBER_PASSWORD: MEMBER_PASSWORD,
};

describe("resolveDemoAccounts", () => {
  test("staging lists every seeded demo account with its seed password, Mamka first", () => {
    assert.deepEqual(resolveDemoAccounts(stagingEnv), [
      { username: "demo-mamka", label: "Mamka", role: "user", password: MEMBER_PASSWORD },
      { username: "demo-spravce", label: "Správce", role: "admin", password: ADMIN_PASSWORD },
      { username: "demo-jana", label: "Jana", role: "user", password: MEMBER_PASSWORD },
      { username: "demo-petr", label: "Petr", role: "user", password: MEMBER_PASSWORD },
    ]);
  });

  for (const [name, env] of [
    ["production target", { ...stagingEnv, DEPLOY_TARGET: "production" }],
    ["missing target (local dev)", { ...stagingEnv, DEPLOY_TARGET: undefined }],
    ["staging target on the production database", { ...stagingEnv, DATABASE_URL: "postgresql://cabin:x@127.0.0.1:5432/cabin_reservation" }],
    ["missing seed passwords", { ...stagingEnv, STAGING_SEED_ADMIN_PASSWORD: undefined, STAGING_SEED_MEMBER_PASSWORD: undefined }],
    ["placeholder seed password", { ...stagingEnv, STAGING_SEED_MEMBER_PASSWORD: "CHANGE_ME_member_password" }],
  ] as const) {
    test(`${name} lists no accounts`, () => {
      assert.deepEqual(resolveDemoAccounts(env), []);
    });
  }
});

describe("GET /api/demo-accounts", () => {
  async function get(accounts: ReturnType<typeof resolveDemoAccounts>) {
    const app = express();
    app.get("/api/demo-accounts", demoAccountsHandler(accounts));
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    try {
      const { port } = server.address() as AddressInfo;
      return await fetch(`http://127.0.0.1:${port}/api/demo-accounts`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  test("returns the accounts and forbids caching them", async () => {
    const res = await get(resolveDemoAccounts(stagingEnv));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const body = (await res.json()) as { accounts: unknown[] };
    assert.equal(body.accounts.length, 4);
  });

  test("outside staging answers an empty list", async () => {
    const res = await get(resolveDemoAccounts({ DEPLOY_TARGET: "production" }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { accounts: [] });
  });
});
