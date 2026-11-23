import type { Reservation } from "@/api/reservations";

/** Typ rezervace pojmenovaný jako ve formuláři (#209). Rezervace bez stavu je pevná. */
export const RESERVATION_TYPE_LABEL: Record<NonNullable<Reservation["status"]>, string> = {
  primary: "Pevná",
  soft: "Předběžná",
  backup: "Záložní",
};
