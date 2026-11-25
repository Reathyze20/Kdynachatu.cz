import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { boundClientLogContext, CLIENT_LOG_CONTEXT_LIMITS as LIMITS } from "./clientLogContext";

describe("boundClientLogContext", () => {
  test("a typical frontend context passes unchanged", () => {
    const context = {
      supportCode: "abc123",
      lastApi: { requestId: "abc123", status: 500, method: "GET", url: "/api/dashboard", timestamp: 1 },
      userAgent: "Mozilla/5.0 (Linux; Android 14)",
      viewport: "390x844",
      offline: false,
      retries: null,
      tags: ["a", "b"],
    };
    assert.deepEqual(boundClientLogContext(context), context);
  });

  test("a long string value is cut to the limit and marked", () => {
    const result = boundClientLogContext({ note: "x".repeat(LIMITS.maxStringLength + 100) });
    assert.equal(result.note, `${"x".repeat(LIMITS.maxStringLength)}…`);
  });

  test("a long key is cut to the limit", () => {
    const result = boundClientLogContext({ ["k".repeat(LIMITS.maxStringLength + 1)]: 1 });
    assert.deepEqual(Object.keys(result), [`${"k".repeat(LIMITS.maxStringLength)}…`]);
  });

  test("keys above the limit are dropped and their count is noted", () => {
    const context = Object.fromEntries(Array.from({ length: LIMITS.maxKeys + 5 }, (_, i) => [`k${i}`, i]));
    const result = boundClientLogContext(context);
    assert.equal(Object.keys(result).length, LIMITS.maxKeys + 1);
    assert.equal(result.k0, 0);
    assert.equal(result[`k${LIMITS.maxKeys}`], undefined);
    assert.equal(result["…"], "+5 klíčů");
  });

  test("array items above the limit are dropped and their count is noted", () => {
    const result = boundClientLogContext({ list: Array.from({ length: LIMITS.maxKeys + 3 }, (_, i) => i) });
    const list = result.list as unknown[];
    assert.equal(list.length, LIMITS.maxKeys + 1);
    assert.equal(list.at(-1), "… +3");
  });

  test("objects and arrays nested deeper than the limit are replaced by a marker", () => {
    assert.equal(LIMITS.maxDepth, 3);
    const kept = { a: { b: { c: { d: 1 } } }, list: [[[1]]] };
    assert.deepEqual(boundClientLogContext(kept), kept);
    const tooDeep = { a: { b: { c: { d: { e: 1 } } } }, list: [[[[1]]]] };
    assert.deepEqual(boundClientLogContext(tooDeep), { a: { b: { c: { d: "[…]" } } }, list: [[["[…]"]]] });
  });

  test("the whole serialized context fits the total length limit", () => {
    const wide = Object.fromEntries(
      Array.from({ length: LIMITS.maxKeys }, (_, i) => [`k${i}`, { text: "y".repeat(LIMITS.maxStringLength) }]),
    );
    const result = boundClientLogContext(wide);
    assert.equal(result.truncated, true);
    assert.ok(JSON.stringify(result).length <= LIMITS.maxTotalLength + 100);
  });

  test("a __proto__ key stays a plain own property and does not change the prototype", () => {
    const result = boundClientLogContext(JSON.parse('{"__proto__": {"polluted": true}}') as Record<string, unknown>);
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal((result as { polluted?: boolean }).polluted, undefined);
    assert.ok(Object.hasOwn(result, "__proto__"));
  });
});
