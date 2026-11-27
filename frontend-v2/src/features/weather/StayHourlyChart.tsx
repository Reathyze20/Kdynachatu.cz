/** Hodinový graf vybraného dne pobytu (#325, vizuál docs/design/07-teplo-atomy.html díl 2, varianta A): záložky Srážky / Vítr / Teplota, sloupce 8–20 h po dvou hodinách. */
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { CloudRain, Thermometer, Wind, type LucideIcon } from "lucide-react";
import type { ForecastHour, StayForecastDay } from "@/api/stayWeather";

type ChartTab = "rain" | "wind" | "temp";

const SHOWN_HOURS = Array.from({ length: 7 }, (_, i) => `${String(8 + 2 * i).padStart(2, "0")}:00`);
/** Pod 15 % (jako stará karta) se srážky neberou jako „bude pršet“. */
const RAIN_MIN = 15;

const deg = (t: number) => `${t < 0 ? "−" : ""}${Math.abs(t)}`;
const hourOf = (time: string) => Number(time.slice(0, 2));
/** Na úzké kartě (320 px) se „:00“ a „ %“ u sloupců nevejdou, schovají se podle šířky grafu. */
const hideWhenNarrow = "@max-[280px]:hidden";

interface Series {
  id: ChartTab; label: string; icon: LucideIcon;
  tone: string; fill: string; peakFill: string; // barva ikony záložky a sloupců; text je inkoust, barva nenese význam sama
  value: (h: ForecastHour) => number;
  format: (v: number) => ReactNode;
  height: (v: number, min: number, max: number) => number; // výška sloupce v %
  minPeak?: number; // pod touto hodnotou se vrchol nezvýrazní a kontext řekne „bez výrazných …“
  /** `peak` = hodina vrcholu „14:00“, nebo null, když je maximum pod `minPeak`. `day` = celý den (minimum jako na dlaždici, #526). */
  context: (max: number, min: number, peak: string | null, day: StayForecastDay) => ReactNode;
}

const SERIES: Series[] = [
  {
    id: "rain", label: "Srážky", icon: CloudRain, tone: "text-(--status-info)", fill: "bg-(--status-info)/30", peakFill: "bg-(--status-info)",
    value: (h) => h.precipProbability, format: (v) => <>{v}<span className={hideWhenNarrow}> %</span></>, height: (v) => v, minPeak: RAIN_MIN,
    context: (max, _min, peak) => peak === null
      ? <>bez výrazných srážek (nejvíc {max} %)</>
      : <>nejvíc srážek <b>{max} %</b> kolem <b>{peak}</b></>,
  },
  {
    id: "wind", label: "Vítr", icon: Wind, tone: "text-(--text-muted)", fill: "bg-(--text-muted)/30", peakFill: "bg-(--text-muted)",
    value: (h) => h.windSpeed, format: (v) => String(v), height: (v, _min, max) => Math.max(4, (v / Math.max(30, max)) * 100),
    context: (max, _min, peak) => <>vítr nejvíc <b>{max} km/h</b> kolem <b>{peak}</b></>,
  },
  {
    id: "temp", label: "Teplota", icon: Thermometer, tone: "text-(--status-warning)", fill: "bg-(--status-warning)/30", peakFill: "bg-(--status-warning)",
    value: (h) => h.temp, format: (v) => `${deg(v)}°`, height: (v, min, max) => 20 + ((v - min) / (max - min || 1)) * 80,
    // Minimum za celý den včetně noci, ne jen za hodiny 8–20, ať souhlasí s dlaždicí dne (#526).
    // Denní minimum Open-Meteo je minimum ze všech hodin, `Math.min` jen pojistí data, kde by hodina byla níž.
    context: (max, min, peak, day) => <>maximum <b>{deg(max)}°</b> kolem <b>{peak}</b>, minimum {deg(Math.min(min, Math.round(day.tempMin)))}°</>,
  },
];

const shownHours = (day: StayForecastDay) => day.hours.filter((h) => SHOWN_HOURS.includes(h.time));

/** Výchozí záložka: Srážky, když má ten den pršet, jinak Teplota. */
function defaultTab(day: StayForecastDay): ChartTab {
  return shownHours(day).some((h) => h.precipProbability >= RAIN_MIN) ? "rain" : "temp";
}

/** `dayName` = celý název dne („Pátek“) pro větu nad grafem. */
export function StayHourlyChart({ day, dayName }: { day: StayForecastDay; dayName: string }) {
  const id = useId();
  const [tab, setTab] = useState<ChartTab>(() => defaultTab(day));
  const hours = shownHours(day);
  if (hours.length === 0) return null;

  const series = SERIES.find((s) => s.id === tab) ?? SERIES[0];
  const values = hours.map(series.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const peakIdx = max < (series.minPeak ?? -Infinity) ? -1 : values.indexOf(max);

  // Šipky vlevo/vpravo přepínají záložky (vzor ARIA tabs), Tab skočí rovnou do panelu.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = SERIES[(SERIES.indexOf(series) + step + SERIES.length) % SERIES.length];
    setTab(next.id);
    document.getElementById(`${id}-${next.id}`)?.focus();
  };

  return (
    <div className="@container flex flex-col gap-2 border-t border-rule-soft pt-2.5">
      <div role="tablist" aria-label="Řada hodinového grafu" onKeyDown={onKeyDown} className="flex gap-2 rounded-xl bg-inset p-[3px]">
        {SERIES.map((s) => (
          <button
            key={s.id} id={`${id}-${s.id}`} type="button" role="tab" aria-selected={s.id === tab} aria-controls={`${id}-panel`}
            tabIndex={s.id === tab ? 0 : -1} onClick={() => setTab(s.id)}
            className={`flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-label font-semibold focus-visible:outline-2 focus-visible:outline-primary ${s.id === tab ? "bg-sheet text-(--text-main) shadow-sm" : "text-(--text-muted)"}`}
          >
            <s.icon aria-hidden="true" className={`size-4 ${s.tone}`} />{s.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} tabIndex={0} className="flex flex-col gap-2">
        <p className="text-meta text-(--text-muted) [&_b]:text-(--text-main)">{dayName} · {series.context(max, min, peakIdx < 0 ? null : `${hourOf(hours[peakIdx].time)}:00`, day)}</p>
        <div aria-hidden="true" className="flex items-end gap-0.5 @min-[280px]:gap-1">
          {hours.map((h, i) => (
            <div key={h.time} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className={`text-meta leading-none whitespace-nowrap ${i === peakIdx ? "font-bold text-(--text-main)" : "font-semibold text-(--text-muted)"}`}>{series.format(values[i])}</span>
              <div className="relative h-16 w-full overflow-hidden rounded-md bg-inset">
                <div className={`absolute inset-x-0 bottom-0 rounded-t-md ${i === peakIdx ? series.peakFill : series.fill}`} style={{ height: `${series.height(values[i], min, max)}%` }} />
              </div>
              <span className={`text-meta leading-none tracking-tight ${i === peakIdx ? "font-bold text-(--text-main)" : "text-(--text-muted)"}`}>{hourOf(h.time)}<span className={hideWhenNarrow}>:00</span></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
