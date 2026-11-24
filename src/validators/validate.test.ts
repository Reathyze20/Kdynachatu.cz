import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { z } from "zod";
import { validate } from "./validate";
import { reservationIdParamsSchema } from "./schemas";

function run(source: "body" | "params" | undefined, req: Partial<Request>) {
  let status = 200;
  let nextCalled = false;
  const res = { status: (s: number) => { status = s; return res; }, json: () => res } as unknown as Response;
  const middleware = source ? validate(reservationIdParamsSchema, source) : validate(reservationIdParamsSchema);
  middleware(req as Request, res, () => { nextCalled = true; });
  return { status, nextCalled };
}

const id = "8f14e45f-ceea-4672-a1a4-7c2a3f2b9e10";

describe("validate", () => {
  test("validates the body by default (existing behaviour)", () => {
    assert.deepEqual(run(undefined, { body: { id } }), { status: 200, nextCalled: true });
    assert.deepEqual(run(undefined, { body: {}, params: { id } }), { status: 400, nextCalled: false });
  });

  test("validates route params when asked (DELETE /reservations/:id)", () => {
    assert.deepEqual(run("params", { params: { id }, body: {} }), { status: 200, nextCalled: true });
    assert.deepEqual(run("params", { params: { id: "neni-uuid" }, body: { id } }), { status: 400, nextCalled: false });
  });
});

describe("validate hands the parsed data on (#472)", () => {
  const schema = z.object({
    name: z.string().trim().min(1),
    role: z.enum(["admin", "user"]).default("user"),
    count: z.coerce.number().int().optional(),
  });

  function runWith(source: "body" | "params" | "query", input: unknown) {
    const req: Record<string, unknown> = { body: {}, params: {}, query: {} };
    req[source] = input;
    let nextCalled = false;
    const res = { status: () => res, json: () => res } as unknown as Response;
    validate(schema, source)(req as unknown as Request, res, () => { nextCalled = true; });
    return { req, nextCalled };
  }

  test("drops fields the schema does not know (mass assignment of cabinId, isSuperAdmin)", () => {
    const { req, nextCalled } = runWith("body", { name: "Pepa", cabinId: "cizi-chata", isSuperAdmin: true });
    assert.equal(nextCalled, true);
    assert.deepEqual(req.body, { name: "Pepa", role: "user" });
  });

  test("applies schema defaults and transforms (trim, coerce)", () => {
    assert.deepEqual(runWith("body", { name: "  Pepa  ", count: "3" }).req.body, { name: "Pepa", role: "user", count: 3 });
  });

  test("replaces route params and query the same way", () => {
    assert.deepEqual(runWith("params", { name: " a ", extra: "x" }).req.params, { name: "a", role: "user" });
    assert.deepEqual(runWith("query", { name: "b", count: "7", extra: "x" }).req.query, { name: "b", role: "user", count: 7 });
  });

  test("leaves the request untouched when validation fails", () => {
    const input = { name: "", cabinId: "cizi-chata" };
    const { req, nextCalled } = runWith("body", input);
    assert.equal(nextCalled, false);
    assert.equal(req.body, input);
  });
});
