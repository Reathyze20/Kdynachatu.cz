import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DASHBOARD_PREFS, effectiveDashboardPrefs, mergeDashboardPrefs } from "./dashboardPrefs";

describe("effectiveDashboardPrefs (#681)", () => {
  test("null and undefined give the defaults: weather on, other blocks off, animated scene, note not dismissed", () => {
    const defaults = {
      weather: true,
      cabinScene: false,
      sinceLast: false,
      laterAndFree: false,
      stayForecast: false,
      regionEvents: false,
      noticeboard: false,
      sceneMode: "animated",
      simplifiedNoteDismissed: false,
    };
    assert.deepEqual(effectiveDashboardPrefs(null), defaults);
    assert.deepEqual(effectiveDashboardPrefs(undefined), defaults);
    assert.deepEqual(DEFAULT_DASHBOARD_PREFS, defaults);
  });

  test("partial preferences override only the stored keys, null keys fall back to the default", () => {
    assert.deepEqual(effectiveDashboardPrefs({ weather: false, cabinScene: true, sceneMode: null }), {
      ...DEFAULT_DASHBOARD_PREFS,
      weather: false,
      cabinScene: true,
    });
  });

  test("full preferences are returned as stored", () => {
    const full = {
      weather: false,
      cabinScene: true,
      sinceLast: true,
      laterAndFree: true,
      stayForecast: true,
      regionEvents: true,
      noticeboard: true,
      sceneMode: "static" as const,
      simplifiedNoteDismissed: true,
    };
    assert.deepEqual(effectiveDashboardPrefs(full), full);
  });

  test("a malformed stored value (not an object, wrong types, unknown keys) falls back to the defaults", () => {
    assert.deepEqual(effectiveDashboardPrefs("weather" as never), DEFAULT_DASHBOARD_PREFS);
    assert.deepEqual(effectiveDashboardPrefs([] as never), DEFAULT_DASHBOARD_PREFS);
    assert.deepEqual(
      effectiveDashboardPrefs({ weather: "no", sceneMode: "hidden", quickLinks: true } as never),
      DEFAULT_DASHBOARD_PREFS,
    );
  });
});

describe("mergeDashboardPrefs (#681)", () => {
  test("a change is merged into the stored preferences, other keys stay", () => {
    assert.deepEqual(mergeDashboardPrefs({ weather: false, cabinScene: true }, { cabinScene: false, sceneMode: "static" }), {
      weather: false,
      cabinScene: false,
      sceneMode: "static",
    });
  });

  test("first change for a user without stored preferences", () => {
    assert.deepEqual(mergeDashboardPrefs(null, { noticeboard: true }), { noticeboard: true });
  });

  test("a null key removes it, so it falls back to the default", () => {
    assert.deepEqual(mergeDashboardPrefs({ weather: false, sceneMode: "static" }, { weather: null }), { sceneMode: "static" });
  });

  test("null as a whole resets everything to the defaults", () => {
    assert.equal(mergeDashboardPrefs({ weather: false }, null), null);
  });

  test("an empty change leaves the stored preferences as they are", () => {
    assert.deepEqual(mergeDashboardPrefs({ weather: false }, {}), { weather: false });
  });
});
