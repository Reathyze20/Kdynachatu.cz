import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { registerSchema, updateProfileSchema, updateReservationSchema } from "./schemas";

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

describe("updateProfileSchema.dashboardPrefs (#681)", () => {
  const full = {
    weather: false,
    cabinScene: true,
    sinceLast: true,
    laterAndFree: true,
    stayForecast: true,
    regionEvents: true,
    noticeboard: true,
    sceneMode: "static",
    simplifiedNoteDismissed: true,
  };

  test("accepts every known key, a partial object, null keys and null as a whole", () => {
    assert.equal(updateProfileSchema.safeParse({ dashboardPrefs: full }).success, true);
    assert.equal(updateProfileSchema.safeParse({ dashboardPrefs: { cabinScene: true } }).success, true);
    assert.equal(updateProfileSchema.safeParse({ dashboardPrefs: { weather: null, sceneMode: null } }).success, true);
    assert.equal(updateProfileSchema.safeParse({ dashboardPrefs: null }).success, true);
    assert.equal(updateProfileSchema.safeParse({ dashboardPrefs: {} }).success, true);
  });

  test("keeps the preferences in the parsed body", () => {
    const result = updateProfileSchema.safeParse({ dashboardPrefs: { sceneMode: "animated", noticeboard: false } });
    assert.deepEqual(result.data?.dashboardPrefs, { sceneMode: "animated", noticeboard: false });
  });

  test("rejects an unknown key", () => {
    const result = updateProfileSchema.safeParse({ dashboardPrefs: { weather: true, quickLinks: true } });
    assert.equal(result.success, false);
  });

  test("rejects a cabinId smuggled into the preferences", () => {
    assert.equal(updateProfileSchema.safeParse({ dashboardPrefs: { cabinId: "cizi-chata" } }).success, false);
  });

  test("rejects a value of the wrong type", () => {
    assert.equal(updateProfileSchema.safeParse({ dashboardPrefs: { weather: "true" } }).success, false);
    assert.equal(updateProfileSchema.safeParse({ dashboardPrefs: { cabinScene: 1 } }).success, false);
    assert.equal(updateProfileSchema.safeParse({ dashboardPrefs: { sceneMode: "hidden" } }).success, false);
    assert.equal(updateProfileSchema.safeParse({ dashboardPrefs: { simplifiedNoteDismissed: "yes" } }).success, false);
    assert.equal(updateProfileSchema.safeParse({ dashboardPrefs: [] }).success, false);
    assert.equal(updateProfileSchema.safeParse({ dashboardPrefs: "weather" }).success, false);
  });
});
