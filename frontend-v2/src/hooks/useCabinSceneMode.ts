/**
 * Volba „Scéna chaty“ (#565): Animovaná / Statická / Skrytá. Platí pro scénu na Přehledu i maskota na mobilní liště
 * (#566) a ukládá se jen v tomto zařízení (localStorage), nic se neposílá na server. Bez uložené volby je scéna statická,
 * když zařízení hlásí `prefers-reduced-motion: reduce`, jinak animovaná. Změna se projeví hned ve všech
 * komponentách, které hook používají, i v ostatních oknech appky.
 */
import { useCallback, useSyncExternalStore } from "react";

export type CabinSceneMode = "animated" | "static" | "hidden";

const STORAGE_KEY = "cabinSceneMode";
const CHANGE_EVENT = "cabin-scene-mode-change";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const MODES: readonly CabinSceneMode[] = ["animated", "static", "hidden"];

function reducedMotion(): MediaQueryList | null {
  return typeof window !== "undefined" && window.matchMedia ? window.matchMedia(REDUCED_MOTION_QUERY) : null;
}

function readMode(): CabinSceneMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (MODES.includes(stored as CabinSceneMode)) return stored as CabinSceneMode;
  } catch {
    // localStorage nedostupné: platí výchozí stav podle zařízení
  }
  return reducedMotion()?.matches ? "static" : "animated";
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

export function useCabinSceneMode(): [CabinSceneMode, (mode: CabinSceneMode) => void] {
  const mode = useSyncExternalStore(subscribe, readMode, () => "static" as const);
  const setMode = useCallback((next: CabinSceneMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage nedostupné: volba nevydrží, scéna zůstane ve výchozím stavu
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [mode, setMode];
}
