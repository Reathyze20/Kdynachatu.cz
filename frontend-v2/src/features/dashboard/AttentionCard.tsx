/**
 * AttentionCard — „Potřebuje pozornost“ na Přehledu (#275, návrh #6 díl 4 = A + C).
 * Nejvýš tři řádky se stavem slovem, u zásob „Koupím já“ = slib „Přivezu z domova“ s mým jménem
 * (#167) s toastem „Zpět“ (#511), u víc věcí souhrn do Zásob. Nahoře „Zkopírovat pro WhatsApp“ zkopíruje celý seznam (#264).
 * Když nic nepotřebuje pozornost, karta se nevykreslí.
 */
import { useId } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import type { AttentionItem, DashboardShoppingData, HandoverFault } from "@/api/dashboard";
import { inventoryApi, shoppingApi, type InventoryItem } from "@/api/shopping";
import { DASHBOARD_SHOPPING_KEY, SHOPPING_KEY } from "@/features/shopping/hooks/useShoppingLists";
import { INVENTORY_KEY } from "@/features/shopping/hooks/useInventory";
import { formatDayMonth } from "@/lib/dateUtils";
import { handleMutationError } from "@/lib/mutationError";
import { isNetworkError } from "@/lib/networkError";
import { isQueuedOffline } from "@/lib/offlineQueue";
import { pluralize } from "@/lib/format";
import { showToast } from "@/lib/toast";
import { whatsAppMessage } from "@/lib/whatsapp";
import { CopyForWhatsAppButton } from "@/components/shared/CopyForWhatsAppButton";
import { attentionKey, attentionWhatsApp, buildAttention, supplyStatus } from "./attention";

const sameRow = (a: AttentionItem, b: AttentionItem) => attentionKey(a) === attentionKey(b);

/** Co potřebuje „Zpět“ (#511): položku nákupu, kterou slib změnil, jestli ji slib přidal, a stav zásoby před ním. */
interface PledgeUndo {
  itemId: string;
  created: boolean;
  supplyStatusBefore?: InventoryItem["status"];
}

/** Zásoba jde přes pledge (server položku případně přidá), samotná ★ položka přes stávající změnu stavu. */
async function pledgeItem(item: AttentionItem): Promise<PledgeUndo> {
  if (item.inventoryId) {
    const result = await inventoryApi.pledge(item.inventoryId);
    return { itemId: result.id, created: result.created, supplyStatusBefore: result.supplyStatusBefore };
  }
  if (!item.shoppingItemId) throw new Error("Věc nemá zásobu ani položku nákupu");
  await shoppingApi.toggleItemStatus(item.shoppingItemId, "bring_from_home");
  return { itemId: item.shoppingItemId, created: false };
}

/**
 * Vezme slib zpět: přidanou položku smaže, jinak ji vrátí na Koupit. Návrat na Koupit dá zásobě Dochází
 * (server stav před slibem nezná), proto se jí pak nastaví stav, který měla před slibem.
 * Bez signálu jdou do offline fronty oba kroky v pořadí, ne jen první.
 */
async function undoPledge(item: AttentionItem, undo: PledgeUndo) {
  const { inventoryId } = item;
  const { supplyStatusBefore } = undo;
  const steps = [
    () => (undo.created ? shoppingApi.deleteItem(undo.itemId) : shoppingApi.toggleItemStatus(undo.itemId, "pending")),
    ...(inventoryId && supplyStatusBefore ? [() => inventoryApi.setStatus(inventoryId, supplyStatusBefore)] : []),
  ];
  let queued: unknown = null;
  for (const step of steps) {
    try {
      await step();
    } catch (err) {
      if (!isQueuedOffline(err)) throw err;
      queued = err;
    }
  }
  if (queued) throw queued;
}

function usePledge() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: DASHBOARD_SHOPPING_KEY });
    void qc.invalidateQueries({ queryKey: SHOPPING_KEY });
    void qc.invalidateQueries({ queryKey: INVENTORY_KEY });
  };
  // Řádek se vrátí hned na původní místo, další načtení Přehledu ho potvrdí
  const restoreRow = (item: AttentionItem, index: number) => {
    void qc.cancelQueries({ queryKey: DASHBOARD_SHOPPING_KEY });
    qc.setQueryData<DashboardShoppingData>(DASHBOARD_SHOPPING_KEY, (old) => {
      if (!old) return old;
      const rest = (old.attention ?? []).filter((i) => !sameRow(i, item));
      return { ...old, attention: [...rest.slice(0, index), item, ...rest.slice(index)] };
    });
  };

  return useMutation({
    mutationFn: pledgeItem,
    // Optimisticky: slíbená věc z karty zmizí hned
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: DASHBOARD_SHOPPING_KEY });
      const previous = qc.getQueryData<DashboardShoppingData>(DASHBOARD_SHOPPING_KEY);
      const index = previous?.attention?.findIndex((i) => sameRow(i, item)) ?? -1;
      qc.setQueryData<DashboardShoppingData>(DASHBOARD_SHOPPING_KEY, (old) =>
        old && { ...old, attention: old.attention?.filter((i) => !sameRow(i, item)) },
      );
      return { previous, index: Math.max(index, 0) };
    },
    // Toast žije i po odchodu z Přehledu, proto „Zpět“ nestojí na stavu komponenty
    onSuccess: (undo, item, ctx) => {
      showToast({
        title: `Přivezeš: ${item.name}.`,
        action: {
          label: "Zpět",
          onClick: () => {
            restoreRow(item, ctx?.index ?? 0);
            undoPledge(item, undo).catch(handleMutationError("Slib se nepodařilo vzít zpět")).finally(invalidate);
          },
        },
      }, "success");
    },
    onError: (err, _item, ctx) => {
      // Výpadek sítě: slib zůstane (offline fronta), chyba serveru vrátí řádek zpět
      if (!isNetworkError(err) && ctx?.previous) qc.setQueryData(DASHBOARD_SHOPPING_KEY, ctx.previous);
      handleMutationError("Slib se nepodařilo uložit")(err);
    },
    onSettled: invalidate,
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
        <h2 id={headingId} className="m-0 text-card-title text-(--text-main)">Potřebuje pozornost</h2>
        <CopyForWhatsAppButton text={whatsAppMessage(attentionWhatsApp(all), "/shopping")} />
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
