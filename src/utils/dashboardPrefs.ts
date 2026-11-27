import type { DashboardPrefs, DashboardSceneMode } from "../types";

// Preference Přehledu (#681, spec #677). Uložené jsou jen hodnoty, které si uživatel změnil;
// zbytek doplní výchozí: Počasí zapnuté, ostatní přepínatelné bloky vypnuté, scéna animated.

export interface EffectiveDashboardPrefs {
  weather: boolean;
  cabinScene: boolean;
  sinceLast: boolean;
  laterAndFree: boolean;
  stayForecast: boolean;
  regionEvents: boolean;
  noticeboard: boolean;
  sceneMode: DashboardSceneMode;
  simplifiedNoteDismissed: boolean;
}

export const DEFAULT_DASHBOARD_PREFS: Readonly<EffectiveDashboardPrefs> = Object.freeze({
  weather: true,
  cabinScene: false,
  sinceLast: false,
  laterAndFree: false,
  stayForecast: false,
  regionEvents: false,
  noticeboard: false,
  sceneMode: "animated",
  simplifiedNoteDismissed: false,
});

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Složí uložené preference s výchozími. Chybějící klíč, null nebo hodnota špatného typu = výchozí. */
export function effectiveDashboardPrefs(stored: DashboardPrefs | null | undefined): EffectiveDashboardPrefs {
  const result: EffectiveDashboardPrefs = { ...DEFAULT_DASHBOARD_PREFS };
  if (!isPlainObject(stored)) return result;
  for (const key of Object.keys(DEFAULT_DASHBOARD_PREFS) as (keyof EffectiveDashboardPrefs)[]) {
    const value = stored[key];
    if (key === "sceneMode") {
      if (value === "animated" || value === "static") result.sceneMode = value;
    } else if (typeof value === "boolean") {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Sloučí změnu z `PATCH /users/me` s uloženými preferencemi. Klíč s null se smaže (vrátí se na výchozí),
 * null místo celého objektu smaže všechno. Vstup je už ověřený Zod schématem.
 */
export function mergeDashboardPrefs(stored: DashboardPrefs | null | undefined, change: DashboardPrefs | null): DashboardPrefs | null {
  if (change === null) return null;
  const merged: Record<string, unknown> = isPlainObject(stored) ? { ...stored } : {};
  for (const [key, value] of Object.entries(change)) {
    if (value === null) delete merged[key];
    else if (value !== undefined) merged[key] = value;
  }
  return merged as DashboardPrefs;
}
