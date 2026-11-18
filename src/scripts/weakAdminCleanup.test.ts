import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  planWeakAdminCleanup,
  WEAK_ADMIN_USERNAME,
  WEAK_ADMIN_PASSWORD,
  type WeakAdminCandidate,
} from "./weakAdminCleanup";

const weak = (over: Partial<WeakAdminCandidate> = {}): WeakAdminCandidate => ({
  id: "u1",
  username: WEAK_ADMIN_USERNAME,
  cabinId: "cabin-1",
  hasWeakPassword: true,
  ownsData: false,
  ...over,
});

describe("planWeakAdminCleanup", () => {
  test("no candidates → empty, idempotent plan (nothing to do)", () => {
    const plan = planWeakAdminCleanup([], "block");

    assert.deepEqual(plan.decisions, []);
    assert.deepEqual(plan.summary, { delete: 0, block: 0, skip: 0 });
  });

  test("a weak-password admin is blocked in block mode", () => {
    const plan = planWeakAdminCleanup([weak({ id: "abc" })], "block");

    assert.equal(plan.decisions.length, 1);
    assert.equal(plan.decisions[0].id, "abc");
    assert.equal(plan.decisions[0].action, "block");
    assert.deepEqual(plan.summary, { delete: 0, block: 1, skip: 0 });
  });

  test("a weak-password admin is deleted in delete mode", () => {
    const plan = planWeakAdminCleanup([weak({ id: "abc" })], "delete");

    assert.equal(plan.decisions[0].action, "delete");
    assert.deepEqual(plan.summary, { delete: 1, block: 0, skip: 0 });
  });

  test("delete mode downgrades to block when the account owns data (no cascade data loss)", () => {
    const plan = planWeakAdminCleanup([weak({ ownsData: true })], "delete");

    assert.equal(plan.decisions[0].action, "block");
    assert.match(plan.decisions[0].reason, /owns data/i);
    assert.deepEqual(plan.summary, { delete: 0, block: 1, skip: 0 });
  });

  test("block mode blocks regardless of whether the account owns data", () => {
    const plan = planWeakAdminCleanup([weak({ ownsData: true })], "block");

    assert.equal(plan.decisions[0].action, "block");
    assert.deepEqual(plan.summary, { delete: 0, block: 1, skip: 0 });
  });

  test("an admin WITHOUT the weak password is skipped, never touched (multi-tenant safety)", () => {
    const plan = planWeakAdminCleanup(
      [weak({ hasWeakPassword: false })],
      "delete",
    );

    assert.equal(plan.decisions[0].action, "skip");
    assert.match(plan.decisions[0].reason, /weak default/i);
    assert.deepEqual(plan.summary, { delete: 0, block: 0, skip: 1 });
  });

  test("mixed candidates are counted per action with one decision each", () => {
    const plan = planWeakAdminCleanup(
      [
        weak({ id: "weak-1", cabinId: "cabin-1" }),
        weak({ id: "strong-1", cabinId: "cabin-2", hasWeakPassword: false }),
      ],
      "block",
    );

    assert.equal(plan.decisions.length, 2);
    assert.deepEqual(plan.summary, { delete: 0, block: 1, skip: 1 });
  });

  test("every decision carries the candidate's cabinId for an auditable report", () => {
    const plan = planWeakAdminCleanup([weak({ cabinId: null })], "block");

    assert.equal(plan.decisions[0].cabinId, null);
    assert.equal(plan.decisions[0].username, WEAK_ADMIN_USERNAME);
  });

  test("the known weak credential constants match the documented seed account", () => {
    assert.equal(WEAK_ADMIN_USERNAME, "admin");
    assert.equal(WEAK_ADMIN_PASSWORD, "tajneheslo123");
  });
});
