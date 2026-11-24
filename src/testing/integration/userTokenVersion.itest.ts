import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../utils/prisma";
import { setupIntegrationFile, teardownIntegrationFile, type TestWorld } from "./harness";

// Expand migrace #471: sloupec pro zneplatňování tokenů (#485). Zatím ho žádný kód nečte.
let world: TestWorld;

before(async () => {
  ({ world } = await setupIntegrationFile());
});

after(teardownIntegrationFile);

describe("users.token_version (#471)", () => {
  test("is INTEGER NOT NULL DEFAULT 0", async () => {
    const columns = await prisma.$queryRaw<{ data_type: string; is_nullable: string; column_default: string | null }[]>`
      SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'token_version'`;

    assert.deepEqual(columns, [{ data_type: "integer", is_nullable: "NO", column_default: "0" }]);
  });

  test("a user created without it starts at version 0", async () => {
    const user = await prisma.user.findUnique({ where: { id: world.memberA.id }, select: { tokenVersion: true } });

    assert.equal(user?.tokenVersion, 0);
  });
});
