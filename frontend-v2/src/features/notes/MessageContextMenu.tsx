import { useEffect, useLayoutEffect, useRef, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Hammer, Pencil, Pin, PinOff, Reply, ShoppingCart, Trash2 } from "lucide-react";
import type { Note } from "@/api/notes";

const REACTION_EMOJI = ["👍", "❤️", "😂", "✅"] as const;

const EDIT_TIME_LIMIT_MS = 15 * 60 * 1000;

interface Props {
  note: Note | null;
  anchorRect: DOMRect | null;
  isMine: boolean;
  isGuest: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onPin: () => void;
  onAddToShopping: () => void;
  onCreateRepair: () => void;
  onDelete: () => void;
}

export function MessageContextMenu({
  note,
  anchorRect,
  isMine,
  isGuest,
  isAdmin,
  onClose,
  onReact,
  onReply,
  onCopy,
  onEdit,
  onPin,
  onAddToShopping,
  onCreateRepair,
  onDelete,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Capture "now" once when the menu opens (via effect), to avoid impure Date.now() in render
  const [openedAt, setOpenedAt] = useState<number>(0);
  useEffect(() => {
    if (note) setOpenedAt(Date.now());
  }, [note]);

  const canEdit = useMemo(() => {
    if (!note || !openedAt) return false;
    if (!isMine || note.isResolvedAsTask) return false;
    return (openedAt - new Date(note.createdAt).getTime()) < EDIT_TIME_LIMIT_MS;
  }, [note, isMine, openedAt]);

  const myReactions = useMemo(() => new Set(
    (note?.reactions ?? []).filter((r) => r.reacted).map((r) => r.emoji)
  ), [note?.reactions]);

  // Close on Escape or click outside
  useEffect(() => {
    if (!note) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleScroll = () => onClose();

    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick, true);
    // Close on scroll of the chat messages area
    const chatMessages = document.querySelector(".chat-messages");
    chatMessages?.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick, true);
      chatMessages?.removeEventListener("scroll", handleScroll);
    };
  }, [note, onClose]);

  if (!note || !anchorRect) return null;

  const canPin = !isGuest;
  const canDelete = isAdmin || isMine;
  const canDoActions = !isGuest && !note.isResolvedAsTask;

  return (
    <AnimatePresence>
      <div key="backdrop" className="context-menu-backdrop" />
      <PositionedMenu
        key="menu"
        menuRef={menuRef}
        anchorRect={anchorRect}
        isMine={isMine}
      >
        {/* Reaction row */}
        <div className="context-menu-reactions">
          {REACTION_EMOJI.map((emoji) => (
            <button
              key={emoji}
              className={`context-menu-reaction-btn${myReactions.has(emoji) ? " active" : ""}`}
              aria-pressed={myReactions.has(emoji)}
              onClick={() => { onReact(emoji); onClose(); }}
            >
              {emoji}
            </button>
          ))}
        </div>

        <div className="context-menu-divider" />

        {/* Actions */}
        <button className="context-menu-item" onClick={() => { onReply(); onClose(); }}>
          <Reply className="menu-icon" aria-hidden="true" />
          <span>Odpovědět</span>
        </button>

        <button className="context-menu-item" onClick={() => { onCopy(); onClose(); }}>
          <Copy className="menu-icon" aria-hidden="true" />
          <span>Kopírovat text</span>
        </button>

        {canEdit && (
          <button className="context-menu-item" onClick={() => { onEdit(); onClose(); }}>
            <Pencil className="menu-icon" aria-hidden="true" />
            <span>Upravit</span>
          </button>
        )}

        {canPin && (
          <button className="context-menu-item" onClick={() => { onPin(); onClose(); }}>
            {note.isPinned ? <PinOff className="menu-icon" aria-hidden="true" /> : <Pin className="menu-icon" aria-hidden="true" />}
            <span>{note.isPinned ? "Odepnout" : "Připnout"}</span>
          </button>
        )}

        {canDoActions && (
          <>
            <div className="context-menu-divider" />
            <button className="context-menu-item" onClick={() => { onAddToShopping(); onClose(); }}>
              <ShoppingCart className="menu-icon" aria-hidden="true" />
              <span>Do nákupu</span>
            </button>
            <button className="context-menu-item" onClick={() => { onCreateRepair(); onClose(); }}>
              <Hammer className="menu-icon" aria-hidden="true" />
              <span>Nový úkol</span>
            </button>
          </>
        )}

        {canDelete && (
          <>
            <div className="context-menu-divider" />
            <button className="context-menu-item context-menu-item-danger" onClick={() => { onDelete(); onClose(); }}>
              <Trash2 className="menu-icon" aria-hidden="true" />
              <span>Smazat</span>
            </button>
          </>
        )}
      </PositionedMenu>
    </AnimatePresence>
  );
}

/** Measures its own height after mount, positions above or below anchor */
function PositionedMenu({
  menuRef,
  anchorRect,
  isMine,
  children,
}: {
  menuRef: React.RefObject<HTMLDivElement | null>;
  anchorRect: DOMRect;
  isMine: boolean;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; origin: string; maxHeight?: number } | null>(null);

  const measure = useCallback(() => {
    const el = menuRef.current;
    if (!el) return;

    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const menuH = el.offsetHeight;
    const menuW = el.offsetWidth;
    const gap = 8;

    const spaceAbove = anchorRect.top - gap;
    const spaceBelow = vh - anchorRect.bottom - gap;

    let top: number;
    let above: boolean;

    if (spaceBelow >= menuH) {
      // Fits below
      top = anchorRect.bottom + gap;
      above = false;
    } else if (spaceAbove >= menuH) {
      // Fits above
      top = anchorRect.top - gap - menuH;
      above = true;
    } else {
      // Neither fits perfectly — pick whichever has more room, and clamp
      above = spaceAbove > spaceBelow;
      top = above
        ? Math.max(gap, anchorRect.top - gap - menuH)
        : anchorRect.bottom + gap;
    }

    // Celé menu ve viewportu (#508): bublina může přesahovat okraj obrazovky
    // a menu vyšší než obrazovka dostane omezenou výšku s posuvníkem.
    const maxHeight = menuH > vh - 2 * gap ? vh - 2 * gap : undefined;
    top = Math.min(Math.max(gap, top), vh - gap - (maxHeight ?? menuH));

    let left = isMine ? anchorRect.right - menuW : anchorRect.left;
    left = Math.max(gap, Math.min(left, vw - menuW - gap));

    const origin = above
      ? (isMine ? "bottom right" : "bottom left")
      : (isMine ? "top right" : "top left");

    setPos({ top, left, origin, maxHeight });
  }, [anchorRect, isMine, menuRef]);

  // Measure after first paint
  useLayoutEffect(() => {
    measure();
  }, [measure]);

  return (
    <motion.div
      ref={menuRef}
      className="message-context-menu"
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? "visible" : "hidden",
        transformOrigin: pos?.origin ?? "top left",
        ...(pos?.maxHeight !== undefined ? { maxHeight: pos.maxHeight, overflowY: "auto" as const } : {}),
      }}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
