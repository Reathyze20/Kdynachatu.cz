import { useQuery } from "@tanstack/react-query";
import type { WeatherPlace } from "@/api/dashboard";
import { fetchCabinForecast, pickStayForecast, stayForecastWindow } from "@/api/stayWeather";
import { getLocalTodayIso } from "@/lib/dateUtils";

/** Klíč podle místa, ne podle pobytu: detail pobytu i Přehled (#326) sdílí jedno stažení. */
export const forecastKey = (place: WeatherPlace | undefined) => ["weather", "forecast", place?.latitude ?? null, place?.longitude ?? null, place?.weatherLocation ?? null] as const;

/** Předpověď na pobyt: nic nestahuje pro skončený pobyt ani pobyt za horizontem 16 dní. */
export function useStayForecast(place: WeatherPlace | undefined, from: string, to: string) {
  const today = getLocalTodayIso();
  const horizon = stayForecastWindow(from, to, today);
  const query = useQuery({
    queryKey: forecastKey(place),
    queryFn: () => fetchCabinForecast(place),
    enabled: !!place && horizon.kind === "open",
    staleTime: 30 * 60 * 1000,
  });
  const stay = query.data && typeof query.data === "object" ? pickStayForecast(query.data, from, to, today) : null;
  return { horizon, stay, locationProblem: typeof query.data === "string" ? query.data : null, isError: query.isError, isLoading: query.isLoading };
}
