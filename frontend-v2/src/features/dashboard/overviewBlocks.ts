/**
 * overviewBlocks.ts — jediné místo, které rozhoduje, které bloky Přehledu jsou vidět (#685, spec #677).
 * Vždy: hlavička, Kdo jede, Důležité a Visí na tobě (prázdné se nevykreslí samy). Banner zazimování,
 * souhrnná chyba, aktivační checklist správce a instalační karta jdou podle situace, bez přepínače.
 * Volitelné bloky podle efektivních preferencí uživatele (`GET /users/me`) a dat; host personalizaci nemá.
 */
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/api/client";
import type { DashboardPrefs, UserProfile } from "@/api/auth";

/** Přepínatelné bloky v pevném pořadí Přehledu. */
export const OVERVIEW_TOGGLES = ["weather", "cabinScene", "sinceLast", "laterAndFree", "stayForecast", "regionEvents", "noticeboard"] as const;
export type OverviewToggle = (typeof OVERVIEW_TOGGLES)[number];
export type OverviewBlocks = Record<OverviewToggle, boolean>;

/** Bez uložené hodnoty je zapnuté jen Počasí (zrcadlí `effectiveDashboardPrefs` v src/utils/dashboardPrefs.ts). */
export function effectiveToggles(stored: DashboardPrefs | null | undefined): OverviewBlocks {
  const result = Object.fromEntries(OVERVIEW_TOGGLES.map((key) => [key, key === "weather"])) as OverviewBlocks;
  for (const key of OVERVIEW_TOGGLES) {
    const value = stored?.[key];
    if (typeof value === "boolean") result[key] = value;
  }
  return result;
}

interface OverviewInput {
  isGuest: boolean;
  prefs: DashboardPrefs | null | undefined;
  /** Je nejbližší pobyt v okně předpovědi (7 dní před příjezdem)? */
  hasStayForecast: boolean;
  /** Je co říct „Od minule“: poslední pobyt existuje a na chatě teď nikdo není. */
  hasSinceLast: boolean;
}

/** Host má výchozí stav bez personalizace (z volitelných bloků jen Počasí); ostatní podle preferencí a dat. */
export function overviewBlocks({ isGuest, prefs, hasStayForecast, hasSinceLast }: OverviewInput): OverviewBlocks {
  const toggles = effectiveToggles(isGuest ? null : prefs);
  return { ...toggles, stayForecast: toggles.stayForecast && hasStayForecast, sinceLast: toggles.sinceLast && hasSinceLast };
}

/** Uložené preference Přehledu přihlášeného uživatele; sdílí dotaz s profilem. Host je nenačítá. */
export function useDashboardPrefs(enabled: boolean): DashboardPrefs | null | undefined {
  const { data } = useQuery<UserProfile>({
    queryKey: ["profile"],
    queryFn: () => apiClient.get<UserProfile>("/users/me").then((r) => r.data),
    enabled,
    staleTime: 60_000,
  });
  return data?.dashboardPrefs;
}
