/**
 * NoteSheet — vzkaz z nástěnky ke čtení a úpravě (#702), otevře ho řádek Vzkaz v bloku „Důležité“.
 * Na mobilu bottom sheet (Modal). Ukládá stejně jako karta Vzkaz (PATCH /workspace/handover-note).
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import apiClient from "@/api/client";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatLongDate } from "@/lib/format";
import { handleMutationError } from "@/lib/mutationError";
import { showToast } from "@/lib/toast";

/** Limit serveru (updateHandoverNoteSchema). */
const NOTE_MAX_LENGTH = 300;

type Note = { pinnedHandoverNote: string | null; handoverNoteAuthor: string | null; handoverNoteUpdatedAt: string | null };

interface Props {
  note: Note;
  onClose: () => void;
  onSaved: (note: string | null, author: string | null, updatedAt: string | null) => void;
}

export function NoteSheet({ note, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState(note.pinnedHandoverNote?.trim() ?? "");
  const save = useMutation({
    mutationFn: (text: string) => apiClient.patch<Note>("/workspace/handover-note", { note: text }).then((r) => r.data),
    onSuccess: (data) => {
      onSaved(data.pinnedHandoverNote, data.handoverNoteAuthor, data.handoverNoteUpdatedAt);
      showToast("Vzkaz uložen.", "success");
      onClose();
    },
    onError: handleMutationError("Vzkaz se nepodařilo uložit"),
  });

  return (
    <Modal isOpen onClose={onClose} title="Vzkaz" maxWidth="max-w-md" footer={
      <div className="flex w-full justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Zrušit</Button>
        <Button pending={save.isPending} onClick={() => save.mutate(draft)}>Uložit vzkaz</Button>
      </div>
    }>
      {note.handoverNoteAuthor && note.handoverNoteUpdatedAt && (
        <p className="mb-3 text-meta text-(--text-muted)">{note.handoverNoteAuthor}, {formatLongDate(note.handoverNoteUpdatedAt)}</p>
      )}
      <Textarea aria-label="Vzkaz" maxLength={NOTE_MAX_LENGTH} rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} />
      <p className="mt-1 text-right text-meta text-(--text-muted)">{draft.length}/{NOTE_MAX_LENGTH}</p>
    </Modal>
  );
}
