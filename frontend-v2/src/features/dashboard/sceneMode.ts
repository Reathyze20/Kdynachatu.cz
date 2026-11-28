/**
 * sceneMode.ts — režim Scény chaty přihlášeného uživatele (#687, spec #677). Ukládá se na server k uživateli
 * (`dashboardPrefs.sceneMode`), takže platí na telefonu i počítači. Dřívější „Skrytá“ = vypnutý přepínač Scéna chaty.
 * Bez režimu na serveru platí volba, která zůstala v zařízení (než ji `useMigrateDeviceSceneMode` přenese),
 * jinak výchozí stav podle zařízení (`prefers-reduced-motion` → Statická).
 */
import { useEffect, useRef } from "react";
import type { DashboardPrefs, DashboardSceneMode } from "@/api/auth";
import { storedDeviceSceneMode, useCabinSceneMode, writeDeviceSceneMode, type CabinSceneMode } from "@/hooks/useCabinSceneMode";
import { isQueuedOffline } from "@/lib/offlineQueue";
import { effectiveToggles, useDashboardPrefs, useUpdateDashboardPrefs } from "./overviewBlocks";

/** Volba u přepínače Scéna chaty v „Upravit Přehled“ a v Můj profil, v tomto pořadí. */
export const SCENE_MODE_LABELS: Record<DashboardSceneMode, string> = { animated: "Animovaná", static: "Statická" };

/**
 * Přepínač (`sceneOn`) a režim scény přihlášeného; `enabled` = načíst preference. Host (`enabled` false)
 * personalizaci nemá, scénu ani maskota nevidí.
 */
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
 * Jednou za spuštění appky přenese volbu ze zařízení na server a ze zařízení ji smaže. Běží v AppShell,
 * aby se odeslal jediný PATCH. Když přenos selže, volba v zařízení zůstane a zkusí se při příštím spuštění.
 */
export function useMigrateDeviceSceneMode(enabled: boolean) {
  const prefs = useDashboardPrefs(enabled);
  const { mutate } = useUpdateDashboardPrefs();
  const done = useRef(false);

  useEffect(() => {
    if (!enabled || prefs === undefined || done.current) return;
    done.current = true;
    const stored = storedDeviceSceneMode();
    if (!stored) return;
    writeDeviceSceneMode(null);
    const change = migrationChange(stored, prefs);
    // Optimistická změna drží stejný režim, i když volba v zařízení zmizí dřív, než server odpoví
    if (change) mutate(change, { onError: (error) => void (isQueuedOffline(error) || writeDeviceSceneMode(stored)) });
  }, [enabled, prefs, mutate]);
}
