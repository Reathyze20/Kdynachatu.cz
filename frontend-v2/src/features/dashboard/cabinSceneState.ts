/**
 * Stav scény chaty (#563, spec #558). Čistá funkce nad daty, která Přehled už má: pobyty z
 * `/dashboard/reservations` a zazimování z nastavení chaty. Hostovi backend posílá jen jeho pobyt,
 * scéna tedy cizí obsazenost neukáže. Jak stav vypadá, řeší `CabinScene` a sprity v `cabinSceneSprites`.
 */
import type { DashboardReservationsData } from "@/api/dashboard";
import { toIsoDate } from "@/lib/dateUtils";

/** V den odjezdu je odjíždějící po této hodině pryč, stejně jako v kartě „Na chatě teď“. */
export const DEPARTURE_HOUR = 14;
/** Den a noc podle místního času zařízení, než přijde východ a západ slunce z počasí (#564). */
const NIGHT_FROM_HOUR = 20;
const NIGHT_UNTIL_HOUR = 6;

export type MascotPose = "sleep" | "chop" | "wave" | "idle";

export interface CabinSceneState {
  occupied: boolean;
  arriving: boolean;
  departing: boolean;
  /** Auto stojí u chaty: celý den příjezdu, v den odjezdu bez příjezdu jen do `DEPARTURE_HOUR` (#579). */
  carParked: boolean;
  winterized: boolean;
  night: boolean;
}

export function deriveCabinScene(data: DashboardReservationsData, winterized: boolean, now: Date): CabinSceneState {
  const today = toIsoDate(now);
  const hour = now.getHours();
  const stays = [...(data.activeReservation ? [data.activeReservation] : []), ...data.upcomingReservations.filter((s) => s.status === "primary")];
  const todays = stays.filter((s) => s.from <= today && today <= s.to);
  // „Teď“ jako v kartě (buildTurnusChain): ve střídací den ten, kdo přijel dřív, po 14:00 už pryč.
  const current = [...todays].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))[0];
  const present = !!current && !(current.to === today && hour >= DEPARTURE_HOUR);
  // Zazimování přebíjí obsazenost i auto (souhlasí s bannerem „Chata je zazimovaná“).
  const arriving = !winterized && todays.some((s) => s.from === today);
  const departing = !winterized && todays.some((s) => s.to === today);
  return {
    occupied: !winterized && present,
    arriving,
    departing,
    carParked: arriving || (departing && hour < DEPARTURE_HOUR),
    winterized,
    night: hour >= NIGHT_FROM_HOUR || hour < NIGHT_UNTIL_HOUR,
  };
}

/** Auto má přednost před štípáním: když u chaty stojí auto, plch mává, i když je někdo na chatě. */
export function mascotPose(s: CabinSceneState): MascotPose {
  if (s.winterized) return "idle";
  if (s.carParked) return "wave";
  return s.occupied ? "chop" : "sleep";
}

const POSE_TEXT: Record<MascotPose, string> = {
  sleep: "Plch spí na zápraží.",
  chop: "Plch štípe dříví.",
  wave: "Plch mává.",
  idle: "Plch odpočívá.",
};

/** Přístupný název scény: každá část odpovídá jedné vrstvě obrázku, nic nepřebíjí jen v textu. */
export function cabinSceneLabel(s: CabinSceneState): string {
  const parts = [
    s.winterized ? "Chata je zazimovaná, okenice jsou zavřené." : "",
    s.occupied ? "Někdo je na chatě, z komína jde kouř a svítí okno." : s.winterized ? "" : "Chata je prázdná.",
    !s.carParked ? "" :
      s.arriving && s.departing ? "Dnes se na chatě střídají, u chaty stojí auto." :
      s.arriving ? "Dnes někdo přijíždí, u chaty stojí auto." : "Dnes někdo odjíždí, u chaty stojí auto.",
    POSE_TEXT[mascotPose(s)],
    s.night ? "Je noc, na nebi svítí hvězdy." : "",
  ];
  return `Scéna chaty. ${parts.filter(Boolean).join(" ")}`;
}
