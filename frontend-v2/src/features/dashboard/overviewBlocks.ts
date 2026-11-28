/**
 * overviewBlocks.ts — jediné místo, které rozhoduje, které bloky Přehledu jsou vidět (#685, spec #677).
 * Vždy: hlavička, Kdo jede, Důležité a Visí na tobě (prázdné se nevykreslí samy). Banner zazimování,
 * souhrnná chyba, aktivační checklist správce a instalační karta jdou podle situace, bez přepínače.
 * Volitelné bloky podle efektivních preferencí uživatele (`GET /users/me`) a dat; host personalizaci nemá.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, PROFILE_KEY, type DashboardPrefs, type UserProfile } from "@/api/auth";
import { handleMutationError } from "@/lib/mutationError";
import { isQueuedOffline } from "@/lib/offlineQueue";

/** Přepínatelné bloky v pevném pořadí Přehledu. */
export const OVERVIEW_TOGGLES = ["weather", "cabinScene", "sinceLast", "laterAndFree", "stayForecast", "regionEvents", "noticeboard"] as const;
export type OverviewToggle = (typeof OVERVIEW_TOGGLES)[number];
export type OverviewBlocks = Record<OverviewToggle, boolean>;

/** České názvy přepínačů v „Upravit Přehled“ a v Můj profil (#686). */
export const OVERVIEW_TOGGLE_LABELS: Record<OverviewToggle, string> = {
  weather: "Počasí",
  cabinScene: "Scéna chaty",
  sinceLast: "Od minule",
  laterAndFree: "Potom a volno",
  stayForecast: "Předpověď na pobyt",
  regionEvents: "Akce v kraji",
  noticeboard: "Nástěnka",
};

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

/**
 * Má boční sloupec co ukázat? Na desktopu nese zapnuté volitelné bloky kromě Počasí a Akcí v kraji
 * (ty jsou v levém menu), na mobilu jen Nástěnku. Prázdné „Potom a volno“ se tu nerozpozná.
 */
export function hasAsideContent(blocks: OverviewBlocks, isDesktop: boolean): boolean {
  return blocks.noticeboard || (isDesktop && (blocks.cabinScene || blocks.sinceLast || blocks.laterAndFree || blocks.stayForecast));
}

/** Uložené preference Přehledu přihlášeného uživatele; sdílí dotaz s profilem. Host je nenačítá. */
export function useDashboardPrefs(enabled: boolean): DashboardPrefs | null | undefined {
  const { data } = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: authApi.getMe,
    enabled,
    staleTime: 60_000,
  });
  return data?.dashboardPrefs;
}

const PREFS_MUTATION_KEY = ["dashboardPrefs"] as const;

/**
 * Uloží změnu preferencí Přehledu (#686). Optimisticky: Přehled, sheet i profil čtou stejný dotaz,
 * takže se změna projeví všude hned. Při chybě serveru se vrátí původní stav a ukáže se toast;
 * změna uložená do offline fronty zůstane (odešle se po připojení).
 */
export function useUpdateDashboardPrefs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: PREFS_MUTATION_KEY,
    mutationFn: authApi.updateDashboardPrefs,
    onMutate: async (change: DashboardPrefs) => {
      await queryClient.cancelQueries({ queryKey: PROFILE_KEY });
      const previous = queryClient.getQueryData<UserProfile>(PROFILE_KEY);
      queryClient.setQueryData<UserProfile>(PROFILE_KEY, (old) => old && { ...old, dashboardPrefs: { ...old.dashboardPrefs, ...change } });
      return { previous };
    },
    onError: (error: Error, _change, context) => {
      if (!isQueuedOffline(error)) queryClient.setQueryData(PROFILE_KEY, context?.previous);
      handleMutationError("Nastavení Přehledu se nepodařilo uložit")(error);
    },
    // Až doběhne poslední z rychle po sobě odeslaných změn, srovná se stav se serverem
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: PREFS_MUTATION_KEY }) <= 1) void queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
    },
  });
}
