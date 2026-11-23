/**
 * AttentionCard — „Potřebuje pozornost“ na Přehledu (#275, návrh #6 díl 4 = A + C).
 * Nejvýš tři řádky se stavem slovem, u zásob „Koupím já“ = slib „Přivezu z domova“ s mým jménem
 * (#167), u víc věcí souhrn do Zásob. Nahoře „Do WhatsAppu“ zkopíruje celý seznam.
 * Když nic nepotřebuje pozornost, karta se nevykreslí.
 */
import { useId } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, MessageCircle } from "lucide-react";
import type { AttentionItem, DashboardShoppingData, HandoverFault } from "@/api/dashboard";
import { inventoryApi, shoppingApi } from "@/api/shopping";
import { DASHBOARD_SHOPPING_KEY, SHOPPING_KEY } from "@/features/shopping/hooks/useShoppingLists";
import { INVENTORY_KEY } from "@/features/shopping/hooks/useInventory";
import { formatDayMonth } from "@/lib/dateUtils";
import { handleMutationError } from "@/lib/mutationError";
import { isNetworkError } from "@/lib/networkError";
import { pluralize } from "@/lib/utils";
import { copyForWhatsApp } from "@/lib/whatsapp";
import { attentionKey, attentionWhatsApp, buildAttention, supplyStatus } from "./attention";

/** Zásoba jde přes pledge (server položku případně přidá), samotná ★ položka přes stávající změnu stavu. */
function usePledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: AttentionItem) =>
      item.inventoryId ? inventoryApi.pledge(item.inventoryId) : shoppingApi.toggleItemStatus(item.shoppingItemId ?? "", "bring_from_home"),
    // Optimisticky: slíbená věc z karty zmizí hned
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: DASHBOARD_SHOPPING_KEY });
      qc.setQueryData<DashboardShoppingData>(DASHBOARD_SHOPPING_KEY, (old) =>
        old && { ...old, attention: old.attention?.filter((i) => attentionKey(i) !== attentionKey(item)) },
      );
    },
    onError: (err) => {
      if (isNetworkError(err)) return; // offline fronta slib odešle později
      handleMutationError("Slib se nepodařilo uložit")(err);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: DASHBOARD_SHOPPING_KEY });
      void qc.invalidateQueries({ queryKey: SHOPPING_KEY });
      void qc.invalidateQueries({ queryKey: INVENTORY_KEY });
    },
  });
}

interface Props {
  shopping?: DashboardShoppingData;
  fault?: HandoverFault | null;
}

export function AttentionCard({ shopping, fault }: Props) {
  const headingId = useId();
  const pledge = usePledge();
  const { rows, more, all } = buildAttention(shopping?.attention, fault);
  if (all.length === 0) return null;

  return (
    <section className="glass-card attention-card" aria-labelledby={headingId} data-testid="dashboard-attention">
      <div className="dashboard-card-header">
        <h2 id={headingId} className="dashboard-card-header-title">Potřebuje pozornost</h2>
        <button type="button" className="attention-whatsapp" onClick={() => void copyForWhatsApp(attentionWhatsApp(all), "/shopping")}>
          <MessageCircle className="w-4 h-4" aria-hidden="true" />
          Do WhatsAppu
        </button>
      </div>
      <ul className="attention-list">
        {rows.map((row) =>
          row.kind === "fault" ? (
            <li key="fault" className="attention-row">
              <span className="badge badge-fault">Závada</span>
              <span className="attention-name">
                {row.text}
                <span className="attention-meta"> · {row.reportedBy} {formatDayMonth(row.reportedAt)}</span>
              </span>
            </li>
          ) : (
            <li key={attentionKey(row)} className="attention-row">
              <span className={`badge ${supplyStatus(row.isEmpty).badge}`}>{supplyStatus(row.isEmpty).label}</span>
              <span className="attention-name">{row.name}</span>
              <button type="button" className="status-cta status-cta-neutral attention-pledge" aria-label={`Koupím já: ${row.name}`} onClick={() => pledge.mutate(row)}>
                Koupím já
              </button>
            </li>
          ),
        )}
      </ul>
      {more > 0 && (
        <Link to="/shopping" className="attention-more">
          + {more} {pluralize(more, "další potřebuje", "další potřebují", "dalších potřebuje")} pozornost
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
