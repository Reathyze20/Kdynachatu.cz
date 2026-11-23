import { useQuery } from "@tanstack/react-query";
import { fetchWeather, type WeatherPlace } from "@/api/dashboard";

/** Klíč podle místa chaty: menu i karta na Přehledu (#338) sdílí jedno stažení. */
export const todayWeatherKey = (place: WeatherPlace | undefined) => ["weather", place?.weatherLocation ?? null, place?.latitude ?? null, place?.longitude ?? null] as const;

/** Počasí dnes pro uložený střed obce, jinak pro textovou lokalitu; čeká, dokud nejsou nastavení chaty. */
export function useTodayWeather(place: WeatherPlace | undefined) {
  return useQuery({
    queryKey: todayWeatherKey(place),
    queryFn: () => fetchWeather(place),
    enabled: place !== undefined,
    staleTime: 10 * 60 * 1000,
  });
}
