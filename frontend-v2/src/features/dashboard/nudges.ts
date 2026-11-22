/**
 * nudges.ts — Nudge engine.
 *
 * A pure selector over data the dashboard already fetches. It produces timely,
 * actionable nudges (departure prompt, upcoming stay, low supplies, long-empty)
 * WITHOUT any new backend call. Each nudge carries an in-app `href` and, where
 * it's worth broadcasting, a `whatsapp` message for the "Kopírovat pro WhatsApp"
 * bridge (the manual precursor to the Phase-3 bot).
 */
import { Car, Flame, House, Luggage, ShoppingCart, type LucideIcon } from "lucide-react";
import { daysUntil, getLocalTodayIso } from "@/lib/dateUtils";
import { gasLine } from "@/lib/gasLevel";
import type { DashboardReservationsData, DashboardShoppingData } from "@/api/dashboard";

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
  /** Optional message to copy into the family chat. Presence enables the button. */
  whatsapp?: string;
}

interface BuildNudgesInput {
  reservations?: DashboardReservationsData;
  shopping?: DashboardShoppingData;
}

export function buildNudges({ reservations, shopping }: BuildNudgesInput): Nudge[] {
  const nudges: Nudge[] = [];
  const todayStr = getLocalTodayIso();

  // 1. Departure today — prompt the leaving occupant to fill the state.
  const active = reservations?.activeReservation;
  if (active && active.to === todayStr && !active.isCheckoutCompleted) {
    nudges.push({
      id: `departure-${active.id}`,
      tone: "action",
      icon: Luggage,
      title: "Dnes odjíždíš z chaty",
      detail: "Vyplň stav chaty pro dalšího — zabere to 30 sekund.",
      href: "/reservations",
    });
  }

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
      href: "/shopping",
      whatsapp: `🛒 Na chatě dochází: ${lowItems.join(", ")}. Kdo pojede příště, doplní?`,
    });
  }

  // 3b. Gas low/empty from the last checkout state.
  const gas = reservations?.lastStay?.checkoutState?.gas;
  const gasTitle = gas === "low" || gas === "empty" ? gasLine(gas) : null;
  if (gasTitle) {
    nudges.push({
      id: `gas-${gas}-${reservations?.lastStay?.to ?? ""}`,
      tone: "warn",
      icon: Flame,
      title: gasTitle,
      detail: "Nahlásila to poslední návštěva při odjezdu.",
      href: "/shopping",
      whatsapp: `🔥 ${gasTitle}. Přiveze někdo na chatu novou?`,
    });
  }

  // 4. Cabin empty for a long time.
  const last = reservations?.lastStay;
  if (last && last.daysEmpty >= 14) {
    nudges.push({
      id: `empty-${Math.floor(last.daysEmpty / 7)}`, // re-appears weekly if still empty
      tone: "info",
      icon: House,
      title: `Chata je prázdná ${last.daysEmpty} dní`,
      detail: "Dlouho tam nikdo nebyl.",
      href: "/reservations",
      whatsapp: `🏡 Na chatě už ${last.daysEmpty} dní nikdo nebyl. Nezajedeme?`,
    });
  }

  return nudges;
}
