/**
 * useTrayNudges — upozornění, která ukáže „Visí na tobě“ (#172), a jejich skrývání.
 * Žije v Přehledu, ne v kartě, protože ostatní karty podle toho tlumí stejný obsah (#425).
 * Bez duplicity: docházející zásoby ukazuje „Potřebuje pozornost“, dnešní odjezd banner s předávkou.
 */
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import type { DashboardReservationsData, DashboardShoppingData } from "@/api/dashboard";
import { buildNudges, type Nudge } from "./nudges";

const storageKey = (username?: string | null) => `dismissedNudges:${username ?? "anon"}`;

function readDismissed(username?: string | null): string[] {
  try {
    const raw = localStorage.getItem(storageKey(username));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useTrayNudges(reservations?: DashboardReservationsData, shopping?: DashboardShoppingData) {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed(user?.username));

  const departureBanner = !!reservations?.departingToday && !!reservations.departingReservationId;
  const nudges: Nudge[] = buildNudges({ reservations, shopping, myUsername: user?.username }).filter(
    (n) => !n.id.startsWith("supply-") && !(departureBanner && n.id.startsWith("departure-")) && !dismissed.includes(n.id),
  );

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      localStorage.setItem(storageKey(user?.username), JSON.stringify(next));
    } catch {
      // storage unavailable — nudge just won't stay dismissed across reloads
    }
  };

  return { nudges, dismiss };
}
