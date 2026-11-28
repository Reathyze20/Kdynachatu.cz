/**
 * useArrival — kdy se na Přehledu ukáže příjezdová karta (#174): můj pobyt (autor nebo spolucestující) začíná
 * dnes nebo zítra a příjezd jsem v tomto zařízení nepotvrdil. Data jsou z tabu Předávka (`GET /handover`).
 */
import { useState } from "react";
import type { HandoverOverview, LastHandover } from "@/api/handover";
import { useAuth } from "@/context/AuthContext";
import { useHandoverOverview } from "@/features/reservations/hooks/useReservations";
import { addIsoDays, getLocalTodayIso } from "@/lib/dateUtils";
import { showToast } from "@/lib/toast";

type MyStay = NonNullable<HandoverOverview["myStay"]>;

export interface Arrival {
  stay: MyStay;
  lastHandover: LastHandover | null;
  arrivesToday: boolean;
  confirm: () => void;
}

const storageKey = (username?: string | null) => `confirmedArrivals:${username ?? "anon"}`;

function readConfirmed(username?: string | null): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(username)) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Můj pobyt, který začíná dnes nebo zítra a jehož příjezd jsem v tomto zařízení nepotvrdil; jinak `null`. Host kartu nemá. */
export function useArrival(enabled: boolean): Arrival | null {
  const { user } = useAuth();
  const { data } = useHandoverOverview(enabled);
  const [confirmed, setConfirmed] = useState(() => readConfirmed(user?.username));
  const stay = data?.myStay;
  const today = getLocalTodayIso();
  if (!enabled || !stay || confirmed.includes(stay.reservationId)) return null;
  const arrivesToday = stay.from === today;
  if (!arrivesToday && stay.from !== addIsoDays(today, 1)) return null;

  const confirm = () => {
    const next = [...confirmed, stay.reservationId];
    setConfirmed(next);
    try {
      localStorage.setItem(storageKey(user?.username), JSON.stringify(next));
    } catch {
      // bez úložiště se karta po obnovení stránky ukáže znovu
    }
    showToast("Příjezd potvrzen.", "success");
  };
  return { stay, lastHandover: data.lastHandover, arrivesToday, confirm };
}
