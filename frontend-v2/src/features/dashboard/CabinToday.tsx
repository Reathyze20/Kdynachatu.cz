/**
 * CabinToday — dnešek chaty (#338, spec #337 D1): datum, počasí dnes, výstraha na bouřku v dalších
 * dnech, odkaz „Akce v kraji“ na Kudy z nudy (#283) a správci odkaz do nastavení, když chybí lokalita.
 * Na desktopu (`sidebar`) leží v hlavičce levého menu pod názvem chaty, na mobilu (`card`) je to
 * kompaktní karta nahoře na Přehledu se jménem chaty jako h1. Nahradila pruh CabinHero. Na Přehledu je to
 * hlavička (jméno, datum) a bloky Počasí a Akce v kraji v ní ukazuje jen podle `overviewBlocks` (#685).
 */
import { Link } from "react-router-dom";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { Card } from "@/components/shared/Card";
import { useAuth } from "@/context/AuthContext";
import { useCabinSettings } from "@/features/settings/hooks/useCabinSettings";
import { useTodayWeather } from "@/features/weather/hooks/useTodayWeather";
import { getTodayFormatted } from "@/lib/dateUtils";
import { regionEventsUrl } from "@/lib/regionEvents";

interface Props {
  variant: "sidebar" | "card";
  /** Blok Počasí: řádek počasí, výstraha a odkaz na nastavení lokality. */
  weather?: boolean;
  /** Blok Akce v kraji. */
  events?: boolean;
}

export function CabinToday({ variant, weather: showWeather = true, events: showEvents = true }: Props) {
  const { isAdmin } = useAuth();
  const cabin = useCabinSettings();
  const { data: fetched } = useTodayWeather(cabin.data ?? undefined);
  const weather = showWeather ? fetched : undefined;
  const storm = weather && typeof weather === "object" && weather.stormAlert && weather.stormAlert.day !== "Dnes" ? weather.stormAlert : null;
  const missingLocation = weather === "EMPTY_LOCATION" || weather === "LOCATION_NOT_FOUND";
  const temp = weather && typeof weather === "object" ? Math.round(weather.temp) : null;
  const weatherLine = temp !== null && weather && typeof weather === "object"
    ? `${temp < 0 ? "−" : ""}${Math.abs(temp)} °C · ${weather.description}`
    : null;
  const eventsUrl = showEvents ? regionEventsUrl(cabin.data?.municipalityRegion) : null;
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
    <Card className="cabin-today flex items-center gap-3 py-3 md:px-4 md:py-3" data-testid="cabin-today">
      <img src="/logo-icon.svg" alt="" className="nav-logo-icon" />
      {body}
    </Card>
  );
}
