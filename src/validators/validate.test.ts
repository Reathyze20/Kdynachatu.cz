import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
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
