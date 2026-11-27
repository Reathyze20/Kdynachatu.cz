/**
 * attention.ts — co patří do bloku „Důležité“ na Přehledu (#682, spec #677).
 * Pevné pořadí: výstraha před bouřkou → plyn a závada z poslední předávky → Došlo u zásoby s ★ →
 * vzkaz z nástěnky mladší než 14 dní. Běžné Dochází a položky bez ★ na Přehled nepatří.
 * Host vidí jen výstrahu před bouřkou. Rozhoduje se tady, karta jen vykresluje.
 */
import type { AttentionItem, HandoverFault, WeatherData } from "@/api/dashboard";
import { GAS_LABEL, gasStateLabel, type GasValue } from "@/lib/gasLevel";
import { formatDayMonth } from "@/lib/dateUtils";

export const MAX_ATTENTION_ROWS = 3;
const NOTE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Tón štítku a ikony (DESIGN.md §2): varování, došlo, nebo tiché info. */
export type AttentionTone = "low" | "empty" | "info";

interface RowBase { key: string; label: string; tone: AttentionTone; text: string; meta?: string }
export type AttentionRow =
  | (RowBase & { kind: "storm" | "gas" | "note" })
  | (RowBase & { kind: "fault"; fault: HandoverFault })
  | (RowBase & { kind: "supply"; item: AttentionItem });

export interface Attention {
  /** Nejvýš tři řádky karty. */
  rows: AttentionRow[];
  /** Kolik věcí se nevešlo (souhrn „+ N dalších“). */
  more: number;
  /** Všechno pro „Zkopírovat pro WhatsApp“. */
  all: AttentionRow[];
}

export interface AttentionInput {
  storm?: WeatherData["stormAlert"];
  /** Plyn z poslední předávky; `null`, když ho nese „Visí na tobě“. */
  gas?: GasValue | null;
  fault?: HandoverFault | null;
  supplies?: AttentionItem[];
  note?: { text: string | null; author: string | null; updatedAt: string | null };
  isGuest?: boolean;
}

/** Stabilní klíč věci (řádek React, optimistické odebrání). */
export const attentionKey = (item: AttentionItem): string => item.inventoryId ?? item.shoppingItemId ?? item.name;

export function buildAttention({ storm, gas, fault, supplies = [], note, isGuest }: AttentionInput): Attention {
  const all: AttentionRow[] = [];
  if (storm) all.push({ kind: "storm", key: "storm", label: "Výstraha", tone: "low", text: `${storm.day}: ${storm.description}` });
  if (!isGuest) {
    if (gas === "low" || gas === "empty") {
      all.push({ kind: "gas", key: "gas", label: gasStateLabel(gas) ?? "", tone: gas, text: GAS_LABEL });
    }
    if (fault) {
      all.push({ kind: "fault", key: "fault", label: "Závada", tone: "empty", text: fault.text, meta: `${fault.reportedBy} ${formatDayMonth(fault.reportedAt)}`, fault });
    }
    for (const item of supplies.filter((i) => i.isEmpty && i.isEssential)) {
      all.push({ kind: "supply", key: attentionKey(item), label: "Došlo", tone: "empty", text: item.name, item });
    }
    const noteText = note?.text?.trim();
    const noteAge = note?.updatedAt ? Date.now() - new Date(note.updatedAt).getTime() : Infinity;
    if (noteText && noteAge < NOTE_MAX_AGE_MS) {
      all.push({ kind: "note", key: "note", label: "Vzkaz", tone: "info", text: noteText, meta: note?.author ?? undefined });
    }
  }
  const rows = all.slice(0, MAX_ATTENTION_ROWS);
  return { rows, more: all.length - rows.length, all };
}

/** Text pro rodinnou skupinu: každá věc na jednom řádku se stavem slovem. */
export function attentionWhatsApp(rows: AttentionRow[]): string {
  const lines = rows.map((r) =>
    r.kind === "fault" ? `- Závada: ${r.text} (${r.fault.reportedBy}, ${formatDayMonth(r.fault.reportedAt)})` : `- ${r.label}: ${r.text}`,
  );
  return ["Na chatě potřebuje pozornost:", ...lines].join("\n");
}
