/**
 * NextArrivalCard — „Další příjezd“ v bočním panelu Přehledu (#172, lehký kontext).
 * Další pevný pobyt po tom aktuálním; vlastní pobyt jako „Ty“. Ukazuje i to, co řetězec turnusu
 * neřekne: účel, počet nocí a kdo jede s ním. Když můj nejbližší pobyt
 * není hned další, přidá řádek „Tvůj pobyt…“. Jen pevné pobyty. Bez obojího se karta nevykreslí.
 */
import { useId } from "react";
import type { DashboardReservationsData } from "@/api/dashboard";
import { AnimalAvatar } from "@/components/shared/AnimalAvatar";
import { useAuth } from "@/context/AuthContext";
import { daysUntil, formatDateRange, nightsBetween, nightsLabel } from "@/lib/dateUtils";
import { ParticipantStack } from "./ParticipantStack";
import { pluralize } from "@/lib/utils";

function inDaysLabel(from: string): string {
  const days = daysUntil(from);
  if (days === 0) return "dnes";
  if (days === 1) return "zítra";
  return `za ${days} ${pluralize(days, "den", "dny", "dní")}`;
}

export function NextArrivalCard({ data }: { data: DashboardReservationsData }) {
  const headingId = useId();
  const { user } = useAuth();
  const active = data.activeReservation;
  const firmUpcoming = data.upcomingReservations.filter((r) => r.status === "primary" && !!r.from && !!r.to);
  const next = firmUpcoming.find((r) => r.id !== active?.id) ?? null;
  // `myNextReservation` z API nefiltruje stav; ukáže se jen můj pevný pobyt.
  const mine = data.myNextReservation;
  const isMine = (r: { from: string; to: string } | null | undefined) => !!r && !!mine && r.from === mine.from && r.to === mine.to;
  const myNext = firmUpcoming.find(isMine) ?? null;
  const showMyNext = !!myNext && !isMine(next) && !isMine(active);

  if (!next && !showMyNext) return null;
  const nights = next ? nightsBetween(next.from, next.to) : 0;

  return (
    <section className="glass-card next-arrival-card" aria-labelledby={headingId} data-testid="dashboard-next-arrival">
      <h2 id={headingId} className="dashboard-card-header-title">Další příjezd</h2>
      {next && (
        <div className="status-next-block">
          <div className="status-next-avatar">
            <AnimalAvatar icon={next.userAnimalIcon} username={next.username} color={next.userColor || undefined} size={36} />
          </div>
          <div className="status-next-info">
            <div className="status-next-name">{next.username === user?.username ? "Ty" : next.username}</div>
            <div className="status-next-date">{formatDateRange(next.from, next.to)}</div>
          </div>
          <span className="status-next-chip">{inDaysLabel(next.from)}</span>
        </div>
      )}
      {next && (
        <p className="next-arrival-meta">
          {next.purpose}
          {nights > 0 && ` · ${nights} ${nightsLabel(nights)}`}
        </p>
      )}
      {next && <ParticipantStack participants={next.participants} />}
      {showMyNext && myNext && (
        <div className="next-arrival-mine">
          <span className="status-next-label-personal">Tvůj pobyt {inDaysLabel(myNext.from)}</span>
          <span className="status-next-date">{formatDateRange(myNext.from, myNext.to)}</span>
        </div>
      )}
    </section>
  );
}
