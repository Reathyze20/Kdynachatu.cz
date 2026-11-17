import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { updateReservationSchema } from "./schemas";

describe("updateReservationSchema.status", () => {
  test("accepts status: backup (409 hint advises setting backup)", () => {
    const result = updateReservationSchema.safeParse({ status: "backup" });
    assert.equal(result.success, true);
  });

  test("still accepts the existing statuses soft and primary", () => {
    assert.equal(updateReservationSchema.safeParse({ status: "soft" }).success, true);
    assert.equal(updateReservationSchema.safeParse({ status: "primary" }).success, true);
  });

  test("rejects an unknown status", () => {
    assert.equal(updateReservationSchema.safeParse({ status: "cancelled" }).success, false);
    assert.equal(updateReservationSchema.safeParse({ status: "" }).success, false);
  });
});
