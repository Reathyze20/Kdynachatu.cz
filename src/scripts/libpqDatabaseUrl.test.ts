import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { toLibpqDatabaseUrl } from "./libpqDatabaseUrl";

describe("toLibpqDatabaseUrl", () => {
  test("drops Prisma ?schema=public so pg_dump/pg_restore accept the URL", () => {
    assert.equal(
      toLibpqDatabaseUrl("postgresql://cabin:secret@localhost:5432/cabin_reservation?schema=public"),
      "postgresql://cabin:secret@localhost:5432/cabin_reservation",
    );
  });

  test("keeps libpq parameters such as sslmode, connect_timeout and application_name", () => {
    assert.equal(
      toLibpqDatabaseUrl(
        "postgresql://u:p@db.example:5432/app?sslmode=require&schema=public&connect_timeout=10&application_name=backup",
      ),
      "postgresql://u:p@db.example:5432/app?sslmode=require&connect_timeout=10&application_name=backup",
    );
  });

  test("drops other Prisma-only parameters (connection pool, pgbouncer)", () => {
    assert.equal(
      toLibpqDatabaseUrl("postgres://u:p@h/app?connection_limit=5&pool_timeout=10&pgbouncer=true&sslmode=verify-full"),
      "postgres://u:p@h/app?sslmode=verify-full",
    );
  });

  test("leaves a URL without query parameters unchanged", () => {
    assert.equal(toLibpqDatabaseUrl("postgresql://u:p@h:5432/app"), "postgresql://u:p@h:5432/app");
  });

  test("does not touch percent-encoded credentials", () => {
    assert.equal(
      toLibpqDatabaseUrl("postgresql://u:p%40ss%3Fw0rd@h:5432/app?schema=public&sslmode=require"),
      "postgresql://u:p%40ss%3Fw0rd@h:5432/app?sslmode=require",
    );
  });

  test("drops a malformed percent-encoded key instead of throwing", () => {
    assert.equal(toLibpqDatabaseUrl("postgresql://u:p@h/app?%zz=1&sslmode=require"), "postgresql://u:p@h/app?sslmode=require");
  });
});
