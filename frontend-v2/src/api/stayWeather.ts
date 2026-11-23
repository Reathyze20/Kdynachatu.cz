/** Předpověď Open-Meteo na 16 dní pro místo chaty (sdílí ji detail pobytu i Přehled) a výběr dnů pobytu (#323). */
import { DAY_NAMES } from "@/lib/utils";
import { mapWMOCode, resolveWeatherCoords, type WeatherPlace } from "./dashboard";

/** Horizont předpovědi: dnes + 15 dní. Od 8. dne (posun 7) je předpověď orientační. */
const HORIZON_DAYS = 16;
const TENTATIVE_FROM_OFFSET = 7;

export interface ForecastHour { time: string; precipProbability: number; windSpeed: number; temp: number }

export interface ForecastDay {
  date: string; // YYYY-MM-DD v časovém pásmu chaty
  dayName: string; // „Pá“
  weatherCode: number; description: string; icon: string; color: string;
  tempMax: number; tempMin: number; precipProbability: number; precipSum: number;
  sunrise: string | null; sunset: string | null; uvIndex: number; // čas „04:52“, UV max za den
  hours: ForecastHour[]; // hodinové řady pro graf (#325)
}

export interface CabinForecast { city: string; days: ForecastDay[] }
export type CabinForecastResult = CabinForecast | "EMPTY_LOCATION" | "LOCATION_NOT_FOUND";

export interface StayForecastDay extends ForecastDay { tentative: boolean }
/** `frost` = nejchladnější den s minimem ≤ 0 °C, `storm` = první den s bouřkou (WMO 95–99). */
export interface StayForecast { days: StayForecastDay[]; frost: StayForecastDay | null; storm: StayForecastDay | null }
export type StayForecastWindow = { kind: "ended" } | { kind: "later"; availableFrom: string } | { kind: "open" };

/** Posun kalendářního dne YYYY-MM-DD o `n` dní (počítá se v UTC, takže bez posunu času). */
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const hhmm = (timestamp: string | undefined) => timestamp?.split("T")[1]?.slice(0, 5) ?? null;

/** Skončený pobyt kartu nemá, pobyt za horizontem dostane datum, od kdy bude předpověď. */
export function stayForecastWindow(from: string, to: string, today: string): StayForecastWindow {
  if (to < today) return { kind: "ended" };
  const availableFrom = addDays(from, -(HORIZON_DAYS - 1));
  return availableFrom > today ? { kind: "later", availableFrom } : { kind: "open" };
}

export async function fetchCabinForecast(place: WeatherPlace | null | undefined): Promise<CabinForecastResult> {
  const coords = await resolveWeatherCoords(place);
  if (typeof coords === "string") return coords;
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
    `&hourly=precipitation_probability,wind_speed_10m,temperature_2m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum` +
    `&timezone=auto&forecast_days=${HORIZON_DAYS}`,
  );
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const { daily, hourly } = await res.json() as {
    daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; sunrise: string[]; sunset: string[]; uv_index_max: number[]; precipitation_probability_max: number[]; precipitation_sum: number[] };
    hourly: { time: string[]; precipitation_probability: number[]; wind_speed_10m: number[]; temperature_2m: number[] };
  };
  const days = daily.time.map((date, i): ForecastDay => {
    const weatherCode = daily.weather_code[i] ?? 0;
    const hours = hourly.time.flatMap((t, h): ForecastHour[] => t.startsWith(date) ? [{
      time: hhmm(t) ?? "",
      precipProbability: hourly.precipitation_probability[h] ?? 0,
      windSpeed: Math.round(hourly.wind_speed_10m[h] ?? 0),
      temp: Math.round(hourly.temperature_2m[h] ?? 0),
    }] : []);
    return {
      date, dayName: DAY_NAMES[(new Date(date + "T12:00:00").getDay() + 6) % 7], weatherCode, ...mapWMOCode(weatherCode, false),
      tempMax: daily.temperature_2m_max[i] ?? 0, tempMin: daily.temperature_2m_min[i] ?? 0, // nezaokrouhlené kvůli výstraze mrazu
      precipProbability: daily.precipitation_probability_max[i] ?? 0,
      precipSum: Math.round((daily.precipitation_sum[i] ?? 0) * 10) / 10,
      sunrise: hhmm(daily.sunrise[i]), sunset: hhmm(daily.sunset[i]), uvIndex: Math.round(daily.uv_index_max[i] ?? 0),
      hours,
    };
  });
  return { city: coords.city, days };
}

/** Dny pobytu z předpovědi (u probíhajícího pobytu od dneška) s příznakem „orientační“ a výstrahami. */
export function pickStayForecast(forecast: CabinForecast, from: string, to: string, today: string): StayForecast {
  const start = from > today ? from : today;
  const tentativeFrom = addDays(today, TENTATIVE_FROM_OFFSET);
  const days = forecast.days
    .filter((d) => d.date >= start && d.date <= to)
    .map((d) => ({ ...d, tentative: d.date >= tentativeFrom }));
  const frosty = days.filter((d) => d.tempMin <= 0);
  const frost = frosty.length ? frosty.reduce((a, b) => (b.tempMin < a.tempMin ? b : a)) : null;
  const storm = days.find((d) => d.weatherCode >= 95 && d.weatherCode <= 99) ?? null;
  return { days, frost, storm };
}
