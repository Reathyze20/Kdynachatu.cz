/**
 * AttentionCard — „Důležité“ na Přehledu (#682, dřív „Potřebuje pozornost“ #275), tichý tón s ikonou a štítkem.
 * Nejvýš tři řádky se stavem slovem, u zásob „Koupím já“ = slib „Přivezu z domova“ s mým jménem
 * (#167) s toastem „Zpět“ (#511), u věci, kterou slíbil někdo jiný, „Koupí: <jméno>“ (#683), u víc věcí souhrn do Zásob. Nahoře „Zkopírovat pro WhatsApp“ zkopíruje celý seznam (#264).
 * Když nic nepotřebuje pozornost, karta se nevykreslí.
 */
import { useId } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, CloudLightning, Flame, Star, StickyNote, Wrench, type LucideIcon } from "lucide-react";
import type { AttentionItem, DashboardShoppingData } from "@/api/dashboard";
import { inventoryApi, shoppingApi, type InventoryItem } from "@/api/shopping";
import { DASHBOARD_SHOPPING_KEY, SHOPPING_KEY } from "@/features/shopping/hooks/useShoppingLists";
import { INVENTORY_KEY } from "@/features/shopping/hooks/useInventory";
import { handleMutationError } from "@/lib/mutationError";
import { isNetworkError } from "@/lib/networkError";
import { isQueuedOffline } from "@/lib/offlineQueue";
import { pluralize } from "@/lib/format";
import { showToast } from "@/lib/toast";
import { whatsAppMessage } from "@/lib/whatsapp";
import { CopyForWhatsAppButton } from "@/components/shared/CopyForWhatsAppButton";
import { Card } from "@/components/shared/Card";
import { ListRow, listRowLinkClass } from "@/components/shared/ListRow";
import { Button } from "@/components/ui/button";
import { attentionKey, attentionWhatsApp, type Attention, type AttentionRow, type AttentionTone } from "./attention";

// Tóny štítků (DESIGN.md §2): varování a došlo s ověřeným kontrastem (statusBadgeContrast), info tichý tlumený text na papíře
const TONES: Record<AttentionTone, { pill: string; icon: string }> = {
  low: { pill: "bg-(--low-bg) text-[rgb(var(--low))]", icon: "text-[rgb(var(--low))]" },
  empty: { pill: "bg-(--empty-bg) text-[rgb(var(--empty))]", icon: "text-[rgb(var(--empty))]" },
  info: { pill: "bg-sheet text-(--text-muted)", icon: "text-(--text-muted)" },
};
const ICONS: Record<AttentionRow["kind"], LucideIcon> = { storm: CloudLightning, gas: Flame, fault: Wrench, supply: Star, claimed: Star, note: StickyNote };

function RowContent({ row }: { row: AttentionRow }) {
  const Icon = ICONS[row.kind];
  const tone = TONES[row.tone];
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Icon className={`size-4 shrink-0 ${tone.icon}`} aria-hidden="true" />
      <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-eyebrow uppercase ${tone.pill}`}>{row.label}</span>
      <span className={`min-w-0 break-words text-body text-(--text-main) ${row.kind === "note" ? "line-clamp-2" : ""}`}>
        {row.text}
        {row.meta && <span className="text-meta text-(--text-muted)"> · {row.meta}</span>}
      </span>
    </span>
  );
}

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
  attention: Attention;
  onOpenNote: () => void;
}

export function AttentionCard({ attention: { rows, more, all }, onOpenNote }: Props) {
  const headingId = useId();
  const pledge = usePledge();
  if (all.length === 0) return null;

  return (
    <Card as="section" flush className="flex flex-col pb-2" aria-labelledby={headingId} data-testid="dashboard-attention">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 md:px-6 md:pt-6">
        <h2 id={headingId} className="m-0 text-card-title text-(--text-main)">Důležité</h2>
        <CopyForWhatsAppButton text={whatsAppMessage(attentionWhatsApp(all), "/shopping")} />
      </div>
      <ul className="m-0 list-none divide-y divide-rule-soft p-0">
        {rows.map((row) =>
          row.kind === "note" ? (
            <li key={row.key}>
              <button type="button" className={listRowLinkClass} onClick={onOpenNote}>
                <span className="min-w-0 flex-1 py-2"><RowContent row={row} /></span>
              </button>
            </li>
          ) : (
            <ListRow
              as="li"
              key={row.key}
              action={
                row.kind === "supply" ? (
                  <Button variant="secondary" size="sm" aria-label={`Koupím já: ${row.text}`} onClick={() => pledge.mutate(row.item)}>
                    Koupím já
                  </Button>
                ) : row.kind === "claimed" ? (
                  <span className="text-meta text-(--text-muted)">Koupí: {row.buyer}</span>
                ) : undefined
              }
            >
              <RowContent row={row} />
            </ListRow>
          ),
        )}
      </ul>
      {more > 0 && (
        <Link to="/shopping?view=pantry" className="flex min-h-(--touch-target-min) items-center gap-1 self-start px-4 text-meta font-semibold text-primary md:px-6">
          + {more} {pluralize(more, "další", "další", "dalších")}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </Card>
  );
}
