/** „Počasí na pobyt“ (#324, vizuál docs/design/07-teplo-atomy.html díl 2): dny pobytu, slunce a UV, výstrahy. Hodinový graf přidá #325. */
import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, CloudSunRain,
  Droplets, Snowflake, Sun, Sunrise, Sunset, ThermometerSnowflake, TriangleAlert, type LucideIcon,
} from "lucide-react";
import type { StayForecastDay } from "@/api/stayWeather";
import { useAuth } from "@/context/AuthContext";
import { useCabinSettings } from "@/features/settings/hooks/useCabinSettings";
import { formatShortDayDate, isoDateToLocalNoon } from "@/lib/dateUtils";
import { DAY_NAMES_FULL } from "@/lib/utils";
import { useStayForecast } from "./hooks/useStayForecast";

const ICONS: Record<string, LucideIcon> = {
  sun: Sun, "cloud-sun": CloudSun, cloud: Cloud, fog: CloudFog, "cloud-drizzle": CloudDrizzle,
  "cloud-rain": CloudRain, snowflake: Snowflake, "cloud-sun-rain": CloudSunRain, "cloud-lightning": CloudLightning,
};

const deg = (t: number) => `${Math.round(t) < 0 ? "−" : ""}${Math.abs(Math.round(t))}`;
const fullDayName = (iso: string) => DAY_NAMES_FULL[(isoDateToLocalNoon(iso).getDay() + 6) % 7];
const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;
const uvLabel = (uv: number) => (uv < 3 ? "nízký" : uv < 6 ? "střední" : uv < 8 ? "vysoký" : "velmi vysoký");

function DayCell({ day }: { day: StayForecastDay }) {
  const Icon = ICONS[day.icon] ?? Cloud;
  const label = `${fullDayName(day.date)} ${dayMonth(day.date)}: ${day.description}, ${deg(day.tempMax)} až ${deg(day.tempMin)} °C, srážky ${day.precipProbability} %${day.tentative ? ", orientační" : ""}`;
  return (
    <li className="flex flex-col items-center gap-1 rounded-xl bg-slate-50 px-1 py-2.5">
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="text-sm font-bold text-slate-700">{day.dayName} {Number(day.date.slice(8, 10))}.</span>
      {day.tentative && <span aria-hidden="true" className="text-sm italic text-slate-600">orientační</span>}
      <Icon aria-hidden="true" className="w-7 h-7" style={{ color: day.color }} />
      <span aria-hidden="true" className="text-base"><b>{deg(day.tempMax)}°</b><span className="text-slate-600"> / {deg(day.tempMin)}°</span></span>
      <span aria-hidden="true" className={`inline-flex items-center gap-1 text-sm font-semibold text-blue-700 ${day.precipProbability >= 5 ? "" : "invisible"}`}>
        <Droplets className="w-4 h-4" />{day.precipProbability} %
      </span>
    </li>
  );
}

function Alert({ icon: Icon, day, text }: { icon: LucideIcon; day: StayForecastDay; text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-base text-amber-900">
      <Icon aria-hidden="true" className="mt-0.5 w-5 h-5 shrink-0" />
      <span><b>{day.dayName} {dayMonth(day.date)}:</b> {text}</span>
    </p>
  );
}

/** `title` = kdo a kdy (Přehled, #326), `frame` = rámeček karty (v detailu tenký obrys, na Přehledu samostatná karta). */
export function StayWeatherCard({ from, to, title, frame = "rounded-[20px] border border-slate-100" }: { from: string; to: string; title?: string; frame?: string }) {
  const headingId = useId();
  const { user } = useAuth();
  const cabin = useCabinSettings();
  const { horizon, stay, locationProblem, isError, isLoading } = useStayForecast(cabin.data ?? undefined, from, to);

  let body: ReactNode;
  if (horizon.kind === "ended") return null;
  if (horizon.kind === "later") {
    body = (
      <p className="flex items-center gap-2.5 text-base text-slate-800">
        <CalendarDays aria-hidden="true" className="w-5 h-5 text-slate-600" />
        <span>Předpověď bude k dispozici od <b>{formatShortDayDate(horizon.availableFrom)}</b></span>
      </p>
    );
  } else if (locationProblem) {
    if (user?.role !== "admin") return null;
    body = (
      <p className="text-base text-slate-700">
        {locationProblem === "LOCATION_NOT_FOUND" ? "Obec chaty se nepodařilo najít." : "Chata nemá nastavenou obec."}{" "}
        <Link to="/admin/cabin" className="inline-flex min-h-12 items-center font-semibold text-[var(--brand-primary)] underline">Nastavit lokalitu počasí</Link>
      </p>
    );
  } else if (isError) {
    body = <p className="text-base text-slate-700">Předpověď se teď nepodařilo načíst.</p>;
  } else if (stay && stay.days.length > 0) {
    const first = stay.days[0];
    body = (
      <>
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(84px,1fr))] gap-1.5">
          {stay.days.map((d) => <DayCell key={d.date} day={d} />)}
        </ul>
        {stay.days.some((d) => d.tentative) && <p className="text-sm text-slate-600">Dny 8–16 jsou orientační, předpověď se ještě změní.</p>}
        <p className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
          {first.sunrise && <span className="inline-flex items-center gap-1.5"><Sunrise aria-hidden="true" className="w-4 h-4 text-amber-600" /><span className="sr-only">Východ slunce</span>{first.sunrise}</span>}
          {first.sunset && <span className="inline-flex items-center gap-1.5"><Sunset aria-hidden="true" className="w-4 h-4 text-amber-600" /><span className="sr-only">Západ slunce</span>{first.sunset}</span>}
          <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700"><Sun aria-hidden="true" className="w-4 h-4" />UV {first.uvIndex} {uvLabel(first.uvIndex)}</span>
        </p>
        {stay.frost && <Alert icon={ThermometerSnowflake} day={stay.frost} text={`v noci mráz až ${deg(stay.frost.tempMin)} °C. Před odjezdem vypusť vodu.`} />}
        {stay.storm && <Alert icon={TriangleAlert} day={stay.storm} text="hrozí bouřka." />}
      </>
    );
  } else if (isLoading || cabin.isLoading) {
    body = <div className="h-28 rounded-xl bg-slate-50 animate-pulse" aria-busy="true" />;
  } else return null;

  return (
    <section aria-labelledby={headingId} className={`flex flex-col gap-3 p-4 ${frame}`} data-testid="stay-weather-card">
      <h3 id={headingId} className="text-sm font-bold uppercase tracking-wide text-slate-600">Počasí na pobyt</h3>
      {title && <p className="-mt-2 text-[17px] font-extrabold text-slate-900">{title}</p>}
      {body}
    </section>
  );
}
