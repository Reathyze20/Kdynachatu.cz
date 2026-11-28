/**
 * sceneMode.ts — režim Scény chaty přihlášeného, uložený na serveru (`dashboardPrefs.sceneMode`, #687, spec #677).
 * Dřívější „Skrytá“ = vypnutý přepínač. Bez režimu na serveru platí volba ze zařízení (než ji
 * `useMigrateDeviceSceneMode` přenese), jinak výchozí stav podle zařízení (`prefers-reduced-motion` → Statická).
 */
import { useEffect, useRef } from "react";
import type { DashboardPrefs, DashboardSceneMode } from "@/api/auth";
import { storedDeviceSceneMode, useCabinSceneMode, writeDeviceSceneMode, type CabinSceneMode } from "@/hooks/useCabinSceneMode";
import { isQueuedOffline } from "@/lib/offlineQueue";
import { effectiveToggles, useDashboardPrefs, useUpdateDashboardPrefs } from "./overviewBlocks";

/** Volba u přepínače Scéna chaty v „Upravit Přehled“ a v Můj profil, v tomto pořadí. */
export const SCENE_MODE_LABELS: Record<DashboardSceneMode, string> = { animated: "Animovaná", static: "Statická" };

/** Přepínač a režim scény; `enabled` = načíst preference. Host personalizaci nemá, scénu ani maskota nevidí. */
export function useSceneMode(enabled: boolean): { sceneOn: boolean; mode: CabinSceneMode } {
  const prefs = useDashboardPrefs(enabled);
  const deviceMode = useCabinSceneMode();
  if (!enabled) return { sceneOn: false, mode: deviceMode };
  return { sceneOn: effectiveToggles(prefs).cabinScene, mode: prefs?.sceneMode ?? deviceMode };
}

/** Co poslat na server za volbu ze zařízení; null = server už má svou hodnotu, stačí volbu v zařízení smazat. */
function migrationChange(stored: CabinSceneMode, prefs: DashboardPrefs | null): DashboardPrefs | null {
  if (stored === "hidden") return prefs?.cabinScene == null ? { cabinScene: false } : null;
  return prefs?.sceneMode == null ? { sceneMode: stored } : null;
}

/**
 * Jednou za spuštění appky přenese volbu ze zařízení na server a ze zařízení ji smaže, až když ji server přijme
 * (do té doby drží stejný režim). Běží v AppShell, aby se odeslal jediný PATCH. Když přenos selže, volba
 * v zařízení zůstane a zkusí se tiše při příštím spuštění.
 */
export function useMigrateDeviceSceneMode(enabled: boolean) {
  const prefs = useDashboardPrefs(enabled);
  const { mutate } = useUpdateDashboardPrefs({ quiet: true });
  const done = useRef(false);
  useEffect(() => {
    if (!enabled || prefs === undefined || done.current) return;
    done.current = true;
    const stored = storedDeviceSceneMode();
    if (!stored) return;
    const change = migrationChange(stored, prefs);
    const forget = () => writeDeviceSceneMode(null);
    if (!change) return forget();
    mutate(change, { onSuccess: forget, onError: (error) => { if (isQueuedOffline(error)) forget(); } });
  }, [enabled, prefs, mutate]);
}
