/**
 * SidebarToday — dnešek chaty v levém menu na desktopu (#338). Bloky Počasí a Akce v kraji v něm
 * platí podle stejných přepínačů jako na Přehledu (`overviewBlocks`, #685).
 */
import { useAuth } from "@/context/AuthContext";
import { CabinToday } from "./CabinToday";
import { overviewBlocks, useDashboardPrefs } from "./overviewBlocks";

export function SidebarToday() {
  const { isGuest } = useAuth();
  const prefs = useDashboardPrefs(!isGuest);
  const blocks = overviewBlocks({ isGuest: !!isGuest, prefs, hasStayForecast: false, hasSinceLast: false });
  return <CabinToday variant="sidebar" weather={blocks.weather} events={blocks.regionEvents} />;
}
