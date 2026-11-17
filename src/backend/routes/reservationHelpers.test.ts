import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isPrimaryCollisionBlocked } from "./reservationHelpers";

describe("isPrimaryCollisionBlocked", () => {
  test("primary over an overlapping primary is blocked (409)", () => {
    assert.equal(isPrimaryCollisionBlocked("primary", true), true);
  });

  test("primary with no overlapping primary is allowed", () => {
    assert.equal(isPrimaryCollisionBlocked("primary", false), false);
  });

  test("backup never blocks, even over an overlapping primary", () => {
    assert.equal(isPrimaryCollisionBlocked("backup", true), false);
    assert.equal(isPrimaryCollisionBlocked("backup", false), false);
  });

  test("soft never blocks, even over an overlapping primary", () => {
    assert.equal(isPrimaryCollisionBlocked("soft", true), false);
    assert.equal(isPrimaryCollisionBlocked("soft", false), false);
  });
});
