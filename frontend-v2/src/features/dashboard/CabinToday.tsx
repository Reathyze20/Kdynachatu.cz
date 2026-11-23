/**
 * CabinToday — dnešek chaty (#338, spec #337 D1): datum, počasí dnes, výstraha na bouřku v dalších
 * dnech, odkaz „Akce v kraji“ na Kudy z nudy (#283) a správci odkaz do nastavení, když chybí lokalita.
 * Na desktopu (`sidebar`) leží v hlavičce levého menu pod názvem chaty, na mobilu (`card`) je to
 * kompaktní karta nahoře na Přehledu se jménem chaty jako h1. Nahradila pruh CabinHero.
 */
import { Link } from "react-router-dom";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCabinSettings } from "@/features/settings/hooks/useCabinSettings";
import { useTodayWeather } from "@/features/weather/hooks/useTodayWeather";
import { getTodayFormatted } from "@/lib/dateUtils";
import { regionEventsUrl } from "@/lib/regionEvents";

export function CabinToday({ variant }: { variant: "sidebar" | "card" }) {
  const { isAdmin } = useAuth();
  const cabin = useCabinSettings();
  const { data: weather } = useTodayWeather(cabin.data ?? undefined);
  const storm = weather && typeof weather === "object" && weather.stormAlert && weather.stormAlert.day !== "Dnes" ? weather.stormAlert : null;
  const missingLocation = weather === "EMPTY_LOCATION" || weather === "LOCATION_NOT_FOUND";
  const temp = weather && typeof weather === "object" ? Math.round(weather.temp) : null;
  const weatherLine = temp !== null && weather && typeof weather === "object"
    ? `${temp < 0 ? "−" : ""}${Math.abs(temp)} °C · ${weather.description}`
    : null;
  const eventsUrl = regionEventsUrl(cabin.data?.municipalityRegion);
  const sidebar = variant === "sidebar";

  const body = (
    <div className="cabin-today__text">
      {!sidebar && <h1 className="cabin-today__name">{cabin.data?.name ?? "Přehled"}</h1>}
      <p className="cabin-today__context">
        {sidebar ? <b>{getTodayFormatted()}</b> : getTodayFormatted()}
        {weatherLine && <>{sidebar ? <br /> : " · "}{weatherLine}</>}
      </p>
      {storm && (
        <p className="cabin-today__alert">
          <TriangleAlert className="w-4 h-4" aria-hidden="true" />
          {storm.day}: {storm.description}
        </p>
      )}
      {eventsUrl && (
        <a
          href={eventsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="cabin-today__events"
          aria-label="Akce v kraji (otevře web Kudy z nudy)"
        >
          Akce v kraji
          <ExternalLink className="w-4 h-4" aria-hidden="true" />
        </a>
      )}
      {missingLocation && isAdmin && (
        <Link to="/admin/cabin" className="cabin-today__link">Nastavit lokalitu počasí</Link>
      )}
    </div>
  );

  return sidebar ? (
    <div className="cabin-today cabin-today--sidebar" data-testid="cabin-today">{body}</div>
  ) : (
    <header className="glass-card cabin-today cabin-today--card" data-testid="cabin-today">
      <img src="/logo-icon.svg" alt="" className="nav-logo-icon" />
      {body}
    </header>
  );
}
