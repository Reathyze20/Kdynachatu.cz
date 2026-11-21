/**
 * CabinHero — kompaktní pruh nahoře na Přehledu (návrh #1 díl 1 = A, osobnost H1a):
 * slot na fotku chaty (Midjourney drop-in, zatím placeholder), jméno chaty a jeden řádek
 * kontextu (dnešní datum, počasí). Žádná velká fotka, rychlé i na 3G.
 */
import { Trees } from "lucide-react";
import type { WeatherResult } from "@/api/dashboard";
import { getTodayFormatted } from "@/lib/dateUtils";
import { CABIN_HERO_IMAGE } from "./overviewAssets";

interface CabinHeroProps {
  cabinName: string | undefined;
  weather: WeatherResult | undefined;
}

export function CabinHero({ cabinName, weather }: CabinHeroProps) {
  const temp = weather && typeof weather === "object" ? Math.round(weather.temp) : null;
  const weatherLine = temp !== null && weather && typeof weather === "object"
    ? `${temp < 0 ? "−" : ""}${Math.abs(temp)} °C · ${weather.description}`
    : null;
  return (
    <header className="cabin-hero-wrap" data-testid="cabin-hero">
      <div className="glass-card cabin-hero">
        <div className="cabin-hero__media" data-testid="cabin-hero-media" aria-hidden="true">
          {CABIN_HERO_IMAGE ? <img src={CABIN_HERO_IMAGE} alt="" /> : <Trees className="w-5 h-5" />}
        </div>
        <div className="cabin-hero__text">
          <h1 className="cabin-hero__name">{cabinName ?? "Přehled"}</h1>
          <p className="cabin-hero__context">
            {getTodayFormatted()}
            {weatherLine && <> · {weatherLine}</>}
          </p>
        </div>
      </div>
    </header>
  );
}
