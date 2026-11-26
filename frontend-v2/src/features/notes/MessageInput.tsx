import { useRef, useState, useEffect } from "react";
import { ClipboardCheck, SendHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSendNote } from "./hooks/useNotes";
import type { Note } from "@/api/notes";
import { getNetworkAwareActionMessage, isNetworkError } from "@/lib/networkError";

const HANDOVER_ITEMS = [
  { key: "kamna", label: "Kamna: Popel vybrán, vyhasnuto" },
  { key: "drevo", label: "Dřevo: Třísky a polena pro dalšího připraveny" },
  { key: "jidlo", label: "Jídlo: Uklizeno (ochrana před myšmi)" },
  { key: "voda", label: "Voda: Kohoutky zavřeny, trubky vypuštěny" },
  { key: "zabezpeceni", label: "Zabezpečení: Okenice a dveře zajištěny" },
];

interface Props {
  activeThreadId: string | null;
  replyTo?: Note | null;
  onCancelReply?: () => void;
}

export function MessageInput({ activeThreadId, replyTo, onCancelReply }: Props) {
  const [message, setMessage] = useState("");
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverChecks, setHandoverChecks] = useState<Record<string, boolean>>(
    Object.fromEntries(HANDOVER_ITEMS.map((i) => [i.key, true])),
  );
  const [protocolNote, setProtocolNote] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendNote = useSendNote();

  // Auto-resize textarea
  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "36px";
    const newHeight = Math.min(ta.scrollHeight, 150);
    ta.style.height = newHeight + "px";
    ta.style.overflowY = ta.scrollHeight > 150 ? "auto" : "hidden";
  };

  const handleSend = async () => {
    const msg = message.trim();
    if (!msg) return;
    setSendError(null);
    try {
      await sendNote.mutateAsync({
        message: msg,
        threadId: activeThreadId,
        replyToId: replyTo?.id ?? null,
      });
      setMessage("");
      if (onCancelReply) onCancelReply();
      if (textareaRef.current) {
        textareaRef.current.style.height = "36px";
        textareaRef.current.style.overflowY = "hidden";
      }
    } catch (error) {
      if (isNetworkError(error)) return;
      setSendError(
        getNetworkAwareActionMessage(
          error,
          "Zprávu se nepodařilo odeslat. Zkus to znovu.",
          "Spojení vypadlo dřív, než se zpráva stihla odeslat. Zkus to znovu po obnovení připojení.",
        ),
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend();
  };

  // Build handover protocol text and insert into textarea
  const insertHandover = () => {
    const lines: string[] = ["Odjezdový protokol:", ""];
    HANDOVER_ITEMS.forEach((item) => {
      const checked = handoverChecks[item.key] ?? true;
      lines.push(`${checked ? "[x]" : "[ ]"} ${item.label}`);
    });
    if (protocolNote.trim()) {
      lines.push("");
      lines.push(`Poznámka: ${protocolNote.trim()}`);
    }
    const existing = message.trimEnd();
    const text = existing.length > 0
      ? existing + "\n\n" + lines.join("\n")
      : lines.join("\n");
    setSendError(null);
    setMessage(text);
    setHandoverOpen(false);
    setProtocolNote("");
    setHandoverChecks(Object.fromEntries(HANDOVER_ITEMS.map((i) => [i.key, true])));
    // Focus textarea
    setTimeout(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        autoResize();
      }
    }, 0);
  };

  const toggleCheck = (key: string) => {
    setHandoverChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Focus textarea when reply starts
  useEffect(() => {
    if (replyTo && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyTo]);

  return (
    <div className="chat-footer-wrapper" data-testid="notes-message-input">
      {/* Reply preview */}
      {replyTo && (
        <div className="reply-preview">
          <div className="reply-preview-content">
            <span className="reply-preview-author">{replyTo.username}</span>
            <span className="reply-preview-text">
              {replyTo.message.length > 80
                ? replyTo.message.slice(0, 80) + "…"
                : replyTo.message}
            </span>
          </div>
          <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Zrušit odpověď" onClick={onCancelReply}>
            <X aria-hidden="true" />
          </Button>
        </div>
      )}

      {/* Odjezdový protokol panel */}
      {handoverOpen && (
        <div className="handover-panel" id="handover-panel">
          <div className="handover-panel-header">
            <span>Odjezdový protokol</span>
            <Button type="button" variant="ghost" size="icon" id="handover-panel-close" aria-label="Zavřít odjezdový protokol"
              onClick={() => setHandoverOpen(false)}>
              <X aria-hidden="true" />
            </Button>
          </div>
          <div className="handover-checklist" id="handover-checklist">
            {HANDOVER_ITEMS.map((item) => (
              <label key={item.key} className="handover-item">
                <input
                  type="checkbox"
                  name={item.key}
                  checked={handoverChecks[item.key] ?? true}
                  onChange={() => toggleCheck(item.key)}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
          <div className="handover-note-row">
            <input
              type="text"
              id="handover-note-input"
              placeholder="Poznámka (volitelná)..."
              autoComplete="off"
              value={protocolNote}
              onChange={(e) => {
                if (sendError) setSendError(null);
                setProtocolNote(e.target.value);
              }}
            />
          </div>
          <div className="handover-panel-footer">
            <Button type="button" variant="secondary" id="handover-panel-cancel" onClick={() => setHandoverOpen(false)}>
              Zrušit
            </Button>
            <Button type="button" id="handover-panel-insert" onClick={insertHandover}>
              Vložit do zprávy
            </Button>
          </div>
        </div>
      )}

      {/* Chip action buttons above input */}
      <div className="chat-actions-row">
        <Button type="button" variant="secondary" size="sm" aria-expanded={handoverOpen} aria-controls="handover-panel"
          onClick={() => setHandoverOpen((o) => !o)} data-testid="notes-handover-toggle-button">
          <ClipboardCheck aria-hidden="true" />
          Odjezdový protokol
        </Button>
      </div>

      <div className="chat-input-row">
        {/* Bílá pilulka */}
        <form
          className="fake-input-wrapper pill-shape"
          noValidate
          onSubmit={handleFormSubmit}
          data-testid="notes-message-form"
        >
          <textarea
            ref={textareaRef}
            className="transparent-text-input"
            placeholder="Napiš zprávu…"
            rows={1}
            maxLength={2000}
            required
            value={message}
            onChange={(e) => {
              if (sendError) setSendError(null);
              setMessage(e.target.value);
              autoResize();
            }}
            onKeyDown={handleKeyDown}
            data-testid="notes-message-textarea"
          />
          {/* Kulaté odesílací tlačítko v pilulce: tvar drží .send-message-btn, spinner a blokaci Button pending */}
          <Button type="submit" size="icon" className="send-message-btn" aria-label="Odeslat" pending={sendNote.isPending}
            data-testid="notes-send-button">
            {!sendNote.isPending && <SendHorizontal aria-hidden="true" />}
          </Button>
        </form>
      </div>
      {sendError ? (
        <div className="error-message show" role="alert">{sendError}</div>
      ) : null}
    </div>
  );
}
