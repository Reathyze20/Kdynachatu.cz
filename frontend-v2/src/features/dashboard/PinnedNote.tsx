import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { SquarePen } from "lucide-react";
import apiClient from "@/api/client";
import { showToast } from "@/lib/toast";
import { useAuth } from "@/context/AuthContext";
import { Modal } from "@/components/shared/Modal";
import { getNetworkAwareActionMessage } from "@/lib/networkError";
import { formatLongDate } from "@/lib/format";

interface Props {
  note: string | null;
  author: string | null;
  updatedAt: string | null;
  onNoteUpdate: (note: string | null, author?: string | null, updatedAt?: string | null) => void;
}

/**
 * Vzkaz na nástěnce (AppSettings.pinnedHandoverNote). Není to předávka pobytu
 * (checkoutState) ani per-rezervační handoverNote z formuláře rezervace.
 */
export function PinnedNote({ note, author, updatedAt, onNoteUpdate }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [draftText, setDraftText] = useState(note?.trim() ?? "");
  const [saveError, setSaveError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isGuest = user?.role === "guest";

  const saveMutation = useMutation({
    mutationFn: async (newNote: string) => {
      const res = await apiClient.patch<{
        pinnedHandoverNote: string | null;
        handoverNoteAuthor: string | null;
        handoverNoteUpdatedAt: string | null;
      }>("/workspace/handover-note", {
        note: newNote,
      });
      return res.data;
    },
    onSuccess: (data) => {
      onNoteUpdate(data.pinnedHandoverNote, data.handoverNoteAuthor, data.handoverNoteUpdatedAt);
      showToast("Vzkaz uložen.", "success");
      setModalOpen(false);
      setSaveError(null);
    },
    onError: (error) => {
      setSaveError(
        getNetworkAwareActionMessage(
          error,
          "Vzkaz se nepodařilo uložit. Zkus to znovu.",
          "Spojení vypadlo dřív, než se vzkaz stihl uložit. Zkus to znovu po obnovení připojení.",
        ),
      );
    },
  });

  const openModal = () => {
    setDraftText(note?.trim() ?? "");
    setSaveError(null);
    setModalOpen(true);
    // Focus textarea after render
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSaveError(null);
  };

  const noteText = note?.trim() ?? "";

  return (
    <>
      {noteText ? (
        <div className="glass-card dashboard-handover-card" id="dashboard-handover-note">
          <div className="card-body-full handover-card-content">
            <div className="dashboard-card-header">
              <span className="dashboard-card-header-title">Vzkaz</span>
              {!isGuest && (
                <button className="handover-edit-btn" id="btn-edit-handover" title="Upravit vzkaz" onClick={openModal}>
                  <SquarePen size={16} />
                </button>
              )}
            </div>
            <div className="handover-note-text">{noteText}</div>
            <div className="card-footer">
              <span className="card-footer-meta">
                {author && updatedAt
                  ? `— ${author}, ${formatLongDate(updatedAt)}`
                  : "Vzkaz pro návštěvníky"}
              </span>
              <a
                href="/notes"
                className="dashboard-card-header-link"
                onClick={(e) => { e.preventDefault(); navigate("/notes"); }}
              >
                Přejít do chatu →
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-card dashboard-card-compact" id="dashboard-handover-note">
          <div className="card-body-full">
            <div className="dashboard-compact-row">
              <SquarePen size={16} className="dashboard-compact-icon" />
              <span className="dashboard-compact-text">Nástěnka — žádný vzkaz</span>
              {!isGuest && (
                <button className="dashboard-compact-cta" id="btn-edit-handover" onClick={openModal}>
                  Napsat →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title="Vzkaz"
        footer={
          <div className="flex gap-2 justify-end w-full">
            <button className="button-secondary" onClick={closeModal}>Zrušit</button>
            <button
              className="button-primary"
              disabled={saveMutation.isPending}
              onClick={() => {
                setSaveError(null);
                saveMutation.mutate(draftText);
              }}
            >
              Uložit vzkaz
            </button>
          </div>
        }
      >
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 12, fontSize: '0.9rem' }}>
          Zanech vzkaz pro ostatní návštěvníky (max 300 znaků).
        </p>
        <textarea
          ref={textareaRef}
          className="handover-textarea"
          maxLength={300}
          placeholder="Napiš vzkaz…"
          rows={5}
          value={draftText}
          onChange={(e) => {
            if (saveError) setSaveError(null);
            setDraftText(e.target.value);
          }}
        />
        <div className="handover-char-counter">
          <span>{draftText.length}</span>/300
        </div>
        {saveError ? (
          <div className="error-message show" role="alert">{saveError}</div>
        ) : null}
      </Modal>
    </>
  );
}
