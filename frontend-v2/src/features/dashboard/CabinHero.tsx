/**
 * CabinHero — hlavička nahoře na Přehledu (návrh #1 díl 1 = A, osobnost H1a): jméno chaty
 * a jeden řádek kontextu (dnešní datum, počasí). S titulní fotkou chaty (#322, varianta B
 * pickeru D4) je to pruh s fotkou, tmavým přechodem a bílým textem; bez ní malý placeholder
 * v barvách lesa. Pod tím jen to, co by se nemělo minout: výstraha na bouřku v dalších dnech,
 * a správci odkaz do nastavení, když chata nemá lokalitu počasí. S vybranou obcí ještě tichý
 * odkaz „Akce v kraji“ na kalendář Kudy z nudy (#283).
 * Fotka je malé WebP (úzká varianta pro mobil), načítá se až po textu, rychlé i na 3G.
 */
import { Link } from "react-router-dom";
import { ExternalLink, Trees, TriangleAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import type { WeatherResult } from "@/api/dashboard";
import { getTodayFormatted } from "@/lib/dateUtils";
import { regionEventsUrl } from "@/lib/regionEvents";

interface CabinHeroProps {
  cabinName: string | undefined;
  weather: WeatherResult | undefined;
  /** Kraj vybrané obce (RÚIAN); bez obce chybí a odkaz na akce v kraji se neukáže. */
  region?: string | null;
  /** Titulní fotka z nastavení chaty: široká WebP varianta; úzká má stejné jméno s příponou `-sm`. */
  coverPhotoUrl?: string | null;
}

/** `srcset` z cesty široké varianty; cesta mimo dohodnutý tvar (`….webp`) jde bez úzké varianty. */
function coverSrcSet(url: string): string | undefined {
  return url.endsWith(".webp") ? `${url.slice(0, -".webp".length)}-sm.webp 750w, ${url} 1000w` : undefined;
}

export function CabinHero({ cabinName, weather, region, coverPhotoUrl }: CabinHeroProps) {
  const { isAdmin } = useAuth();
  const storm = weather && typeof weather === "object" && weather.stormAlert && weather.stormAlert.day !== "Dnes" ? weather.stormAlert : null;
  const missingLocation = weather === "EMPTY_LOCATION" || weather === "LOCATION_NOT_FOUND";
  const temp = weather && typeof weather === "object" ? Math.round(weather.temp) : null;
  const weatherLine = temp !== null && weather && typeof weather === "object"
    ? `${temp < 0 ? "−" : ""}${Math.abs(temp)} °C · ${weather.description}`
    : null;
  const eventsUrl = regionEventsUrl(region);
  const title = <h1 className="cabin-hero__name">{cabinName ?? "Přehled"}</h1>;
  const context = (
    <p className="cabin-hero__context">
      {getTodayFormatted()}
      {weatherLine && <> · {weatherLine}</>}
    </p>
  );
  const extras = (storm || eventsUrl || (missingLocation && isAdmin)) && (
    <>
      {storm && (
        <p className="cabin-hero__alert">
          <TriangleAlert className="w-4 h-4" aria-hidden="true" />
          {storm.day}: {storm.description}
        </p>
      )}
      {eventsUrl && (
        <a
          href={eventsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="cabin-hero__events"
          aria-label="Akce v kraji (otevře web Kudy z nudy)"
        >
          Akce v kraji
          <ExternalLink className="w-4 h-4" aria-hidden="true" />
        </a>
      )}
      {missingLocation && isAdmin && (
        <Link to="/admin/cabin" className="cabin-hero__link">Nastavit lokalitu počasí</Link>
      )}
    </>
  );
  return (
    <header className="cabin-hero-wrap" data-testid="cabin-hero">
      {coverPhotoUrl ? (
        <div className="glass-card cabin-hero cabin-hero--photo">
          <div className="cabin-hero__strip">
            {/* Dekorativní, rozměry pevné (nic neposkočí); do načtení je pruh tmavě zelený */}
            <img
              src={coverPhotoUrl}
              srcSet={coverSrcSet(coverPhotoUrl)}
              sizes="(max-width: 768px) 100vw, 1000px"
              width={1000}
              height={360}
              alt=""
              loading="lazy"
              decoding="async"
            />
            <div className="cabin-hero__strip-text">
              {title}
              {context}
            </div>
          </div>
          {extras && <div className="cabin-hero__extras">{extras}</div>}
        </div>
      ) : (
        <div className="glass-card cabin-hero">
          <div className="cabin-hero__media" data-testid="cabin-hero-media" aria-hidden="true">
            <Trees className="w-5 h-5" />
          </div>
          <div className="cabin-hero__text">
            {title}
            {context}
            {extras}
          </div>
        </div>
      )}
    </header>
  );
}
