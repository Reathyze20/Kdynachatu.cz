import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import apiClient from "@/api/client";
import type { Reservation, CheckoutStatus, CheckoutState } from "@/api/reservations";
import { useCheckoutReservation } from "../hooks/useReservations";
import { getNetworkAwareActionMessage, getNetworkAwareLoadMessage } from "@/lib/networkError";
import { GAS_LABEL, GAS_OPTIONS, gasLine, type WritableGasValue } from "@/lib/gasLevel";
import { isQueuedOffline } from "@/lib/offlineQueue";
import { useIsQueued } from "@/hooks/useOfflineQueue";
import { PendingSyncBadge } from "@/components/shared/PendingSyncBadge";
import styles from "../Reservations.module.css";

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "4px 12px",
    borderRadius: 999,
    border: `1px solid ${active ? "var(--color-primary, #ea580c)" : "var(--color-border, #d0d5dd)"}`,
    background: active ? "color-mix(in srgb, var(--color-primary, #ea580c) 14%, transparent)" : "transparent",
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    fontSize: "0.85rem",
  };
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
  // Předávka čekající v offline frontě (E4, #276); po odeslání fronty štítek zmizí
  const checkoutPending = useIsQueued("patch", `/reservations/${reservation.id}/checkout`);

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
              "Nepodařilo se načíst stav potvrzeného odjezdu. Zkuste to znovu.",
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
              "Nepodařilo se načíst výjezdový protokol. Zkuste to znovu.",
            ),
          );
        })
        .finally(() => setLoading(false));
    }
  }, [eligible, reservation.id, reservation.isCheckoutCompleted, reloadKey]);

  if (!eligible) return null;

  if (checkoutPending) {
    return (
      <div className={styles.checkoutSection}>
        <h4 className={styles.checkoutTitle}>Předávka je vyplněná</h4>
        <p className={styles.checkoutHint}>Odešle se, jakmile bude signál.</p>
        <PendingSyncBadge />
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.checkoutSection}>
        <div className="spinner" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.checkoutSection}>
        <div className={styles.emptyTasksBox}>
          <div>{loadError}</div>
          <button
            type="button"
            className="button-secondary"
            style={{ marginTop: '12px' }}
            onClick={() => setReloadKey((value) => value + 1)}
          >
            Zkusit znovu
          </button>
        </div>
      </div>
    );
  }

  // --- Completed state ---
  if (reservation.isCheckoutCompleted && completedStatus) {
    const ts = completedStatus.checkoutCompletedAt
      ? new Date(completedStatus.checkoutCompletedAt)
      : null;
    const formatted = ts
      ? `${ts.getDate()}.${ts.getMonth() + 1}.${ts.getFullYear()} ${ts.getHours().toString().padStart(2, "0")}:${ts.getMinutes().toString().padStart(2, "0")}`
      : "";
    const s = completedStatus.checkoutState;
    const gasSummary = gasLine(s?.gas);
    return (
      <div className={styles.checkoutSection}>
        <div className={styles.checkoutCompleted}>
          <div className={styles.checkoutCompletedIcon} aria-hidden="true"><Check className="w-5 h-5" /></div>
          <div className={styles.checkoutCompletedText}>
            <strong>Odjezd potvrzen</strong>
            {formatted && <span className={styles.checkoutCompletedDate}>{formatted}</span>}
          </div>
        </div>
        {s && (
          <div style={{ marginTop: 10, fontSize: "0.85rem", lineHeight: 1.6 }}>
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
      // Bez signálu je předávka v offline frontě, místo chyby se ukáže štítek
      if (isQueuedOffline(error)) return;
      setSubmitError(
        getNetworkAwareActionMessage(
          error,
          "Odjezd se nepodařilo potvrdit. Zkuste to znovu.",
          "Spojení vypadlo dřív, než se odjezd stihl potvrdit. Zkuste to znovu po obnovení připojení.",
        ),
      );
    }
  };

  const clearErr = () => { if (submitError) setSubmitError(null); };

  return (
    <div className={styles.checkoutSection}>
      <h4 className={styles.checkoutTitle}>Stav chaty při odjezdu</h4>
      <p className={styles.checkoutHint} style={{ marginTop: -4 }}>
        Vyplň pro dalšího návštěvníka — uvidí to jako přivítání. Vše nepovinné.
      </p>

      {/* Plynová bomba: tři segmenty, opětovné klepnutí výběr zruší (plyn je nepovinný) */}
      <div style={{ marginBottom: 12 }}>
        <span id={`gas-label-${reservation.id}`} style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", display: "block", marginBottom: 6 }}>{GAS_LABEL}</span>
        <div role="group" aria-labelledby={`gas-label-${reservation.id}`} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {GAS_OPTIONS.map((o) => (
            <button type="button" key={o.value} aria-pressed={gas === o.value} style={chipStyle(gas === o.value)} onClick={() => { clearErr(); setGas(gas === o.value ? null : o.value); }}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Topení / voda */}
      <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.9rem" }}>
          <input type="checkbox" checked={heatingOff} onChange={(e) => { clearErr(); setHeatingOff(e.target.checked); }} /> Topení vypnuté
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.9rem" }}>
          <input type="checkbox" checked={waterOff} onChange={(e) => { clearErr(); setWaterOff(e.target.checked); }} /> Voda uzavřená
        </label>
      </div>

      <textarea className="form-control" style={{ marginBottom: 8 }} rows={2} maxLength={1000}
        placeholder="Rozbité / potřebuje pozornost…" value={broken} onChange={(e) => { clearErr(); setBroken(e.target.value); }} />
      <textarea className="form-control" style={{ marginBottom: 8 }} rows={2} maxLength={1000}
        placeholder="Co jsem nechal/a (dřevo, jídlo…)" value={leftBehind} onChange={(e) => { clearErr(); setLeftBehind(e.target.value); }} />
      <textarea className="form-control" style={{ marginBottom: 12 }} rows={2} maxLength={1000}
        placeholder="Vzkaz pro dalšího" value={stateNote} onChange={(e) => { clearErr(); setStateNote(e.target.value); }} />

      {/* Výjezdový protokol — jen pokud chata má nakonfigurované úkoly */}
      {tasks.length > 0 && (
        <>
          <h4 className={styles.checkoutTitle}>Výjezdový protokol</h4>
          <p className={styles.checkoutProgress}>
            Splněno <span className={styles.checkoutProgressBold}>{checked.size}</span> z{" "}
            <span className={styles.checkoutProgressBold}>{tasks.length}</span> úkolů
          </p>
          <div className={styles.checkoutTasksList}>
            {tasks.map((task, i) => (
              <label key={i} className={styles.checkoutTaskItem}>
                <input type="checkbox" checked={checked.has(i)} onChange={() => { clearErr(); toggle(i); }} />
                <span>{task}</span>
              </label>
            ))}
          </div>
        </>
      )}

      <button
        className={styles.checkoutConfirmBtn}
        disabled={!allChecked || checkout.isPending}
        onClick={handleConfirm}
      >
        {checkout.isPending ? "Ukládám…" : "Potvrdit odjezd"}
      </button>
      {tasks.length > 0 && !allChecked && (
        <p className={styles.checkoutHint}>Potvrď všechny úkoly pro odeslání.</p>
      )}
      {submitError ? (
        <div className="error-message show" role="alert">{submitError}</div>
      ) : null}
    </div>
  );
}
