import { useState, useEffect, useRef } from "react";
import type { Reservation } from "@/api/reservations";
import { useCreateReservation, useUpdateReservation, useDeleteReservation, useUsers } from "../hooks/useReservations";
import { useAuth } from "@/context/AuthContext";
import { AnimalAvatar } from "@/components/shared/AnimalAvatar";
import { showToast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Modal } from "@/components/shared/Modal";
import { getNetworkAwareActionMessage } from "@/lib/networkError";
import { isoRangesOverlap } from "@/lib/dateUtils";
import { Home, CalendarClock } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  fromDate?: string; // YYYY-MM-DD
  toDate?: string;
  existing?: Reservation | null;
  allReservations: Reservation[];
  /** Called after successful create so parent can check inventory */
  onCreated?: (id: string) => void;
}

export function BookingForm({ open, onClose, fromDate, toDate, existing, allReservations, onCreated }: Props) {
  const isEdit = !!existing;

  const [from, setFrom] = useState(fromDate ?? "");
  const [to, setTo] = useState(toDate ?? "");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [handover, setHandover] = useState("");
  const [soft, setSoft] = useState(false);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [backupWarning, setBackupWarning] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fromRef = useRef<HTMLInputElement>(null);

  const create = useCreateReservation();
  const update = useUpdateReservation();
  const del = useDeleteReservation();
  const { user } = useAuth();
  const { data: members } = useUsers();
  // Selectable co-occupants: everyone in the cabin except the organizer (current user)
  const selectableMembers = (members ?? []).filter((m) => m.id !== user?.userId);

  const toggleParticipant = (id: string) => {
    if (submitError) setSubmitError(null);
    setParticipantIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // Pre-fill when editing
  useEffect(() => {
    if (existing) {
      setFrom(existing.from ?? "");
      setTo(existing.to ?? "");
      setPurpose(existing.purpose ?? "");
      setNotes(existing.notes ?? "");
      setHandover(existing.handoverNote ?? "");
      setSoft(existing.status === "soft");
      setParticipantIds(existing.participants?.map((p) => p.userId) ?? []);
    } else {
      setFrom(fromDate ?? "");
      setTo(toDate ?? "");
      setPurpose("");
      setNotes("");
      setHandover("");
      setSoft(false);
      setParticipantIds([]);
    }
    setBackupWarning(false);
    setSubmitError(null);
    setFieldErrors({});
    setDeleteError(null);
  }, [existing, fromDate, toDate, open]);

  // Check for overlapping non-backup reservations
  useEffect(() => {
    if (!from || !to) { setBackupWarning(false); return; }
    const overlaps = allReservations.some((r) => {
      if (r.status === "backup") return false;
      if (isEdit && r.id === existing?.id) return false;
      return isoRangesOverlap(from, to, r.from, r.to);
    });
    setBackupWarning(overlaps);
  }, [from, to, allReservations, isEdit, existing?.id]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!from || !to) { showToast("Vyplňte datum příjezdu a odjezdu.", "error"); return; }
    if (to < from) { showToast("Datum odjezdu nesmí být před příjezdem.", "error"); return; }
    const btn = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      const payload = { from, to, purpose, notes, handoverNote: handover, soft, participantIds };
      if (isEdit && existing) {
        await update.mutateAsync({ id: existing.id, payload });
        onClose();
      } else {
        const res = await create.mutateAsync(payload);
        onCreated?.(res.id);
        onClose();
      }
    } catch (error) {
      const validationErrors = (error as { response?: { data?: { errors?: { path: string; message: string }[] } } })
        ?.response?.data?.errors;
      if (Array.isArray(validationErrors)) {
        const newFieldErrors: Record<string, string> = {};
        for (const err of validationErrors) {
          newFieldErrors[err.path] = err.message;
        }
        setFieldErrors(newFieldErrors);
      } else {
        setSubmitError(
          getNetworkAwareActionMessage(
            error,
            "Rezervaci se nepodařilo uložit. Zkuste to znovu.",
            "Spojení vypadlo dřív, než se rezervace stihla uložit. Zkuste to znovu po obnovení připojení.",
          ),
        );
      }
    } finally {
      setSubmitting(false);
      if (btn) btn.disabled = false;
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await del.mutateAsync(existing.id);
      setDeleteConfirmOpen(false);
      onClose();
    } catch (error) {
      setDeleteError(
        getNetworkAwareActionMessage(
          error,
          "Rezervaci se nepodařilo smazat. Zkuste to znovu.",
          "Spojení vypadlo dřív, než se rezervace stihla smazat. Zkuste to znovu po obnovení připojení.",
        ),
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={isEdit ? "Upravit rezervaci" : "Nová rezervace"}
      maxWidth="max-w-lg"
      footer={
        <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
          {isEdit && (
            <button
              type="button"
              className="btn-danger"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deleting}
              style={{ marginRight: 'auto' }}
            >
              Smazat
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={submitting}
            style={!isEdit ? { marginLeft: 'auto' } : undefined}
          >
            Zrušit
          </button>
          <button
            type="submit"
            form="booking-form"
            className="btn-primary"
            disabled={submitting}
          >
            {submitting ? "Ukládám…" : isEdit ? "Uložit změny" : "Vytvořit rezervaci"}
          </button>
        </div>
      }
    >
        <form id="booking-form" onSubmit={handleSubmit}>
          <input type="hidden" value={existing?.id ?? ""} />

          {backupWarning && (
            <div className="backup-warning-message">
              V tomto termínu existuje jiná rezervace. Vaše bude uložena jako záložní.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label htmlFor="modal-date-from">Příjezd</label>
              <input
                ref={fromRef}
                id="modal-date-from"
                type="date"
                className={`form-control ${fieldErrors.from ? "is-invalid" : ""}`}
                value={from}
                onChange={(e) => {
                  if (submitError) setSubmitError(null);
                  if (fieldErrors.from) setFieldErrors(prev => ({ ...prev, from: undefined }));
                  setFrom(e.target.value);
                }}
                required
              />
              {fieldErrors.from && <span className="field-error-msg">{fieldErrors.from}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="modal-date-to">Odjezd</label>
              <input
                id="modal-date-to"
                type="date"
                className={`form-control ${fieldErrors.to ? "is-invalid" : ""}`}
                value={to}
                onChange={(e) => {
                  if (submitError) setSubmitError(null);
                  if (fieldErrors.to) setFieldErrors(prev => ({ ...prev, to: undefined }));
                  setTo(e.target.value);
                }}
                required
              />
              {fieldErrors.to && <span className="field-error-msg">{fieldErrors.to}</span>}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="purpose-input">Účel návštěvy</label>
            <input
              id="purpose-input"
              type="text"
              className={`form-control ${fieldErrors.purpose ? "is-invalid" : ""}`}
              value={purpose}
              onChange={(e) => {
                if (submitError) setSubmitError(null);
                if (fieldErrors.purpose) setFieldErrors(prev => ({ ...prev, purpose: undefined }));
                setPurpose(e.target.value);
              }}
              placeholder="Víkend, Dovolená…"
              maxLength={200}
            />
            {fieldErrors.purpose && <span className="field-error-msg">{fieldErrors.purpose}</span>}
          </div>

          {selectableMembers.length > 0 && (
            <div className="form-group">
              <label>
                Kdo jede s tebou?{" "}
                {participantIds.length > 0 && (
                  <span className="char-count">{participantIds.length} vybráno</span>
                )}
              </label>
              <div className="participant-picker" role="group" aria-label="Spolucestující">
                {selectableMembers.map((m) => {
                  const selected = participantIds.includes(m.id);
                  return (
                    <button
                      type="button"
                      key={m.id}
                      className={`participant-chip${selected ? " participant-chip--selected" : ""}`}
                      onClick={() => toggleParticipant(m.id)}
                      aria-pressed={selected}
                    >
                      <AnimalAvatar
                        icon={m.animalIcon ?? null}
                        username={m.username}
                        color={m.color || undefined}
                        size={22}
                      />
                      <span>{m.username}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="notes-textarea">
              Poznámka <span className="char-count">{notes.length}/1000</span>
            </label>
            <textarea
              id="notes-textarea"
              className="form-control"
              rows={3}
              value={notes}
              onChange={(e) => {
                if (submitError) setSubmitError(null);
                setNotes(e.target.value.slice(0, 1000));
              }}
              placeholder="Interní poznámka…"
            />
          </div>

          <div className="form-group">
            <label htmlFor="handover-notes-textarea">
              Vzkaz pro další <span className="char-count">{handover.length}/1000</span>
            </label>
            <textarea
              id="handover-notes-textarea"
              className="form-control"
              rows={3}
              value={handover}
              onChange={(e) => {
                if (submitError) setSubmitError(null);
                setHandover(e.target.value.slice(0, 1000));
              }}
              placeholder="Co necháváš dalším návštěvníkům…"
            />
          </div>

          <div className="space-y-3 mb-6 mt-4">
            <label className="block text-sm font-medium text-slate-700">Typ rezervace</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  if (submitError) setSubmitError(null);
                  setSoft(false);
                }}
                className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-colors ${
                  !soft
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${
                  !soft ? "bg-emerald-200 text-emerald-800" : "bg-slate-100 text-slate-500"
                }`}>
                  <Home size={18} />
                </div>
                <div>
                  <div className={`font-semibold text-sm ${!soft ? "text-emerald-900" : "text-slate-700"}`}>Pevná</div>
                  <div className={`text-[10px] leading-tight mt-0.5 ${!soft ? "text-emerald-700" : "text-slate-500"}`}>Závazný pobyt na chatě</div>
                </div>
              </button>
              
              <button
                type="button"
                onClick={() => {
                  if (submitError) setSubmitError(null);
                  setSoft(true);
                }}
                className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-colors ${
                  soft
                    ? "border-amber-500 bg-amber-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${
                  soft ? "bg-amber-200 text-amber-800" : "bg-slate-100 text-slate-500"
                }`}>
                  <CalendarClock size={18} />
                </div>
                <div>
                  <div className={`font-semibold text-sm ${soft ? "text-amber-900" : "text-slate-700"}`}>Předběžná</div>
                  <div className={`text-[10px] leading-tight mt-0.5 ${soft ? "text-amber-700" : "text-slate-500"}`}>Zatím blokuji termín</div>
                </div>
              </button>
            </div>
          </div>
          {submitError ? (
            <div className="error-message show" role="alert">{submitError}</div>
          ) : null}
        </form>
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Smazat rezervaci"
        message="Opravdu chcete smazat tuto rezervaci? Tato akce je nevratná."
        confirmLabel="Smazat"
        danger
        loading={deleting}
        errorMessage={deleteError}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setDeleteError(null);
        }}
      />
    </Modal>
  );
}
