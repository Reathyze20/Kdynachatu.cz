/**
 * Volba „Scéna chaty“ uložená v zařízení (#565): Animovaná / Statická / Skrytá. Od #687 se režim přihlášeného ukládá
 * na server (`features/dashboard/sceneMode.ts`) a volba v zařízení platí jen pro nepřihlášené (landing page, 404)
 * a do chvíle, než ji appka jednou přenese na server. Bez uložené volby je scéna statická,
 * když zařízení hlásí `prefers-reduced-motion: reduce`, jinak animovaná. Změna se projeví hned ve všech
 * komponentách, které hook používají, i v ostatních oknech appky.
 */
import { useSyncExternalStore } from "react";

export type CabinSceneMode = "animated" | "static" | "hidden";

const STORAGE_KEY = "cabinSceneMode";
const CHANGE_EVENT = "cabin-scene-mode-change";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const MODES: readonly CabinSceneMode[] = ["animated", "static", "hidden"];

function reducedMotion(): MediaQueryList | null {
  return typeof window !== "undefined" && window.matchMedia ? window.matchMedia(REDUCED_MOTION_QUERY) : null;
}

/** Volba uložená v tomto zařízení, nebo null. */
export function storedDeviceSceneMode(): CabinSceneMode | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (MODES.includes(stored as CabinSceneMode)) return stored as CabinSceneMode;
  } catch {
    // localStorage nedostupné: platí výchozí stav podle zařízení
  }
  return null;
}

function readMode(): CabinSceneMode {
  return storedDeviceSceneMode() ?? (reducedMotion()?.matches ? "static" : "animated");
}

/** Zapíše volbu do zařízení (null ji smaže) a dá o změně vědět všem komponentám s hookem. */
export function writeDeviceSceneMode(next: CabinSceneMode | null) {
  try {
    if (next) localStorage.setItem(STORAGE_KEY, next);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage nedostupné: volba nevydrží, scéna zůstane ve výchozím stavu
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Změna volby v tomto okně, v jiném okně appky (`storage`) nebo nastavení pohybu v zařízení. */
function subscribe(onChange: () => void) {
  const mql = reducedMotion();
  for (const event of [CHANGE_EVENT, "storage"]) window.addEventListener(event, onChange);
  mql?.addEventListener?.("change", onChange);
  return () => {
    for (const event of [CHANGE_EVENT, "storage"]) window.removeEventListener(event, onChange);
    mql?.removeEventListener?.("change", onChange);
  };
}

export function useCabinSceneMode(): CabinSceneMode {
  return useSyncExternalStore(subscribe, readMode, () => "static" as const);
}
