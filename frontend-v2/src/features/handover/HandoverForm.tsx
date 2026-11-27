/**
 * Formulář „Předat chatu“ na tabu Předávka (#218, mock #2 díly 1A–4A). Ukládá jedním PATCH /checkout
 * vždy celý stav (úprava přepíše, nesloučí). Obrazovka čeká na server, předání netvrdí dopředu.
 */
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Droplets, Flame } from "lucide-react";
import type { CheckoutState, CheckoutStatus } from "@/api/reservations";
import { Card } from "@/components/shared/Card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useCheckoutReservation } from "@/features/reservations/hooks/useReservations";
import { useCabinSettings } from "@/features/settings/hooks/useCabinSettings";
import { GAS_LABEL, GAS_OPTIONS, type WritableGasValue } from "@/lib/gasLevel";
import { getNetworkAwareActionMessage } from "@/lib/networkError";
import { isQueuedOffline } from "@/lib/offlineQueue";

const TITLE = "text-card-title text-(--text-main)";
const HINT = "text-meta text-(--text-muted)";
const ROW = "flex min-h-(--touch-target-min) cursor-pointer items-center gap-3 text-body text-(--text-main)";
const TEXTS = [
  { key: "broken", label: "Rozbité / potřebuje pozornost", placeholder: "kape kohoutek v koupelně…" },
  { key: "leftBehind", label: "Co nechávám", placeholder: "dřevo u kamen, káva, konzervy…" },
  { key: "note", label: "Vzkaz pro dalšího", placeholder: "Užijte si to! Dřevo je u kamen." },
] as const;

// Velký přepínač: checkbox s rolí switch, vizuálně dráha s jezdcem
function SwitchRow({ icon, label, checked, onChange }: { icon: ReactNode; label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={ROW}>
      <span aria-hidden="true" className="flex text-(--text-muted)">{icon}</span>
      <span className="flex-1">{label}</span>
      <Checkbox role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden="true" className="relative h-7 w-12 shrink-0 rounded-full bg-(--text-muted) transition-colors peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-sheet after:transition-transform peer-checked:after:translate-x-5 motion-reduce:after:transition-none" />
    </label>
  );
}

/** `initial` = uložená předávka při úpravě; stará `half` se předvybere jako Dostatek. */
export function HandoverForm({ reservationId, stayRange, initial, onSaved, onQueued }: {
  reservationId: string; stayRange: string; initial?: CheckoutState | null; onSaved: (status: CheckoutStatus) => void; onQueued: () => void;
}) {
  const id = useId();
  const checkout = useCheckoutReservation();
  const checklist = useCabinSettings().data?.departureChecklist ?? [];
  const [gas, setGas] = useState<WritableGasValue | null>(initial?.gas === "half" ? "full" : initial?.gas ?? null);
  const [heatingOff, setHeatingOff] = useState(initial?.heatingOff ?? false);
  const [waterOff, setWaterOff] = useState(initial?.waterOff ?? false);
  const [texts, setTexts] = useState({ broken: initial?.broken ?? "", leftBehind: initial?.leftBehind ?? "", note: initial?.note ?? "" });
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (checkout.isPending) return; // druhé odeslání během ukládání
    setError(null);
    const state: CheckoutState = { gas: gas ?? undefined, heatingOff, waterOff, broken: texts.broken.trim() || undefined,
      leftBehind: texts.leftBehind.trim() || undefined, note: texts.note.trim() || undefined };
    try {
      onSaved(await checkout.mutateAsync({ id: reservationId, state }));
    } catch (err) {
      if (isQueuedOffline(err)) return onQueued();
      setError(getNetworkAwareActionMessage(err, "Předávku se nepodařilo uložit. Vyplněné údaje zůstaly, zkus to znovu.",
        "Spojení vypadlo dřív, než se předávka uložila. Vyplněné údaje zůstaly, zkus to znovu po obnovení připojení."));
    }
  };

  return (
    <form onSubmit={submit} aria-labelledby={`${id}-title`} className="flex flex-col gap-4 md:gap-6">
      <Card as="section" className="flex flex-col gap-3">
        <div>
          <h2 id={`${id}-title`} className={TITLE}>Předat chatu</h2>
          <p className={HINT}>Tvůj pobyt {stayRange} · vše je nepovinné</p>
        </div>
        <span id={`${id}-gas`} className="text-label text-(--text-muted)">{GAS_LABEL}</span>
        <div role="group" aria-labelledby={`${id}-gas`} className="grid grid-cols-3 gap-2">
          {GAS_OPTIONS.map((o) => (
            <Button key={o.value} type="button" size="sm" variant="secondary" aria-pressed={gas === o.value}
              className="px-2 aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-primary"
              onClick={() => setGas(gas === o.value ? null : o.value)}>
              {o.label}
            </Button>
          ))}
        </div>
        <SwitchRow icon={<Flame className="size-4" />} label="Topení vypnuté" checked={heatingOff} onChange={setHeatingOff} />
        <SwitchRow icon={<Droplets className="size-4" />} label="Voda uzavřená" checked={waterOff} onChange={setWaterOff} />
      </Card>

      {TEXTS.map(({ key, label, placeholder }) => (
        <Card as="section" key={key}>
          <label className="flex flex-col gap-2">
            <span className={TITLE}>{label} <span className="text-label text-(--text-muted)">(nepovinné)</span></span>
            <Textarea rows={2} maxLength={1000} placeholder={placeholder} value={texts[key]} onChange={(e) => setTexts({ ...texts, [key]: e.target.value })} />
          </label>
        </Card>
      ))}

      {checklist.length > 0 && (
        <Card as="section" aria-labelledby={`${id}-checklist`} className="flex flex-col gap-1">
          <h2 id={`${id}-checklist`} className={TITLE}>Než odjedeš</h2>
          <p className={HINT}>Připomínka, nic se neukládá</p>
          {checklist.map((task, i) => <label key={i} className={ROW}><Checkbox /> {task}</label>)}
        </Card>
      )}

      <Button type="submit" size="lg" className="w-full" pending={checkout.isPending}>
        {checkout.isPending ? "Ukládám…" : "Předat chatu"}
      </Button>
      {error && <p role="alert" className="rounded-xl bg-(--status-error-light) p-3 text-label text-(--status-error-dark)">{error}</p>}
    </form>
  );
}
