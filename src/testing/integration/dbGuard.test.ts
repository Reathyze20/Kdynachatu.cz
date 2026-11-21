import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { assertSafeTestDatabaseName, assertSafeTestDatabaseUrl } from "./dbGuard";

describe("integration DB guard", () => {
  test("accepts the disposable local test DB on port 5433", () => {
    assert.equal(
      assertSafeTestDatabaseUrl("postgresql://postgres:postgres@localhost:5433/kdynachatu_test"),
      "kdynachatu_test",
    );
  });

  test("accepts a remote/CI test DB", () => {
    assert.equal(assertSafeTestDatabaseUrl("postgresql://u:p@postgres:5432/kdynachatu_test?schema=public"), "kdynachatu_test");
  });

  test("refuses a missing DATABASE_URL", () => {
    assert.throws(() => assertSafeTestDatabaseUrl(undefined), /DATABASE_URL/);
    assert.throws(() => assertSafeTestDatabaseUrl("  "), /DATABASE_URL/);
  });

  test("refuses an unparsable URL", () => {
    assert.throws(() => assertSafeTestDatabaseUrl("not a url"), /neplatná/i);
  });

  test("refuses the known production database cabin_reservation", () => {
    assert.throws(
      () => assertSafeTestDatabaseUrl("postgresql://cabin:x@db.example:5433/cabin_reservation"),
      /cabin_reservation/,
    );
    assert.throws(() => assertSafeTestDatabaseName("cabin_reservation"), /cabin_reservation/);
  });

  test("refuses a database whose name does not contain 'test'", () => {
    assert.throws(() => assertSafeTestDatabaseUrl("postgresql://u:p@localhost:5433/kdynachatu"), /test/);
    assert.throws(() => assertSafeTestDatabaseName("postgres"), /test/);
  });
});
