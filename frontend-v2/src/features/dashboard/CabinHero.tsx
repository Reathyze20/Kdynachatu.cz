/**
 * CabinHero — kompaktní pruh nahoře na Přehledu (návrh #1 díl 1 = A, osobnost H1a):
 * slot na fotku chaty (Midjourney drop-in, zatím placeholder), jméno chaty a jeden řádek
 * kontextu (dnešní datum, počasí). Pod ním jen to, co by se nemělo minout: výstraha na bouřku
 * v dalších dnech, a správci odkaz do nastavení, když chata nemá lokalitu počasí.
 * Žádná velká fotka, rychlé i na 3G.
 */
import { Link } from "react-router-dom";
import { Trees, TriangleAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import type { WeatherResult } from "@/api/dashboard";
import { getTodayFormatted } from "@/lib/dateUtils";
import { CABIN_HERO_IMAGE } from "./overviewAssets";

interface CabinHeroProps {
  cabinName: string | undefined;
  weather: WeatherResult | undefined;
}

export function CabinHero({ cabinName, weather }: CabinHeroProps) {
  const { isAdmin } = useAuth();
  const storm = weather && typeof weather === "object" && weather.stormAlert && weather.stormAlert.day !== "Dnes" ? weather.stormAlert : null;
  const missingLocation = weather === "EMPTY_LOCATION" || weather === "LOCATION_NOT_FOUND";
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
          {storm && (
            <p className="cabin-hero__alert">
              <TriangleAlert className="w-4 h-4" aria-hidden="true" />
              {storm.day}: {storm.description}
            </p>
          )}
          {missingLocation && isAdmin && (
            <Link to="/admin/cabin" className="cabin-hero__link">Nastavit lokalitu počasí</Link>
          )}
        </div>
      </div>
    </header>
  );
}
