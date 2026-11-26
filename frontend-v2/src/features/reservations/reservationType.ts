import type { Reservation } from "@/api/reservations";
import css from "./Reservations.module.css";

/** Typ rezervace pojmenovaný jako ve formuláři (#209). Rezervace bez stavu je pevná. */
export const RESERVATION_TYPE_LABEL: Record<NonNullable<Reservation["status"]>, string> = {
  primary: "Pevná",
  soft: "Předběžná",
  backup: "Záložní",
};

/** Štítek typu: pevná plně, předběžná obrysem, záložní (#209). */
export const RESERVATION_TYPE_CLASS: Record<NonNullable<Reservation["status"]>, string> = { primary: css.typeFirm, soft: css.typeSoft, backup: css.typeBackup };
