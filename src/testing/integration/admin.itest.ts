import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import { as, setupIntegrationFile, teardownIntegrationFile, type TestWorld } from "./harness";

let app: Express;
let world: TestWorld;

before(async () => {
  ({ app, world } = await setupIntegrationFile());
});

after(teardownIntegrationFile);

describe("admin: system info", () => {
  test("a member gets 403 with a readable Czech message", async () => {
    const res = await as(app, world.memberA).get("/api/admin/system");
    assert.equal(res.status, 403);
    assert.equal(res.body.message, "Přístup pouze pro administrátora.");
  });

  test("an admin gets the counts of their own cabin", async () => {
    const res = await as(app, world.adminA).get("/api/admin/system");
    assert.equal(res.status, 200);
    assert.equal(res.body.userCount, 2); // správce A + člen A, uživatelé chaty B se nepočítají
  });
});
