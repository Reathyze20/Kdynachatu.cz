/**
 * Stav scény chaty (#563, spec #558). Čistá funkce nad daty, která Přehled už má: pobyty z
 * `/dashboard/reservations`, zazimování z nastavení chaty a dnešní počasí obce chaty (#564). Hostovi backend posílá jen jeho pobyt,
 * scéna tedy cizí obsazenost neukáže. Jak stav vypadá, řeší `CabinScene` a sprity v `cabinSceneSprites`.
 */
import type { DashboardReservationsData, WeatherData, WeatherResult } from "@/api/dashboard";
import { toIsoDate } from "@/lib/dateUtils";

/** V den odjezdu je odjíždějící po této hodině pryč, stejně jako v kartě „Na chatě teď“. */
export const DEPARTURE_HOUR = 14;
/** Den a noc podle místního času zařízení, když chybí východ a západ slunce z počasí (#564). */
const NIGHT_FROM_HOUR = 20;
const NIGHT_UNTIL_HOUR = 6;

export type MascotPose = "sleep" | "peek" | "nibble" | "hibernate" | "shelter";
/** Srážky kromě sněhu (#609): mrholení WMO 51–57, déšť 61–67 a 80–82 (i mrznoucí déšť a přeháňky), bouřka 95–99. */
export type Precipitation = "none" | "drizzle" | "rain" | "storm";
/** Vítr z aktuální rychlosti (#610): od `WIND_KMH` se stáčí kouř, od `STRONG_WIND_KMH` padají srážky šikmo. Směr je
 * ve scéně pevně zleva doprava, skutečný směr větru se nestahuje. */
export type Wind = "none" | "wind" | "strong";
/** Soumrak (#610) od `DUSK_MIN` minut před západem slunce do západu, svítání od východu `DAWN_MIN` minut. */
export type Twilight = "none" | "dusk" | "dawn";
/** Roční období podle data zařízení (#656): jaro 1. 3.–31. 5., léto 1. 6.–31. 8., podzim 1. 9.–15. 11., potom do konce
 * února holá krajina. Nečte počasí, takže funguje i bez obce chaty. */
export type Season = "spring" | "summer" | "autumn" | "bare";
/** Pozadí krajiny: období, nebo sníh, když leží (sněhová pokrývka má přednost). */
export type Backdrop = Season | "snow";
const DUSK_MIN = 45;
const DAWN_MIN = 30;
export const WIND_KMH = 20;
export const STRONG_WIND_KMH = 40;

export interface CabinSceneState {
  occupied: boolean;
  arriving: boolean;
  departing: boolean;
  /** Auto stojí u chaty: celý den příjezdu, v den odjezdu bez příjezdu jen do `DEPARTURE_HOUR` (#579). */
  carParked: boolean;
  winterized: boolean;
  night: boolean;
  /** Dnes v obci chaty sněží: WMO 71–77 (sníh, zrna) a 85–86 (sněhové přeháňky). */
  snowing: boolean;
  /** Leží sníh: aktuální sněhová pokrývka je větší než nula. */
  snowCover: boolean;
  /** Mrzne: aktuální teplota ≤ 0 °C. */
  frost: boolean;
  precipitation: Precipitation;
  /** Mlha: WMO 45 a 48 (#610). */
  fog: boolean;
  /** Zataženo: při mrholení, dešti, bouřce a mlze. Ve dne šedý závoj přes oblohu, v noci bez měsíce a hvězd. */
  overcast: boolean;
  wind: Wind;
  season: Season;
  /** Jen když jsou známé oba časy slunce a není zataženo (srážky, sněžení, mlha); zazimování ho neruší. */
  twilight: Twilight;
}

const isSnowCode = (code: number) => (code >= 71 && code <= 77) || code === 85 || code === 86;
function precipitationOf(code: number): Precipitation {
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  return code >= 95 && code <= 99 ? "storm" : "none";
}
const minutesOf = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

function seasonOf(d: Date): Season {
  const [month, day] = [d.getMonth() + 1, d.getDate()];
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  return month === 9 || month === 10 || (month === 11 && day <= 15) ? "autumn" : "bare";
}

const windOf = (kmh: number): Wind => (kmh >= STRONG_WIND_KMH ? "strong" : kmh >= WIND_KMH ? "wind" : "none");

/** Soumrak nebo svítání podle hodin „HH:MM“; bez obou časů slunce žádné. */
function twilightOf(clock: string, { sunriseTime, sunsetTime }: WeatherData): Twilight {
  if (!sunriseTime || !sunsetTime) return "none";
  const [now, rise, set] = [minutesOf(clock), minutesOf(sunriseTime), minutesOf(sunsetTime)];
  if (set - DUSK_MIN <= now && now < set) return "dusk";
  return rise <= now && now < rise + DAWN_MIN ? "dawn" : "none";
}

/** `weather` je výsledek sdíleného dotazu na dnešní počasí; bez obce, při chybě nebo před načtením je scéna bez počasí. */
export function deriveCabinScene(data: DashboardReservationsData, winterized: boolean, now: Date, weather?: WeatherResult): CabinSceneState {
  const today = toIsoDate(now);
  const hour = now.getHours();
  const stays = [...(data.activeReservation ? [data.activeReservation] : []), ...data.upcomingReservations.filter((s) => s.status === "primary")];
  const todays = stays.filter((s) => s.from <= today && today <= s.to);
  // „Teď“ jako v kartě (buildTurnusChain): ve střídací den ten, kdo přijel dřív, po 14:00 už pryč.
  const current = [...todays].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))[0];
  const present = !!current && !(current.to === today && hour >= DEPARTURE_HOUR);
  // Zazimování přebíjí obsazenost i auto (souhlasí s bannerem „Chata je zazimovaná“).
  const arriving = !winterized && todays.some((s) => s.from === today);
  const departing = !winterized && todays.some((s) => s.to === today);
  const forecast = weather && typeof weather === "object" ? weather : null;
  // Východ a západ slunce jsou „HH:MM“ v čase obce chaty; zařízení rodiny je ve stejném pásmu.
  const clock = hhmm(now);
  const night = forecast?.sunriseTime && forecast.sunsetTime
    ? clock < forecast.sunriseTime || clock >= forecast.sunsetTime
    : hour >= NIGHT_FROM_HOUR || hour < NIGHT_UNTIL_HOUR;
  const precipitation = forecast ? precipitationOf(forecast.weatherCode) : "none";
  const fog = !!forecast && (forecast.weatherCode === 45 || forecast.weatherCode === 48);
  const snowing = !!forecast && isSnowCode(forecast.weatherCode);
  const overcast = precipitation !== "none" || fog;
  const twilight = forecast && !overcast && !snowing ? twilightOf(clock, forecast) : "none";
  return {
    occupied: !winterized && present,
    arriving,
    departing,
    carParked: arriving || (departing && hour < DEPARTURE_HOUR),
    winterized,
    night,
    // Počasí se kreslí přes všechny stavy obsazenosti včetně zazimování.
    snowing,
    snowCover: !!forecast && forecast.snowDepth > 0,
    frost: !!forecast && forecast.temp <= 0,
    precipitation,
    fog,
    overcast,
    twilight,
    season: seasonOf(now),
    wind: forecast ? windOf(forecast.windSpeed) : "none",
  };
}

export const sceneBackdrop = (s: CabinSceneState): Backdrop => (s.snowCover ? "snow" : s.season);

/** Kouř z komína (jen u obsazené chaty) se ve větru stáčí po větru. */
export const smokeCurls = (s: CabinSceneState) => s.occupied && s.wind !== "none";
/** V silném větru padají kapky i vločky šikmo. */
export const fallsSlanted = (s: CabinSceneState) => s.wind === "strong" && (s.snowing || s.precipitation !== "none");

/** Vítr je vidět jen na kouři a na srážkách; u prázdné chaty bez srážek pod silným větrem se nepopisuje. */
function windText(s: CabinSceneState): string {
  const seen = [
    smokeCurls(s) ? "kouř se stáčí" : "",
    !fallsSlanted(s) ? "" : s.snowing ? "vločky padají šikmo" : "kapky padají šikmo",
  ].filter(Boolean);
  return seen.length ? `Fouká ${s.wind === "strong" ? "silný " : ""}vítr, ${seen.join(" a ")}.` : "";
}

/** Plch na chatě bydlí pod střechou a chová se jako plch: přes zimu (zazimovaná chata nebo sníh) spí schovaný, v noci
 * slézá dolů a u chaty hryže oříšek, ve dne spí na střeše. Na auto je zvědavý i v noci a i v dešti: vykukuje zpoza
 * hřebene střechy, stejně jako ve dne, když je někdo na chatě. Jinak se před deštěm schová pod střechu (#609). */
export function mascotPose(s: CabinSceneState): MascotPose {
  if (s.winterized || s.snowCover) return "hibernate";
  if (s.carParked) return "peek";
  if (s.precipitation !== "none") return "shelter";
  if (s.night) return "nibble";
  return s.occupied ? "peek" : "sleep";
}

const POSE_TEXT: Record<MascotPose, string> = {
  sleep: "Plch spí stočený na střeše.",
  peek: "Plch vykukuje zpoza střechy.",
  nibble: "Plch v noci hryže u chaty oříšek.",
  hibernate: "Plch přes zimu spí schovaný pod střechou.",
  shelter: "Plch se schoval před deštěm pod střechu.",
};

/** Věta k pozadí krajiny; holá krajina žádnou nemá, sníh popisuje věta „Leží sníh“. */
const BACKDROP_TEXT: Record<Backdrop, string> = {
  spring: "Je jaro, louka se zelená.",
  summer: "Je léto, louka je sytě zelená.",
  autumn: "Je podzim, louka zlátne a břízy žloutnou.",
  bare: "",
  snow: "",
};
const PRECIPITATION_TEXT: Record<Precipitation, string> = { none: "", drizzle: "Mrholí.", rain: "Prší.", storm: "Bouřka." };
const TWILIGHT_TEXT: Record<Twilight, string> = { none: "", dusk: "Zapadá slunce.", dawn: "Svítá." };

/** Přístupný název scény: každá část odpovídá jedné vrstvě obrázku, nic nepřebíjí jen v textu. */
export function cabinSceneLabel(s: CabinSceneState): string {
  const parts = [
    s.winterized ? "Chata je zazimovaná, okenice jsou zavřené." : "",
    s.occupied ? "Někdo je na chatě, z komína jde kouř a svítí okno." : s.winterized ? "" : "Chata je prázdná.",
    !s.carParked ? "" :
      s.arriving && s.departing ? "Dnes se na chatě střídají, u chaty stojí auto." :
      s.arriving ? "Dnes někdo přijíždí, u chaty stojí auto." : "Dnes někdo odjíždí, u chaty stojí auto.",
    POSE_TEXT[mascotPose(s)],
    !s.frost ? "" : "Mrzne a stromy pokrývá jinovatka.",
    s.snowCover ? "Leží sníh, střecha je bílá." : "",
    BACKDROP_TEXT[sceneBackdrop(s)],
    // Při sněžení, srážkách a mlze je zataženo: noc bez hvězd.
    !s.night ? "" : s.snowing || s.overcast ? "Je noc." : "Je noc, na nebi svítí hvězdy.",
    TWILIGHT_TEXT[s.twilight],
    s.fog ? "Je mlha." : "",
    s.snowing ? "Sněží." : "",
    PRECIPITATION_TEXT[s.precipitation],
    windText(s),
  ];
  return `Scéna chaty. ${parts.filter(Boolean).join(" ")}`;
}
