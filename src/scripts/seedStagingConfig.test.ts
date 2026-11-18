import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveSeedConfig } from "./seedStagingConfig";

const validEnv = (over: Record<string, string | undefined> = {}) => ({
  DEPLOY_TARGET: "staging",
  DATABASE_URL: "postgresql://staging_app:x@localhost:5432/kdynachatu_staging?schema=public",
  STAGING_SEED_ADMIN_PASSWORD: "admin-heslo-123",
  STAGING_SEED_MEMBER_PASSWORD: "clen-heslo-1234",
  ...over,
});

describe("resolveSeedConfig", () => {
  test("valid staging env yields the URL and both passwords", () => {
    const config = resolveSeedConfig(validEnv());

    assert.deepEqual(config, {
      databaseUrl: "postgresql://staging_app:x@localhost:5432/kdynachatu_staging?schema=public",
      adminPassword: "admin-heslo-123",
      memberPassword: "clen-heslo-1234",
    });
  });

  test("refuses when DEPLOY_TARGET is not staging (e.g. production)", () => {
    assert.throws(() => resolveSeedConfig(validEnv({ DEPLOY_TARGET: "production" })), /DEPLOY_TARGET/);
    assert.throws(() => resolveSeedConfig(validEnv({ DEPLOY_TARGET: undefined })), /DEPLOY_TARGET/);
  });

  test("refuses a database whose name does not end in _staging", () => {
    assert.throws(
      () => resolveSeedConfig(validEnv({ DATABASE_URL: "postgresql://cabin:x@localhost:5432/cabin_reservation" })),
      /_staging/,
    );
    assert.throws(
      () => resolveSeedConfig(validEnv({ DATABASE_URL: "postgresql://u:x@h:5432/kdynachatu_staging_old" })),
      /_staging/,
    );
    assert.throws(() => resolveSeedConfig(validEnv({ DATABASE_URL: undefined })), /DATABASE_URL/);
  });

  test("refuses missing, short or placeholder passwords", () => {
    assert.throws(() => resolveSeedConfig(validEnv({ STAGING_SEED_ADMIN_PASSWORD: undefined })), /ADMIN_PASSWORD/);
    assert.throws(() => resolveSeedConfig(validEnv({ STAGING_SEED_MEMBER_PASSWORD: "kratke" })), /MEMBER_PASSWORD/);
    assert.throws(
      () => resolveSeedConfig(validEnv({ STAGING_SEED_ADMIN_PASSWORD: "CHANGE_ME_STAGING_SEED" })),
      /ADMIN_PASSWORD/,
    );
  });
});
