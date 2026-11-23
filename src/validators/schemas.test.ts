import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { registerSchema, updateReservationSchema } from "./schemas";

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

describe("registerSchema.municipalityCode", () => {
  const account = { cabinName: "Chata U Lesa", username: "novak", email: "novak@example.com", password: "Heslo-123456" };

  test("needs a municipality picked from the list, free text is not enough", () => {
    const result = registerSchema.safeParse({ ...account, weatherLocation: "Trebenice" });
    assert.equal(result.success, false);
    assert.equal(result.error?.issues[0].message, "Vyber nejbližší obec ze seznamu.");
  });

  test("accepts a RÚIAN municipality code", () => {
    assert.equal(registerSchema.safeParse({ ...account, municipalityCode: 591866 }).success, true);
  });
});
