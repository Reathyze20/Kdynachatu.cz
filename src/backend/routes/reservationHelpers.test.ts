import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sanitizeCheckoutState } from "./reservationHelpers";

describe("sanitizeCheckoutState", () => {
  test("returns undefined when nothing was sent (leave unchanged)", () => {
    assert.equal(sanitizeCheckoutState(undefined), undefined);
  });

  test("returns undefined for null or non-object input", () => {
    assert.equal(sanitizeCheckoutState(null), undefined);
    assert.equal(sanitizeCheckoutState("gas: full"), undefined);
    assert.equal(sanitizeCheckoutState(42), undefined);
  });

  test("returns an empty object when given an object with no valid keys", () => {
    assert.deepEqual(sanitizeCheckoutState({}), {});
    assert.deepEqual(sanitizeCheckoutState({ nonsense: true, foo: "bar" }), {});
  });

  test("keeps all valid fields", () => {
    const out = sanitizeCheckoutState({
      gas: "half",
      heatingOff: true,
      waterOff: false,
      broken: "kape kohoutek",
      leftBehind: "dřevo",
      note: "vítej",
    });
    assert.deepEqual(out, {
      gas: "half",
      heatingOff: true,
      waterOff: false,
      broken: "kape kohoutek",
      leftBehind: "dřevo",
      note: "vítej",
    });
  });

  test("accepts every valid gas level", () => {
    for (const gas of ["full", "half", "low", "empty"]) {
      assert.equal(sanitizeCheckoutState({ gas })?.gas, gas);
    }
  });

  test("drops an invalid gas value", () => {
    const out = sanitizeCheckoutState({ gas: "overflowing" });
    assert.deepEqual(out, {});
    assert.equal(out && "gas" in out, false);
  });

  test("drops fields with the wrong type", () => {
    const out = sanitizeCheckoutState({ heatingOff: "yes", waterOff: 1, broken: 5 });
    assert.deepEqual(out, {});
  });

  test("ignores unknown keys but keeps valid ones alongside them", () => {
    const out = sanitizeCheckoutState({ gas: "low", hacker: "drop table", note: "ok" });
    assert.deepEqual(out, { gas: "low", note: "ok" });
  });

  test("truncates long text fields to 1000 chars", () => {
    const long = "x".repeat(5000);
    const out = sanitizeCheckoutState({ broken: long, leftBehind: long, note: long });
    assert.equal(out?.broken?.length, 1000);
    assert.equal(out?.leftBehind?.length, 1000);
    assert.equal(out?.note?.length, 1000);
  });
});
