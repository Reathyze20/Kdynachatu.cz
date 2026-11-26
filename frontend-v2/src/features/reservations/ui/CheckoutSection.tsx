import { useState, useEffect } from "react";
import { Check, RefreshCw } from "lucide-react";
import apiClient from "@/api/client";
import type { Reservation, CheckoutStatus, CheckoutState } from "@/api/reservations";
import { useCheckoutReservation } from "../hooks/useReservations";
import { getNetworkAwareActionMessage, getNetworkAwareLoadMessage } from "@/lib/networkError";
import { GAS_LABEL, GAS_OPTIONS, gasLine, type WritableGasValue } from "@/lib/gasLevel";
import { isQueuedOffline } from "@/lib/offlineQueue";
import { useCheckoutPending } from "@/hooks/useOfflineQueue";
import { PendingSyncBadge } from "@/components/shared/PendingSyncBadge";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/format";

// Předávka leží v detailu: vnořený blok bg-inset, rounded-xl (DESIGN.md §7).
const SECTION = "flex flex-col gap-3 rounded-xl bg-inset p-4";
const TITLE = "text-card-title text-(--text-main)";
const HINT = "text-meta text-(--text-muted)";
const CHECK_ROW = "flex min-h-(--touch-target-min) cursor-pointer items-center gap-3 text-body text-(--text-main)";
const CHECKBOX = "size-5 shrink-0 accent-(--brand-primary)";

/** Nepovinné textové pole předávky, popisek nad polem. */
function NoteField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-label text-(--text-muted)">
      {label}
      <textarea
        rows={2}
        maxLength={1000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-body text-(--text-main) focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}

/** Returns true if reservation is active or was active in the last ~day */
function isReservationActiveOrRecent(r: Reservation): boolean {
  if (!r.from || !r.to) return false;
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const from = new Date(r.from + "T00:00:00");
  const to = new Date(r.to + "T00:00:00");
  return from <= now && to >= yesterday;
}

interface Props {
  reservation: Reservation;
}

export function CheckoutSection({ reservation }: Props) {
  const isPrimary = reservation.status === "primary";
  const eligible = isPrimary && isReservationActiveOrRecent(reservation);
  const checkout = useCheckoutReservation();
  const checkoutPending = useCheckoutPending(reservation.id); // E4, #276

  const [tasks, setTasks] = useState<string[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  // Structured "state of the cabin" (arrival-briefing source)
  const [gas, setGas] = useState<WritableGasValue | null>(null);
  const [heatingOff, setHeatingOff] = useState(false);
  const [waterOff, setWaterOff] = useState(false);
  const [broken, setBroken] = useState("");
  const [leftBehind, setLeftBehind] = useState("");
  const [stateNote, setStateNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [completedStatus, setCompletedStatus] = useState<CheckoutStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!eligible) return;
    setLoadError(null);
    setSubmitError(null);
    if (reservation.isCheckoutCompleted) {
      setLoading(true);
      setTasks([]);
      apiClient
        .get<CheckoutStatus>(`/reservations/${reservation.id}/checkout`)
        .then((res) => setCompletedStatus(res.data))
        .catch((error) => {
          setCompletedStatus(null);
          setLoadError(
            getNetworkAwareLoadMessage(
              error,
              "Nepodařilo se načíst stav potvrzeného odjezdu. Zkus to znovu.",
            ),
          );
        })
        .finally(() => setLoading(false));
    } else {
      setCompletedStatus(null);
      setLoading(true);
      apiClient
        .get<{ checkoutTasks?: string[] }>("/cabin")
        .then((res) => {
          setTasks(res.data.checkoutTasks ?? []);
        })
        .catch((error) => {
          setTasks([]);
          setLoadError(
            getNetworkAwareLoadMessage(
              error,
              "Nepodařilo se načíst výjezdový protokol. Zkus to znovu.",
            ),
          );
        })
        .finally(() => setLoading(false));
    }
  }, [eligible, reservation.id, reservation.isCheckoutCompleted, reloadKey]);

  if (!eligible) return null;

  if (checkoutPending) {
    return (
      <div className={SECTION}>
        <h3 className={TITLE}>Předávka je vyplněná</h3>
        <p className={HINT}>Odešle se, jakmile bude signál.</p>
        <PendingSyncBadge />
      </div>
    );
  }

  if (loading) {
    return (
      <div className={SECTION} aria-busy="true">
        <div className="h-24 rounded-xl bg-sheet" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={`${SECTION} items-center text-center`} role="alert">
        <p className="text-body text-(--text-main)">{loadError}</p>
        <Button type="button" variant="secondary" onClick={() => setReloadKey((value) => value + 1)}>
          <RefreshCw aria-hidden="true" />
          Zkusit znovu
        </Button>
      </div>
    );
  }

  // --- Completed state ---
  if (reservation.isCheckoutCompleted && completedStatus) {
    const ts = completedStatus.checkoutCompletedAt;
    const formatted = ts ? `${formatDate(ts)} ${formatTime(ts)}` : "";
    const s = completedStatus.checkoutState;
    const gasSummary = gasLine(s?.gas);
    return (
      <div className={SECTION}>
        <div className="flex items-center gap-3 rounded-xl bg-(--status-success-light) p-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-(--status-success) text-(--text-on-success)" aria-hidden="true"><Check className="size-5" /></div>
          <div className="flex flex-col">
            <strong className={TITLE}>Odjezd potvrzen</strong>
            {formatted && <span className={HINT}>{formatted}</span>}
          </div>
        </div>
        {s && (
          <div className="flex flex-col gap-1 text-body text-(--text-main)">
            {gasSummary && <div>{gasSummary}</div>}
            {s.heatingOff && <div>Topení vypnuté</div>}
            {s.waterOff && <div>Voda uzavřená</div>}
            {s.broken && <div><strong>Rozbité:</strong> {s.broken}</div>}
            {s.leftBehind && <div><strong>Nechal/a:</strong> {s.leftBehind}</div>}
            {s.note && <div><strong>Vzkaz:</strong> {s.note}</div>}
          </div>
        )}
      </div>
    );
  }

  // --- Form: state-of-the-cabin + optional checklist (not yet completed) ---
  // Confirm needs all checklist tasks ticked; with no tasks it's always allowed.
  const allChecked = tasks.length === 0 || checked.size === tasks.length;

  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const buildState = (): CheckoutState => ({
    gas: gas ?? undefined,
    heatingOff: heatingOff || undefined,
    waterOff: waterOff || undefined,
    broken: broken.trim() || undefined,
    leftBehind: leftBehind.trim() || undefined,
    note: stateNote.trim() || undefined,
  });

  const handleConfirm = async () => {
    if (!allChecked) return;
    setSubmitError(null);
    try {
      await checkout.mutateAsync({ id: reservation.id, state: buildState() });
    } catch (error) {
      if (isQueuedOffline(error)) return; // offline: předávka je ve frontě, místo chyby štítek
      setSubmitError(
        getNetworkAwareActionMessage(
          error,
          "Odjezd se nepodařilo potvrdit. Zkus to znovu.",
          "Spojení vypadlo dřív, než se odjezd stihl potvrdit. Zkus to znovu po obnovení připojení.",
        ),
      );
    }
  };

  const clearErr = () => { if (submitError) setSubmitError(null); };

  return (
    <div className={SECTION}>
      <div className="flex flex-col gap-1">
        <h3 className={TITLE}>Stav chaty při odjezdu</h3>
        <p className={HINT}>Vyplň pro dalšího návštěvníka – uvidí to jako přivítání. Vše je nepovinné.</p>
      </div>

      {/* Plynová bomba: tři segmenty, opětovné klepnutí výběr zruší (plyn je nepovinný) */}
      <div className="flex flex-col gap-1.5">
        <span id={`gas-label-${reservation.id}`} className="text-label text-(--text-muted)">{GAS_LABEL}</span>
        <div role="group" aria-labelledby={`gas-label-${reservation.id}`} className="flex flex-wrap gap-2">
          {GAS_OPTIONS.map((o) => (
            <Button type="button" key={o.value} size="sm" variant={gas === o.value ? "primary" : "secondary"} aria-pressed={gas === o.value} onClick={() => { clearErr(); setGas(gas === o.value ? null : o.value); }}>
              {o.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Topení / voda */}
      <div className="flex flex-wrap gap-x-6">
        <label className={CHECK_ROW}>
          <input type="checkbox" className={CHECKBOX} checked={heatingOff} onChange={(e) => { clearErr(); setHeatingOff(e.target.checked); }} /> Topení vypnuté
        </label>
        <label className={CHECK_ROW}>
          <input type="checkbox" className={CHECKBOX} checked={waterOff} onChange={(e) => { clearErr(); setWaterOff(e.target.checked); }} /> Voda uzavřená
        </label>
      </div>

      <NoteField label="Rozbité nebo potřebuje pozornost (nepovinné)" value={broken} onChange={(v) => { clearErr(); setBroken(v); }} />
      <NoteField label="Co jsem nechal/a, třeba dřevo nebo jídlo (nepovinné)" value={leftBehind} onChange={(v) => { clearErr(); setLeftBehind(v); }} />
      <NoteField label="Vzkaz pro dalšího (nepovinné)" value={stateNote} onChange={(v) => { clearErr(); setStateNote(v); }} />

      {/* Výjezdový protokol – jen pokud chata má nakonfigurované úkoly */}
      {tasks.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className={TITLE}>Výjezdový protokol</h3>
          <p className={HINT}>Splněno {checked.size} z {tasks.length} úkolů</p>
          {tasks.map((task, i) => (
            <label key={i} className={CHECK_ROW}>
              <input type="checkbox" className={CHECKBOX} checked={checked.has(i)} onChange={() => { clearErr(); toggle(i); }} />
              <span>{task}</span>
            </label>
          ))}
        </div>
      )}

      <Button className="w-full" disabled={!allChecked} pending={checkout.isPending} onClick={handleConfirm}>
        {checkout.isPending ? "Ukládám…" : "Potvrdit odjezd"}
      </Button>
      {tasks.length > 0 && !allChecked && (
        <p className={`${HINT} text-center`}>Potvrď všechny úkoly pro odeslání.</p>
      )}
      {submitError ? (
        <p className="text-label text-(--status-error)" role="alert">{submitError}</p>
      ) : null}
    </div>
  );
}
