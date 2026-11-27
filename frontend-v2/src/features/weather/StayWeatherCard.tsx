/** „Počasí na pobyt“ (#324, vizuál docs/design/07-teplo-atomy.html díl 2): dny pobytu, hodinový graf vybraného dne (#325), slunce a UV, výstrahy. */
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CalendarDays, ChevronDown, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, CloudSunRain,
  Droplets, Snowflake, Sun, Sunrise, Sunset, ThermometerSnowflake, TriangleAlert, type LucideIcon,
} from "lucide-react";
import type { StayForecastDay } from "@/api/stayWeather";
import { useAuth } from "@/context/AuthContext";
import { useCabinSettings } from "@/features/settings/hooks/useCabinSettings";
import { capitalize, formatShortDayDate } from "@/lib/dateUtils";
import { formatShortDate, weekdayName } from "@/lib/format";
import { useStayForecast } from "./hooks/useStayForecast";
import { StayHourlyChart } from "./StayHourlyChart";
import { tileGrid } from "./tileGrid";

const ICONS: Record<string, LucideIcon> = {
  sun: Sun, "cloud-sun": CloudSun, cloud: Cloud, fog: CloudFog, "cloud-drizzle": CloudDrizzle,
  "cloud-rain": CloudRain, snowflake: Snowflake, "cloud-sun-rain": CloudSunRain, "cloud-lightning": CloudLightning,
};

const deg = (t: number) => `${Math.round(t) < 0 ? "−" : ""}${Math.abs(Math.round(t))}`;
const fullDayName = (iso: string) => capitalize(weekdayName(iso, "long"));
const uvLabel = (uv: number) => (uv < 3 ? "nízký" : uv < 6 ? "střední" : uv < 8 ? "vysoký" : "velmi vysoký");
/** Délka dne z východu a západu „HH:MM“, např. „8 h 39 min“. */
function dayLength(sunrise: string | null, sunset: string | null): string | null {
  if (!sunrise || !sunset) return null;
  const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const diff = minutes(sunset) - minutes(sunrise);
  return diff > 0 ? `${Math.floor(diff / 60)} h ${diff % 60} min` : null;
}
const dayLabel = (d: StayForecastDay) => `${d.dayName} ${Number(d.date.slice(8, 10))}.`;
/** Poznámka k orientačním dnům jmenuje dny pobytu: „So a Ne jsou orientační“, víc než tři rozsahem (#526). */
function tentativeNote(days: StayForecastDay[]): string | null {
  const tentative = days.filter((d) => d.tentative);
  const last = tentative.at(-1);
  if (!last) return null;
  const names = tentative.length > 3 ? `${dayLabel(tentative[0])} – ${dayLabel(last)}`
    : tentative.length === 1 ? last.dayName
    : `${tentative.slice(0, -1).map((d) => d.dayName).join(", ")} a ${last.dayName}`;
  return `${names} ${tentative.length === 1 ? "je" : "jsou"} orientační, předpověď se ještě změní.`;
}
/**
 * Nejvýš 3 dlaždice v řádku na úzké kartě, 5 od 30rem a 7 od 42rem šířky karty (container query, ne breakpoint).
 * Stupně jsou i v třídách `grid-cols-(--cols-*)` a `col-span-(--span-*)` níž, mění se spolu. Inline `style` nese
 * jen vypočtenou mřížku (počet sloupců a rozpětí), ne barvu ani rozměr z designu.
 */
const TILE_TIERS = [3, 5, 7] as const;
const tierVars = (name: string, values: (number | string)[]) =>
  Object.fromEntries(TILE_TIERS.map((tier, i) => [`--${name}-${tier}`, String(values[i])])) as CSSProperties;

function DayCell({ day, selected, onSelect, spans }: { day: StayForecastDay; selected: boolean; onSelect: () => void; spans: number[] }) {
  const Icon = ICONS[day.icon] ?? Cloud;
  const label = `${fullDayName(day.date)} ${formatShortDate(day.date)}: ${day.description}, ${deg(day.tempMax)} až ${deg(day.tempMin)} °C, srážky ${day.precipProbability} %${day.tentative ? ", orientační" : ""}`;
  return (
    <li className="col-span-(--span-3) @min-[30rem]:col-span-(--span-5) @min-[42rem]:col-span-(--span-7)" style={tierVars("span", spans)}><button
      type="button" aria-pressed={selected} onClick={onSelect}
      className={`flex h-full min-h-12 w-full flex-col items-center gap-1 rounded-xl border-[1.5px] px-1 py-2 focus-visible:outline-2 focus-visible:outline-primary ${selected ? "border-primary bg-accent" : "border-transparent bg-inset"}`}
    >
      <span className="sr-only">{label}</span>
      {/* „orientační“ vedle dne, když se vejde, jinak pod ním (#356) */}
      <span aria-hidden="true" className="flex flex-wrap items-baseline justify-center gap-x-1.5">
        <span className="text-label font-bold text-(--text-main)">{dayLabel(day)}</span>
        {day.tentative && <span className="text-meta italic text-(--text-muted)">orientační</span>}
      </span>
      <Icon aria-hidden="true" className="size-6" style={{ color: day.color }} />
      <span aria-hidden="true" className="text-body text-(--text-main)"><b>{deg(day.tempMax)}°</b><span className="text-(--text-muted)"> / {deg(day.tempMin)}°</span></span>
      <span aria-hidden="true" className={`inline-flex items-center gap-1 text-meta font-semibold text-(--text-muted) ${day.precipProbability >= 5 ? "" : "invisible"}`}>
        <Droplets className="size-4 text-(--status-info)" />{day.precipProbability} %
      </span>
    </button></li>
  );
}

function Alert({ icon: Icon, day, text }: { icon: LucideIcon; day: StayForecastDay; text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-(--status-warning-light) px-3 py-2 text-body text-(--text-main)">
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <span><b>{day.dayName} {formatShortDate(day.date)}:</b> {text}</span>
    </p>
  );
}

/**
 * `title` = kdo a kdy (Přehled, #326), `frame` = rámeček karty (v detailu tenký obrys, na Přehledu samostatná karta).
 * `collapsibleChart` = hodinový graf je sbalený, otevře ho tlačítko „Hodinový graf“ nebo ťuknutí na den (Přehled, #338).
 */
export function StayWeatherCard({ from, to, title, frame = "rounded-[20px] border border-rule-soft", collapsibleChart = false }: {
  from: string; to: string; title?: string; frame?: string; collapsibleChart?: boolean;
}) {
  const headingId = useId();
  const chartId = useId();
  const [chartOpen, setChartOpen] = useState(!collapsibleChart);
  const reduceMotion = useReducedMotion();
  const { user } = useAuth();
  const cabin = useCabinSettings();
  const { horizon, stay, locationProblem, isError, isLoading } = useStayForecast(cabin.data ?? undefined, from, to);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  let body: ReactNode;
  let chartToggle: ReactNode = null;
  if (horizon.kind === "ended") return null;
  if (horizon.kind === "later") {
    body = (
      <p className="flex items-center gap-2.5 text-body text-(--text-main)">
        <CalendarDays aria-hidden="true" className="size-5 text-(--text-muted)" />
        <span>Předpověď bude k dispozici od <b>{formatShortDayDate(horizon.availableFrom)}</b></span>
      </p>
    );
  } else if (locationProblem) {
    if (user?.role !== "admin") return null;
    body = (
      <p className="text-body text-(--text-main)">
        {locationProblem === "LOCATION_NOT_FOUND" ? "Obec chaty se nepodařilo najít." : "Chata nemá nastavenou obec."}{" "}
        <Link to="/admin/cabin" className="inline-flex min-h-12 items-center font-semibold text-primary underline">Nastavit lokalitu počasí</Link>
      </p>
    );
  } else if (isError) {
    body = <p className="text-body text-(--text-main)">Předpověď se teď nepodařilo načíst.</p>;
  } else if (stay && stay.days.length > 0) {
    // Vybraný den: první zobrazený den pobytu, dokud člen neťukne na jiný.
    const day = stay.days.find((d) => d.date === selectedDate) ?? stay.days[0];
    const length = dayLength(day.sunrise, day.sunset);
    const note = tentativeNote(stay.days);
    const grids = TILE_TIERS.map((tier) => tileGrid(stay.days.length, tier));
    // Přepínač grafu je v hlavičce vedle názvu pobytu, ať karta na Přehledu nemá řádek navíc (#356)
    if (collapsibleChart) chartToggle = (
      <button
        type="button" aria-expanded={chartOpen} aria-controls={chartOpen ? chartId : undefined} onClick={() => setChartOpen((open) => !open)}
        className="flex min-h-12 shrink-0 items-center gap-1.5 text-body font-bold text-primary focus-visible:outline-2 focus-visible:outline-primary"
      >
        Hodinový graf<ChevronDown aria-hidden="true" className={`size-4 transition-transform ${chartOpen ? "rotate-180" : ""}`} />
      </button>
    );
    body = (
      <>
        {/* Řádky stejně vysoké a bez osamělé dlaždice: sloupce a rozpětí počítá tileGrid pro každou šířku karty (#526) */}
        <ul
          className="grid auto-rows-fr grid-cols-(--cols-3) gap-2 @min-[30rem]:grid-cols-(--cols-5) @min-[42rem]:grid-cols-(--cols-7)"
          style={tierVars("cols", grids.map((g) => `repeat(${g.columns}, minmax(0, 1fr))`))}
        >
          {stay.days.map((d, i) => (
            <DayCell key={d.date} day={d} selected={d.date === day.date} spans={grids.map((g) => g.spans[i])} onSelect={() => { setSelectedDate(d.date); setChartOpen(true); }} />
          ))}
        </ul>
        <AnimatePresence initial={false}>
          {chartOpen && (
            <motion.div
              id={chartId} className="overflow-hidden"
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
            ><StayHourlyChart day={day} dayName={fullDayName(day.date)} /></motion.div>
          )}
        </AnimatePresence>
        {/* UV zelenou Jedle: na vnořeném poli --inset má 6,0 : 1 (#339, #429) */}
        <p className="flex flex-wrap items-center gap-3 rounded-xl bg-inset px-3 py-2 text-meta text-(--text-main)">
          {day.sunrise && <span className="inline-flex items-center gap-1.5"><Sunrise aria-hidden="true" className="size-4 text-(--status-warning)" /><span className="sr-only">Východ slunce</span>{day.sunrise}</span>}
          {day.sunset && <span className="inline-flex items-center gap-1.5"><Sunset aria-hidden="true" className="size-4 text-(--status-warning)" /><span className="sr-only">Západ slunce</span>{day.sunset}</span>}
          <span className="inline-flex items-center gap-1.5 font-bold text-primary"><Sun aria-hidden="true" className="size-4" />UV {day.uvIndex} {uvLabel(day.uvIndex)}</span>
          {length && <span className="ml-auto"><span className="text-(--text-muted)">Délka dne</span> {length}</span>}
          {/* Poznámka k orientačním dnům ve stejném poli jako slunce, ne na vlastním řádku (#356) */}
          {note && <span className="italic text-(--text-muted)">{note}</span>}
        </p>
        {stay.frost && <Alert icon={ThermometerSnowflake} day={stay.frost} text={`v noci mráz až ${deg(stay.frost.tempMin)} °C. Před odjezdem vypusť vodu.`} />}
        {stay.storm && <Alert icon={TriangleAlert} day={stay.storm} text="hrozí bouřka." />}
      </>
    );
  } else if (isLoading || cabin.isLoading) {
    body = <div className="skeleton h-28 rounded-xl" aria-busy="true" />;
  } else return null;

  return (
    <section aria-labelledby={headingId} className={`@container flex flex-col gap-3 p-4 ${frame}`} data-testid="stay-weather-card">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <div className="min-w-0">
          <h3 id={headingId} className="m-0 text-card-title text-(--text-main)">Počasí na pobyt</h3>
          {title && <p className="mt-1 text-body text-(--text-main)">{title}</p>}
        </div>
        {chartToggle}
      </div>
      {body}
    </section>
  );
}
