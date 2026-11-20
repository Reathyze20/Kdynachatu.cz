import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveSeedConfig, resolveUploadsPath } from "./seedStagingConfig";

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

  test("accepts the integration-harness database whose name contains 'test'", () => {
    const config = resolveSeedConfig(
      validEnv({ DATABASE_URL: "postgresql://postgres:postgres@localhost:5433/kdynachatu_test" }),
    );
    assert.equal(config.databaseUrl, "postgresql://postgres:postgres@localhost:5433/kdynachatu_test");
  });

  test("still refuses the known production database even though it is not _staging", () => {
    assert.throws(
      () => resolveSeedConfig(validEnv({ DATABASE_URL: "postgresql://cabin:x@localhost:5432/cabin_reservation" })),
      /_staging|test/,
    );
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

describe("resolveUploadsPath", () => {
  test("prefers UPLOADS_PATH from env", () => {
    assert.equal(resolveUploadsPath({ UPLOADS_PATH: "/srv/uploads" }), "/srv/uploads");
    assert.equal(resolveUploadsPath({ UPLOADS_PATH: "  /srv/uploads  " }), "/srv/uploads");
  });

  test("falls back to the data/uploads default when UPLOADS_PATH is unset", () => {
    const resolved = resolveUploadsPath({});
    assert.ok(resolved.replace(/\\/g, "/").endsWith("/data/uploads"), `got ${resolved}`);
  });
});
