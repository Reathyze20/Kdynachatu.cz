import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { requireRole } from "./roleMiddleware";

function run(user: Request["user"], ...args: Parameters<typeof requireRole>) {
  let status = 200;
  let body: unknown;
  let nextCalled = false;
  const res = {
    status: (s: number) => { status = s; return res; },
    json: (b: unknown) => { body = b; return res; },
  } as unknown as Response;
  requireRole(...args)({ user } as Request, res, () => { nextCalled = true; });
  return { status, body, nextCalled };
}

const as = (role: string): Request["user"] => ({ userId: "u1", username: "pepa", role, cabinId: "c1", isSuperAdmin: false });

describe("requireRole", () => {
  test("lets an allowed role through", () => {
    assert.deepEqual(run(as("admin"), ["admin"]), { status: 200, body: undefined, nextCalled: true });
    assert.equal(run(as("user"), ["admin", "user"]).nextCalled, true);
  });

  test("answers 403 with the route's message to any other role", () => {
    assert.deepEqual(run(as("guest"), ["admin", "user"], "Hosté nemohou psát zprávy."), {
      status: 403,
      body: { message: "Hosté nemohou psát zprávy." },
      nextCalled: false,
    });
    assert.equal(run(as("user"), ["admin"]).status, 403);
    assert.equal(run(as("superadmin"), ["admin"]).status, 403, "role mimo výčet neprojde");
  });

  test("answers 401 when no user is authenticated", () => {
    assert.equal(run(undefined, ["admin"]).status, 401);
  });
});
