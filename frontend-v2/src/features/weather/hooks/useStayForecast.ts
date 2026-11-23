import { useQuery } from "@tanstack/react-query";
import type { WeatherPlace } from "@/api/dashboard";
import { fetchCabinForecast, pickStayForecast, stayForecastWindow } from "@/api/stayWeather";
import { getLocalTodayIso } from "@/lib/dateUtils";

/** Klíč podle místa, ne podle pobytu: detail pobytu i Přehled (#326) sdílí jedno stažení. */
export const forecastKey = (place: WeatherPlace) => ["weather", "forecast", place.latitude ?? null, place.longitude ?? null, place.weatherLocation ?? null] as const;

/** Předpověď na pobyt: nic nestahuje pro skončený pobyt ani pobyt za horizontem 16 dní. */
export function useStayForecast(place: WeatherPlace | undefined, from: string, to: string) {
  const today = getLocalTodayIso();
  const window = stayForecastWindow(from, to, today);
  const query = useQuery({
    queryKey: place ? forecastKey(place) : ["weather", "forecast", "pending"],
    queryFn: () => fetchCabinForecast(place),
    enabled: !!place && window.kind === "open",
    staleTime: 30 * 60 * 1000,
  });
  const stay = query.data && typeof query.data === "object" ? pickStayForecast(query.data, from, to, today) : null;
  return { window, stay, location: typeof query.data === "string" ? query.data : null, isError: query.isError, isLoading: query.isLoading };
}
