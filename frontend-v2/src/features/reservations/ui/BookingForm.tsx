import { useState, useEffect, useRef } from "react";
import type { Reservation } from "@/api/reservations";
import { useCreateReservation, useUpdateReservation, useDeleteReservation, useUsers, type BookingType } from "../hooks/useReservations";
import { useAuth } from "@/context/AuthContext";
import { AnimalAvatar } from "@/components/shared/AnimalAvatar";
import { showToast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Modal } from "@/components/shared/Modal";
import { getNetworkAwareActionMessage } from "@/lib/networkError";
import { extractSupportErrorDetails } from "@/lib/errorDetails";
import { isoRangesOverlap } from "@/lib/dateUtils";
import { Home, CalendarClock, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

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

/** Type the form starts with: a tentative stay stays tentative, anything else counts as firm. */
const initialType = (existing?: Reservation | null): BookingType => (existing?.status === "soft" ? "soft" : "primary");

/** Same limit as the API (`createReservationSchema`). */
const PURPOSE_MAX = 100;
/** Fields under the "Víc" disclosure; an error on any of them has to open it. */
const MORE_FIELDS = ["notes", "handoverNote", "status"];

/** "Víc" starts open when the edited stay already carries something it hides. */
const startsWithMoreOpen = (existing?: Reservation | null) =>
  !!existing && (!!existing.notes || !!existing.handoverNote || existing.status === "soft" || existing.status === "backup");

function validatePurpose(purpose: string): string | undefined {
  if (!purpose.trim()) return "Vyplňte účel návštěvy.";
  if (purpose.length > PURPOSE_MAX) return `Účel může mít nejvýš ${PURPOSE_MAX} znaků.`;
  return undefined;
}

export function BookingForm({ open, onClose, fromDate, toDate, existing, allReservations, onCreated }: Props) {
  const isEdit = !!existing;
  // Backup is assigned by the server on a collision; the user cannot pick it or switch away from it here.
  const isBackup = existing?.status === "backup";

  const [from, setFrom] = useState(fromDate ?? "");
  const [to, setTo] = useState(toDate ?? "");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [handover, setHandover] = useState("");
  const [bookingType, setBookingType] = useState<BookingType>("primary");
  const soft = bookingType === "soft";
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [backupWarning, setBackupWarning] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const fromRef = useRef<HTMLInputElement>(null);
  const purposeRef = useRef<HTMLInputElement>(null);

  const create = useCreateReservation();
  const update = useUpdateReservation();
  const del = useDeleteReservation();
  const { user } = useAuth();
  const { data: members } = useUsers();
  // Selectable co-occupants: everyone in the cabin except the organizer (current user)
  const selectableMembers = (members ?? []).filter((m) => m.id !== user?.userId);
  const me = members?.find((m) => m.id === user?.userId);

  const clearError = (field: string) => {
    if (submitError) setSubmitError(null);
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  /** Ties a field to its error message so a screen reader announces it with the field. */
  const errorProps = (field: string) =>
    fieldErrors[field] ? { "aria-invalid": true, "aria-describedby": `${field}-error` } : {};

  const showFieldErrors = (errors: Record<string, string>) => {
    setFieldErrors(errors);
    if (Object.keys(errors).some((f) => MORE_FIELDS.includes(f))) setMoreOpen(true);
  };

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
      setBookingType(initialType(existing));
      setParticipantIds(existing.participants?.map((p) => p.userId) ?? []);
    } else {
      setFrom(fromDate ?? "");
      setTo(toDate ?? "");
      setPurpose("");
      setNotes("");
      setHandover("");
      setBookingType("primary");
      setParticipantIds([]);
    }
    setBackupWarning(false);
    setSubmitError(null);
    setFieldErrors({});
    setDeleteError(null);
    setMoreOpen(startsWithMoreOpen(existing));
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
    const purposeError = validatePurpose(purpose);
    if (purposeError) {
      setSubmitError(null);
      showFieldErrors({ purpose: purposeError });
      purposeRef.current?.focus();
      return;
    }
    const btn = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      const payload = { from, to, purpose, notes, handoverNote: handover, participantIds };
      if (isEdit && existing) {
        // Send the type only when the user changed it, so an unrelated edit never re-checks collisions.
        const typeChanged = !isBackup && bookingType !== initialType(existing);
        await update.mutateAsync({ id: existing.id, payload: typeChanged ? { ...payload, status: bookingType } : payload });
        onClose();
      } else {
        const res = await create.mutateAsync({ ...payload, status: bookingType });
        onCreated?.(res.id);
        onClose();
      }
    } catch (error) {
      const errorDetails = extractSupportErrorDetails(error);
      const validationErrors = (error as { response?: { data?: { errors?: { path: string; message: string }[] } } })
        ?.response?.data?.errors;
      if (Array.isArray(validationErrors)) {
        const newFieldErrors: Record<string, string> = {};
        for (const err of validationErrors) {
          newFieldErrors[err.path] = err.message;
        }
        showFieldErrors(newFieldErrors);
      } else if (errorDetails.status === 409 && errorDetails.message) {
        // Firm stay collides with another firm one: the server says what to do instead.
        setSubmitError(errorDetails.message);
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
            <div className="backup-warning-message" role="status">
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
                  clearError("from");
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
                  clearError("to");
                  setTo(e.target.value);
                }}
                required
              />
              {fieldErrors.to && <span className="field-error-msg">{fieldErrors.to}</span>}
            </div>
          </div>

          <div className="form-group">
            <span id="booking-who-label" className="booking-field-label">Kdo jede</span>
            <div className="participant-picker" role="group" aria-labelledby="booking-who-label">
              {/* The organizer always goes and is never sent in participantIds. */}
              <span className="participant-chip participant-chip--selected participant-chip--locked" title="Organizátor, jedete vždy">
                <AnimalAvatar icon={me?.animalIcon ?? user?.animalIcon ?? null} username={me?.username ?? user?.username ?? ""} color={me?.color || undefined} size={22} />
                <span>Ty</span>
              </span>
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

          <div className="form-group">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="purpose-input">Účel návštěvy</label>
              <span className="booking-field-hint">povinné · {purpose.length}/{PURPOSE_MAX}</span>
            </div>
            <input
              ref={purposeRef}
              id="purpose-input"
              type="text"
              className={`form-control ${fieldErrors.purpose ? "is-invalid" : ""}`}
              value={purpose}
              onChange={(e) => {
                clearError("purpose");
                setPurpose(e.target.value);
              }}
              placeholder="Víkend, Dovolená…"
              aria-required="true"
              {...errorProps("purpose")}
            />
            {fieldErrors.purpose && <span id="purpose-error" className="field-error-msg">{fieldErrors.purpose}</span>}
          </div>

          <button
            type="button"
            className="booking-more-toggle"
            aria-expanded={moreOpen}
            aria-controls={moreOpen ? "booking-more" : undefined}
            onClick={() => setMoreOpen((v) => !v)}
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${moreOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            Víc — vzkaz, poznámka, typ
          </button>

          <AnimatePresence initial={false}>
          {moreOpen && (
          <motion.div
            id="booking-more"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
          <div className="form-group">
            <label htmlFor="notes-textarea">
              Poznámka <span className="char-count">{notes.length}/1000</span>
            </label>
            <textarea
              id="notes-textarea"
              className={`form-control ${fieldErrors.notes ? "is-invalid" : ""}`}
              rows={3}
              value={notes}
              onChange={(e) => {
                clearError("notes");
                setNotes(e.target.value.slice(0, 1000));
              }}
              placeholder="Interní poznámka…"
              {...errorProps("notes")}
            />
            {fieldErrors.notes && <span id="notes-error" className="field-error-msg">{fieldErrors.notes}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="handover-notes-textarea">
              Vzkaz pro dalšího <span className="char-count">{handover.length}/1000</span>
            </label>
            <textarea
              id="handover-notes-textarea"
              className={`form-control ${fieldErrors.handoverNote ? "is-invalid" : ""}`}
              rows={3}
              value={handover}
              onChange={(e) => {
                clearError("handoverNote");
                setHandover(e.target.value.slice(0, 1000));
              }}
              placeholder="Co necháváš dalším návštěvníkům…"
              {...errorProps("handoverNote")}
            />
            {fieldErrors.handoverNote && <span id="handoverNote-error" className="field-error-msg">{fieldErrors.handoverNote}</span>}
          </div>

          <div className="space-y-3 mb-6 mt-4" role="group" aria-labelledby="booking-type-label">
            <span id="booking-type-label" className="block text-sm font-medium text-slate-700">Typ rezervace</span>
            {isBackup ? (
              <p className="text-sm text-slate-600">Záložní – přidělil systém kvůli kolizi</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  aria-pressed={!soft}
                  onClick={() => {
                    clearError("status");
                    setBookingType("primary");
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
                  aria-pressed={soft}
                  onClick={() => {
                    clearError("status");
                    setBookingType("soft");
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
            )}
            {fieldErrors.status && <span className="field-error-msg">{fieldErrors.status}</span>}
          </div>
          </motion.div>
          )}
          </AnimatePresence>
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
