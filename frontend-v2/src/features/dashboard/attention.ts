/**
 * attention.ts — co na Přehledu „potřebuje pozornost“ (#275, návrh #6 díl 4 = A + C).
 * Věci a jejich pořadí (Došlo před Dochází, důležité napřed) dává server (`attention`).
 * Tady se z nich skládají nejvýš tři řádky karty a text pro WhatsApp. Závada z poslední
 * předávky je vidět vždy jako poslední řádek, protože souhrn „+ N dalších“ vede do Zásob
 * a tam závady nejsou.
 */
import type { AttentionItem, HandoverFault } from "@/api/dashboard";
import { formatDayMonth } from "@/lib/dateUtils";

export const MAX_ATTENTION_ROWS = 3;

export type AttentionRow = ({ kind: "supply" } & AttentionItem) | ({ kind: "fault" } & HandoverFault);

export interface Attention {
  /** Nejvýš tři řádky karty. */
  rows: AttentionRow[];
  /** Kolik zásob se nevešlo (souhrn „+ N dalších“). */
  more: number;
  /** Všechno pro „Zkopírovat pro WhatsApp“. */
  all: AttentionRow[];
}

/** Stabilní klíč věci (řádek React, optimistické odebrání). */
export const attentionKey = (item: AttentionItem): string => item.inventoryId ?? item.shoppingItemId ?? item.name;

/** Stav zásoby slovem a třída štítku (slovník Zásob, #166). */
export function supplyStatus(isEmpty: boolean): { label: string; badge: string } {
  return isEmpty ? { label: "Došlo", badge: "badge-empty" } : { label: "Dochází", badge: "badge-low" };
}

export function buildAttention(items: AttentionItem[] = [], fault?: HandoverFault | null): Attention {
  const supplies: AttentionRow[] = items.map((i) => ({ kind: "supply", ...i }));
  const faults: AttentionRow[] = fault ? [{ kind: "fault", ...fault }] : [];
  const shown = supplies.slice(0, MAX_ATTENTION_ROWS - faults.length);
  return { rows: [...shown, ...faults], more: supplies.length - shown.length, all: [...supplies, ...faults] };
}

/** Text pro rodinnou skupinu: každá věc na jednom řádku se stavem slovem. */
export function attentionWhatsApp(rows: AttentionRow[]): string {
  const lines = rows.map((r) =>
    r.kind === "fault"
      ? `- Závada: ${r.text} (${r.reportedBy}, ${formatDayMonth(r.reportedAt)})`
      : `- ${supplyStatus(r.isEmpty).label}: ${r.name}`,
  );
  return ["Na chatě potřebuje pozornost:", ...lines].join("\n");
}
