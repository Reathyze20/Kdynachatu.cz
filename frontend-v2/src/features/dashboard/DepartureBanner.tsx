import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, TriangleAlert } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/api/client";
import { completeCheckout } from "@/api/reservations";
import { RESERVATIONS_KEY } from "@/features/reservations/hooks/useReservations";
import { showToast } from "@/lib/toast";
import { Modal } from "@/components/shared/Modal";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { getNetworkAwareActionMessage } from "@/lib/networkError";
import { getLocalTodayIso } from "@/lib/dateUtils";
import { isQueuedOffline } from "@/lib/offlineQueue";
import { useCheckoutPending } from "@/hooks/useOfflineQueue";
import { PendingSyncBadge } from "@/components/shared/PendingSyncBadge";

const BANNER_KEY = "departure_dismissed_date";
const DEFAULT_CHECKLIST = [
  "Uzavřít vodu a plyn",
  "Zkontrolovat okna a dveře",
  "Odnést odpadky",
  "Vytopit nebo nechat vyhasnout krb",
  "Zanechat vzkaz pro příštího návštěvníka",
];

function isDismissedToday(): boolean {
  const stored = sessionStorage.getItem(BANNER_KEY);
  if (!stored) return false;
  return stored === getLocalTodayIso();
}

function dismissToday(): void {
  sessionStorage.setItem(BANNER_KEY, getLocalTodayIso());
}

interface Props {
  /** Můj dnes končící pobyt s nedokončenou předávkou (z gate dashboardu) */
  reservationId: string;
  departureChecklist: string[];
  onRefresh: () => void;
  /** Protokol odjezdu i do chatu; host chat nemá (#484), jeho předávka jde jen do rezervace */
  postToChat?: boolean;
}

export function DepartureBanner({ reservationId, departureChecklist, onRefresh, postToChat = true }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(isDismissedToday);
  const [modalOpen, setModalOpen] = useState(false);
  const [checkedItems, setCheckedItems] = useState<boolean[]>([]);
  const [departureNote, setDepartureNote] = useState("");
  const [incompleteConfirmOpen, setIncompleteConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const checkoutPending = useCheckoutPending(reservationId); // E4, #276

  const checklistItems =
    departureChecklist && departureChecklist.length > 0 ? departureChecklist : DEFAULT_CHECKLIST;

  const submitMutation = useMutation({
    mutationFn: async (): Promise<{ queued: boolean }> => {
      // Stejná cesta zápisu jako CheckoutSection. Předávka jde první, aby po selhání
      // nezůstala v chatu zpráva bez dokončené předávky. Volný checklist chaty nemá
      // strukturovaný protějšek, do checkoutState jde jen vzkaz; bez vzkazu zůstane
      // případný už uložený stav beze změny. Offline jde předávka do fronty bez zprávy (#276).
      const note = departureNote.trim();
      try {
        await completeCheckout(reservationId, note ? { note } : undefined);
      } catch (error) {
        if (isQueuedOffline(error)) return { queued: true };
        throw error;
      }

      let fullMessage = "**Odjezd z chaty:**\n";
      checklistItems.forEach((item, i) => {
        fullMessage += checkedItems[i] ? `- [x] ${item}\n` : `- [ ] ${item}\n`;
      });
      if (note) {
        fullMessage += `\n**Vzkaz:** ${note}`;
      }
      if (postToChat) await apiClient.post("/channels/messages", { message: fullMessage });
      return { queued: false };
    },
    onSuccess: ({ queued }) => {
      dismissToday();
      setDismissed(true);
      setModalOpen(false);
      if (queued) return; // ve frontě: štítek „Čeká na odeslání“, po odeslání zmizí
      setSubmitError(null);
      showToast("Odjezdový protokol byl uložen.", "success");
      // RESERVATIONS_KEY pokrývá kalendář i gate odjezdu na dashboardu
      queryClient.invalidateQueries({ queryKey: RESERVATIONS_KEY });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onRefresh();
    },
    onError: (error) => {
      setSubmitError(
        getNetworkAwareActionMessage(
          error,
          "Odjezdový protokol se nepodařilo uložit. Zkus to znovu.",
          "Spojení vypadlo dřív, než se odjezdový protokol stihl uložit. Zkus to znovu po obnovení připojení.",
        ),
      );
    },
  });

  if (checkoutPending) {
    return (
      <div id="departure-banner" className="departure-banner">
        <div className="departure-banner-content">
          <div className="departure-banner-icon" aria-hidden="true"><Clock className="w-5 h-5" /></div>
          <div className="departure-banner-text">
            <h3>Předávka chaty je vyplněná</h3>
            <p>Odešle se, jakmile bude signál.</p>
            <PendingSyncBadge />
          </div>
        </div>
      </div>
    );
  }

  if (dismissed) return null;

  const openModal = () => {
    setCheckedItems(new Array(checklistItems.length).fill(false));
    setDepartureNote("");
    setSubmitError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSubmitError(null);
  };

  const handleSubmit = () => {
    setSubmitError(null);
    const allChecked = checkedItems.every(Boolean);
    if (!allChecked) {
      setIncompleteConfirmOpen(true);
      return;
    }
    submitMutation.mutate();
  };

  const handleConfirmedSubmit = () => {
    setIncompleteConfirmOpen(false);
    setSubmitError(null);
    submitMutation.mutate();
  };

  const toggleItem = (i: number) => {
    if (submitError) setSubmitError(null);
    setCheckedItems((prev) => {
      const next = [...prev];
      next[i] = !next[i];
      return next;
    });
  };

  return (
    <>
      <ConfirmDialog
        isOpen={incompleteConfirmOpen}
        title="Neúplný checklist"
        message="Některé položky nejsou odškrtnuté. Opravdu chceš protokol odeslat?"
        confirmLabel="Odeslat"
        onConfirm={handleConfirmedSubmit}
        onCancel={() => setIncompleteConfirmOpen(false)}
      />
      {/* Departure banner — inserted at top of dashboard grid */}
      <div id="departure-banner" className="departure-banner">
        <div className="departure-banner-content">
          <div className="departure-banner-icon" aria-hidden="true"><TriangleAlert className="w-5 h-5" /></div>
          <div className="departure-banner-text">
            <h3>Dnes odjíždíš!</h3>
            <p>Nezapomeň vyplnit předávku chaty a nechat vzkaz.</p>
          </div>
        </div>
        <button id="btn-open-departure" className="button-primary departure-banner-action" onClick={openModal}>
          Vyplnit protokol
        </button>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title="Odjezdový protokol"
        footer={
          <button
            className="button-primary"
            style={{ width: "100%" }}
            disabled={submitMutation.isPending}
            onClick={handleSubmit}
          >
            {submitMutation.isPending ? "Odesílám…" : "Odeslat a uzavřít pobyt"}
          </button>
        }
      >
        <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: '0.9rem' }}>
          Před odjezdem, prosím, zkontroluj:
        </p>
        <div className="departure-checklist">
          {checklistItems.map((item, i) => (
            <label key={i} className="checklist-item">
              <input
                type="checkbox"
                checked={checkedItems[i] ?? false}
                onChange={() => toggleItem(i)}
              />
              {" "}
              {item}
            </label>
          ))}
        </div>
        <div className="form-group" style={{ marginTop: 15 }}>
          <label>Vzkaz dalšímu návštěvníkovi (a na nástěnku):</label>
          <textarea
            className="form-control"
            rows={3}
            placeholder="Např.: Vše ok, dřevo je připravené pod plachtou..."
            value={departureNote}
            onChange={(e) => {
              if (submitError) setSubmitError(null);
              setDepartureNote(e.target.value);
            }}
          />
        </div>
        {submitError ? (
          <div className="error-message show" role="alert">{submitError}</div>
        ) : null}
      </Modal>
      <div style={{ display: "none" }} onClick={() => navigate("/reservations")} />
    </>
  );
}
