import { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { KeyRound, SendHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { isFeatureEnabled, useCabinFeatures } from "@/hooks/useCabinFeatures";
import { useSendNote } from "./hooks/useNotes";
import type { Note } from "@/api/notes";
import { getNetworkAwareActionMessage, isNetworkError } from "@/lib/networkError";

interface Props {
  activeThreadId: string | null;
  replyTo?: Note | null;
  onCancelReply?: () => void;
}

export function MessageInput({ activeThreadId, replyTo, onCancelReply }: Props) {
  const [message, setMessage] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendNote = useSendNote();
  const { isGuest } = useAuth();
  const { data: cabin } = useCabinFeatures();
  // Předat chatu jde jen na záložce Předávka (#517); host ji nevidí (403, #216) a bez rezervací záložka není.
  const showHandoverLink = !isGuest && isFeatureEnabled(cabin?.features, "reservations");

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

      {showHandoverLink && (
        <div className="chat-actions-row">
          <Button asChild variant="secondary" size="sm">
            <Link to="/handover">
              <KeyRound aria-hidden="true" />
              Předat chatu
            </Link>
          </Button>
        </div>
      )}

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
