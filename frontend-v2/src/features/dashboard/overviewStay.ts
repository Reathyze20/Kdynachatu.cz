/** Který pobyt ukáže karta Počasí na pobyt na Přehledu (#326). Čisté funkce, data z dotazu Přehledu na pobyty. */
import type { ActiveReservation, UpcomingReservation } from "@/api/dashboard";
import { addDays } from "@/api/stayWeather";
import { formatShortDayDate } from "@/lib/dateUtils";

/** Karta se ukáže od 7 dní před příjezdem do dne odjezdu. */
const DAYS_BEFORE_ARRIVAL = 7;

type OverviewStay = ActiveReservation | UpcomingReservation;
export interface OverviewStayPick { stay: OverviewStay; mine: boolean }

/** Vlastní pobyt (autor nebo účastník) má přednost, jinak probíhající před příštím, nic v okně → null. */
export function pickOverviewStay(
  active: ActiveReservation | null,
  upcoming: UpcomingReservation[],
  me: { userId: string; username: string } | null | undefined,
  today: string,
): OverviewStayPick | null {
  const isMine = (s: OverviewStay) =>
    !!me && (("userId" in s ? s.userId === me.userId : s.username === me.username) || !!s.participants?.some((p) => p.userId === me.userId));
  const rank = (p: OverviewStayPick) => `${p.mine ? 0 : 1}${p.stay.from <= today ? 0 : 1}${p.stay.from}`;
  const stays: OverviewStay[] = [...(active ? [active] : []), ...upcoming.filter((s) => s.status === "primary" && s.id !== active?.id)];
  const candidates = stays
    .filter((s) => addDays(s.from, -DAYS_BEFORE_ARRIVAL) <= today && today <= s.to)
    .map((stay) => ({ stay, mine: isMine(stay) }))
    .sort((a, b) => rank(a).localeCompare(rank(b)));
  return candidates[0] ?? null;
}

/** „Tvůj pobyt · pá 7. – ne 9. 6.“ nebo „Pobyt: Petr · so 29. 6. – po 1. 7.“ */
export function overviewStayTitle({ stay, mine }: OverviewStayPick): string {
  const { from, to } = stay;
  const [weekday, day] = formatShortDayDate(from).split(" ");
  const start = from.slice(0, 7) === to.slice(0, 7) ? `${weekday} ${day}` : formatShortDayDate(from);
  const range = from === to ? formatShortDayDate(to) : `${start} – ${formatShortDayDate(to)}`;
  return `${mine ? "Tvůj pobyt" : `Pobyt: ${stay.username}`} · ${range}`;
}
