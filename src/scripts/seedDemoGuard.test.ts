import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { assertSafeDemoDatabaseUrl, resolveDemoSeedConfig } from "./seedDemoGuard";

const validEnv = (over: Record<string, string | undefined> = {}) => ({
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5435/kdynachatu_demo",
  DEMO_SEED_PASSWORD: "lipa-heslo-1234",
  ...over,
});

describe("demo seed DB guard", () => {
  test("accepts a database whose name marks it as demo or test", () => {
    assert.equal(assertSafeDemoDatabaseUrl("postgresql://postgres:postgres@localhost:5435/kdynachatu_demo"), "kdynachatu_demo");
    assert.equal(assertSafeDemoDatabaseUrl("postgresql://u:p@db:5432/Demo_Landing?schema=public"), "Demo_Landing");
    assert.equal(assertSafeDemoDatabaseUrl("postgresql://u:p@localhost:5433/kdynachatu_test"), "kdynachatu_test");
  });

  test("always refuses the known production database cabin_reservation", () => {
    assert.throws(() => assertSafeDemoDatabaseUrl("postgresql://cabin:x@localhost:5432/cabin_reservation"), /cabin_reservation/);
  });

  test("refuses a database whose name marks it neither as demo nor test", () => {
    assert.throws(() => assertSafeDemoDatabaseUrl("postgresql://u:p@localhost:5432/kdynachatu"), /demo/);
    assert.throws(() => assertSafeDemoDatabaseUrl("postgresql://u:p@localhost:5432/kdynachatu_staging"), /demo/);
    assert.throws(() => assertSafeDemoDatabaseUrl("postgresql://u:p@localhost:5432/postgres"), /demo/);
  });

  test("refuses a missing or unparsable DATABASE_URL", () => {
    assert.throws(() => assertSafeDemoDatabaseUrl(undefined), /DATABASE_URL/);
    assert.throws(() => assertSafeDemoDatabaseUrl("  "), /DATABASE_URL/);
    assert.throws(() => assertSafeDemoDatabaseUrl("not a url"), /DATABASE_URL/);
  });
});

describe("resolveDemoSeedConfig", () => {
  test("valid env yields the URL and the shared password", () => {
    assert.deepEqual(resolveDemoSeedConfig(validEnv()), {
      databaseUrl: "postgresql://postgres:postgres@localhost:5435/kdynachatu_demo",
      password: "lipa-heslo-1234",
    });
  });

  test("refuses the production database before looking at anything else", () => {
    assert.throws(
      () => resolveDemoSeedConfig(validEnv({ DATABASE_URL: "postgresql://cabin:x@localhost:5432/cabin_reservation" })),
      /cabin_reservation/,
    );
  });

  test("refuses missing, short or placeholder passwords", () => {
    assert.throws(() => resolveDemoSeedConfig(validEnv({ DEMO_SEED_PASSWORD: undefined })), /DEMO_SEED_PASSWORD/);
    assert.throws(() => resolveDemoSeedConfig(validEnv({ DEMO_SEED_PASSWORD: "kratke" })), /DEMO_SEED_PASSWORD/);
    assert.throws(() => resolveDemoSeedConfig(validEnv({ DEMO_SEED_PASSWORD: "CHANGE_ME_DEMO_SEED" })), /DEMO_SEED_PASSWORD/);
  });
});
