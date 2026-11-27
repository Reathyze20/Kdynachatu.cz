/**
 * nudges.ts — Nudge engine.
 *
 * A pure selector over data the dashboard already fetches. It produces timely,
 * actionable nudges only for whoever can act on them (rule E3, #274)
 * WITHOUT any new backend call. Each nudge carries an in-app `href` and, where
 * it's worth broadcasting, a `whatsapp` message for the "Zkopírovat pro WhatsApp"
 * bridge (the manual precursor to the Phase-3 bot).
 */
import { Car, Clock, Flame, Luggage, ShoppingCart, Star, type LucideIcon } from "lucide-react";
import { daysUntil, getLocalTodayIso } from "@/lib/dateUtils";
import { gasLine } from "@/lib/gasLevel";
import type { DashboardReservationsData, DashboardShoppingData, ReservationParticipantLite } from "@/api/dashboard";

export type NudgeTone = "info" | "action" | "warn";

export interface Nudge {
  /** Stable id; changes when the underlying condition materially changes so a
   *  dismissed nudge reappears (e.g. long-empty re-surfaces weekly). */
  id: string;
  tone: NudgeTone;
  /** UI ikona z lucide-react (ne emoji, #165). */
  icon: LucideIcon;
  title: string;
  detail?: string;
  /** In-app navigation target. */
  href: string;
  /** Label of the button leading to `href`; without it no button is shown. */
  action?: string;
  /** Optional message to copy into the family chat. Presence enables the button. */
  whatsapp?: string;
}

interface BuildNudgesInput {
  reservations?: DashboardReservationsData;
  shopping?: DashboardShoppingData;
  /** Přihlášený člen; upomínka na odjezd patří jen tomu, kdo dnes odjíždí (#255). */
  myUsername?: string | null;
  /** A guest gets only the prompt for their own departure (#274). */
  isGuest?: boolean;
  /** My departure handover waits in the offline queue for signal (#276). */
  departurePending?: boolean;
}

type Stay = { username: string; participants?: ReservationParticipantLite[] };

/** Organizer or co-traveller; usernames are unique across accounts. */
const isMine = (stay: Stay | null | undefined, myUsername?: string | null): boolean =>
  !!stay && !!myUsername && (stay.username === myUsername || !!stay.participants?.some((p) => p.username === myUsername));

/** My stay ending today with the handover not filled yet, else `null` (#255, #274). */
export function myDepartureId(reservations: DashboardReservationsData | undefined, myUsername?: string | null): string | null {
  if (reservations?.departingToday && reservations.departingReservationId) return reservations.departingReservationId;
  const active = reservations?.activeReservation;
  if (active && isMine(active, myUsername) && active.to === getLocalTodayIso() && !active.isCheckoutCompleted) return active.id;
  return null;
}

export function buildNudges({ reservations, shopping, myUsername, isGuest, departurePending }: BuildNudgesInput): Nudge[] {
  const nudges: Nudge[] = [];

  // 1. Departure today — prompt the leaving occupant (and only them) to fill the handover.
  // Until the handover screen exists (#220), the button opens the departure form in the stay detail.
  const departureId = myDepartureId(reservations, myUsername);
  if (departureId) {
    nudges.push(departurePending
      ? { id: `departure-pending-${departureId}`, tone: "info", icon: Clock, title: "Předávka chaty je vyplněná", detail: "Odešle se, jakmile bude signál.", href: "/dashboard" }
      : {
          id: `departure-${departureId}`,
          tone: "action",
          icon: Luggage,
          title: "Dnes odjíždíš.",
          detail: "Vyplň předávku chaty pro toho, kdo přijede po tobě.",
          href: `/reservations?pobyt=${departureId}`,
          action: "Vyplnit předávku chaty",
        });
  }
  if (isGuest) return nudges;

  const lowItems = shopping?.essentialWarning?.items?.map((i) => i.name) ?? [];

  // 2. My stay starts tomorrow — nudge to check the briefing + bring what's low.
  const myNext = reservations?.myNextReservation;
  if (myNext && daysUntil(myNext.from) === 1) {
    const lowPart = lowItems.length ? ` Dochází: ${lowItems.join(", ")}.` : "";
    nudges.push({
      id: `arrival-${myNext.from}`,
      tone: "info",
      icon: Car,
      title: "Zítra jedeš na chatu",
      detail: `Mrkni na stav chaty od minule.${lowPart}`,
      href: "/dashboard",
      whatsapp: lowItems.length
        ? `🚗 Zítra jedu na chatu. Přivezu: ${lowItems.join(", ")}.`
        : "🚗 Zítra jedu na chatu.",
    });
  }

  // 3. Essential supplies running out.
  const low = shopping?.essentialWarning;
  if (low && low.count > 0) {
    nudges.push({
      id: `supply-${lowItems.slice().sort().join("|")}`,
      tone: "warn",
      icon: ShoppingCart,
      title: `Na chatě ${low.count === 1 ? "dochází položka" : "docházejí položky"}`,
      detail: lowItems.join(", "),
      href: "/shopping?view=pantry",
      whatsapp: `🛒 Na chatě dochází: ${lowItems.join(", ")}. Kdo pojede příště, doplní?`,
    });
  }

  // Gas and Došlo ★ go only to the next arrival; everyone else sees them in Důležité (#274).
  const active = reservations?.activeReservation;
  const next = reservations?.upcomingReservations.find((r) => r.status === "primary" && r.id !== active?.id);
  if (!isMine(next, myUsername)) return nudges;

  // 3b. Gas low/empty from the last checkout state.
  const gas = reservations?.lastStay?.checkoutState?.gas;
  const gasTitle = gas === "low" || gas === "empty" ? gasLine(gas) : null;
  if (gasTitle) {
    nudges.push({
      id: `gas-${gas}-${reservations?.lastStay?.to ?? ""}`,
      tone: "warn",
      icon: Flame,
      title: gasTitle,
      detail: "Jedeš příště, přivez novou.",
      href: "/shopping?view=pantry",
      action: "Otevřít Zásoby",
      whatsapp: `🔥 ${gasTitle}. Přivezu novou.`,
    });
  }

  // 3c. Essential (★) supplies that ran out.
  const starred = (shopping?.attention ?? []).filter((i) => i.isEmpty && i.isEssential).map((i) => i.name);
  if (starred.length > 0) {
    nudges.push({
      id: `starred-${starred.slice().sort().join("|")}`,
      tone: "warn",
      icon: Star,
      title: `Na chatě došlo: ${starred.join(", ")}`,
      detail: "Jedeš příště, přivez to.",
      href: "/shopping?view=pantry",
      action: "Otevřít Zásoby",
      whatsapp: `🛒 Na chatě došlo: ${starred.join(", ")}. Přivezu to.`,
    });
  }

  return nudges;
}
