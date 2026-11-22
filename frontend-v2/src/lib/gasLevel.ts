/**
 * Jediný slovník plynu ve frontendu (rozhodnutí #166 = A).
 *
 * Plyn se všude jmenuje „Plynová bomba“ a má tři stavy Dostatek · Dochází · Došlo.
 * Backend dál přijímá čtyři hodnoty: stará `half` se jen čte (jako Dostatek),
 * formulář zapisuje jen `full` / `low` / `empty`.
 */
import type { CheckoutState } from "@/api/reservations";

export type GasValue = NonNullable<CheckoutState["gas"]>;
export type WritableGasValue = Exclude<GasValue, "half">;

export const GAS_LABEL = "Plynová bomba";

const GAS_STATE: Record<GasValue, string> = {
  full: "Dostatek",
  half: "Dostatek",
  low: "Dochází",
  empty: "Došlo",
};

/** Segmenty formuláře v pořadí, v jakém se ukazují. */
export const GAS_OPTIONS: { value: WritableGasValue; label: string }[] = (["full", "low", "empty"] as const).map(
  (value) => ({ value, label: GAS_STATE[value] }),
);

/** Zobrazený stav plynu; chybějící nebo neznámá hodnota se nezobrazuje (`null`). */
export function gasStateLabel(value: GasValue | null | undefined): string | null {
  return value ? GAS_STATE[value] ?? null : null;
}

/** „Plynová bomba: Dochází“, nebo `null`, když stav plynu chybí. */
export function gasLine(value: GasValue | null | undefined): string | null {
  const state = gasStateLabel(value);
  return state ? `${GAS_LABEL}: ${state}` : null;
}
