import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { compareCounts, MIGRATION_COUNT_ENTITIES } from "./migrationCountCheck";

describe("compareCounts", () => {
  test("identical snapshots reconcile cleanly (ok, no mismatches)", () => {
    const snapshot = { users: 4, reservations: 12, notes: 30 };
    const report = compareCounts(snapshot, { ...snapshot });

    assert.equal(report.ok, true);
    assert.deepEqual(report.mismatches, []);
  });

  test("a differing count produces a concrete mismatch", () => {
    const report = compareCounts(
      { users: 4, reservations: 12 },
      { users: 4, reservations: 11 },
    );

    assert.equal(report.ok, false);
    assert.deepEqual(report.mismatches, [
      { entity: "reservations", before: 12, after: 11 },
    ]);
  });

  test("an entity missing from the after-snapshot is a mismatch (after = null)", () => {
    const report = compareCounts({ users: 4, notes: 7 }, { users: 4 });

    assert.equal(report.ok, false);
    assert.deepEqual(report.mismatches, [
      { entity: "notes", before: 7, after: null },
    ]);
  });

  test("an entity missing from the before-snapshot is a mismatch (before = null)", () => {
    const report = compareCounts({ users: 4 }, { users: 4, notes: 7 });

    assert.equal(report.ok, false);
    assert.deepEqual(report.mismatches, [
      { entity: "notes", before: null, after: 7 },
    ]);
  });

  test("multiple mismatches are reported together in a stable (sorted) order", () => {
    const report = compareCounts(
      { users: 4, reservations: 12, notes: 7 },
      { users: 5, reservations: 10, notes: 7 },
    );

    assert.equal(report.ok, false);
    assert.deepEqual(report.mismatches, [
      { entity: "reservations", before: 12, after: 10 },
      { entity: "users", before: 4, after: 5 },
    ]);
  });

  test("a zero count is distinct from a missing entity", () => {
    const report = compareCounts({ notes: 0 }, {});

    assert.equal(report.ok, false);
    assert.deepEqual(report.mismatches, [
      { entity: "notes", before: 0, after: null },
    ]);
  });
});

describe("MIGRATION_COUNT_ENTITIES", () => {
  test("covers every entity group named in the ticket", () => {
    const entities = MIGRATION_COUNT_ENTITIES.map((e) => e.entity);

    for (const required of [
      "users",
      "reservations",
      "shoppingItems",
      "noteThreads",
      "notes",
      "gallery",
      "diary",
      "reconstructionItems",
      "inventoryItems",
    ]) {
      assert.ok(entities.includes(required), `missing count-check entity: ${required}`);
    }
  });

  test("maps each entity to a backing table exactly once", () => {
    const entities = MIGRATION_COUNT_ENTITIES.map((e) => e.entity);
    const tables = MIGRATION_COUNT_ENTITIES.map((e) => e.table);

    assert.equal(new Set(entities).size, entities.length, "duplicate entity key");
    assert.equal(new Set(tables).size, tables.length, "duplicate table name");
    assert.ok(MIGRATION_COUNT_ENTITIES.every((e) => e.table.length > 0));
  });
});
