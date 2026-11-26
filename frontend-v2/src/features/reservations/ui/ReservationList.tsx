import { useState, useMemo, useRef, useEffect } from "react";
import { CalendarCheck, ChevronDown, EllipsisVertical, PenLine, Pencil, Trash2, X } from "lucide-react";
import type { Reservation } from "@/api/reservations";
import { motion, AnimatePresence } from "framer-motion";
import { Modal } from "@/components/shared/Modal";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ListRow } from "@/components/shared/ListRow";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate, formatShortDate, monthName } from "@/lib/format";
import { MONTH_NAMES, cn } from "@/lib/utils";
import { useMonthlyNote, useUpdateMonthlyNote } from "../hooks/useReservations";
import { AnimalAvatar } from "@/components/shared/AnimalAvatar";
import { getNetworkAwareActionMessage } from "@/lib/networkError";
import { nightsBetween, nightsLabel } from "@/lib/dateUtils";
import { RESERVATION_TYPE_LABEL } from "../reservationType";
import css from "../Reservations.module.css";

const NOTE_MAX_LENGTH = 180;

// ── Month/year picker dropdown ──────────────────────────────────────
function MonthPicker({
  month,
  year,
  onSelect,
  onClose,
}: {
  month: number;
  year: number;
  onSelect: (m: number, y: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pickerYear, setPickerYear] = useState(year);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.15 }}
      className="absolute top-full left-0 mt-2 z-(--z-dropdown) bg-sheet rounded-xl shadow-lift border border-rule-soft p-3 w-64"
    >
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          className="inline-flex size-(--touch-target-min) items-center justify-center rounded-lg text-body font-bold text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-main)"
          onClick={() => setPickerYear((y) => y - 1)}
          aria-label="Předchozí rok"
        >
          ‹
        </button>
        <span className="text-card-title text-(--text-main)">{pickerYear}</span>
        <button
          type="button"
          className="inline-flex size-(--touch-target-min) items-center justify-center rounded-lg text-body font-bold text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-main)"
          onClick={() => setPickerYear((y) => y + 1)}
          aria-label="Další rok"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {MONTH_NAMES.map((name, i) => {
          const isActive = i === month && pickerYear === year;
          return (
            <button
              key={i}
              type="button"
              onClick={() => { onSelect(i, pickerYear); onClose(); }}
              className={`min-h-(--touch-target-min) rounded-lg px-1 py-2 text-label transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-(--text-muted) hover:bg-accent hover:text-primary"
              }`}
            >
              {name.slice(0, 3)}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Main component ──────────────────────────────────────────────────

interface Props {
  reservations: Reservation[];
  allReservations?: Reservation[];
  futureReservations?: Reservation[];
  month: number;
  year: number;
  onMonthChange: (month: number, year: number) => void;
  onShowDetail: (r: Reservation) => void;
  selectedDay?: string | null;
  onClearDayFilter?: () => void;
  /** Vybraný volný den → rezervace od toho dne (#506) */
  onBookFromDay?: (day: string) => void;
  /** Host poznámku k měsíci nevidí (#484) */
  hideMonthlyNote?: boolean;
  /** Smí uživatel pobyt upravit a smazat? Bez něj řádky kebab menu nemají (#460). */
  canManage?: (r: Reservation) => boolean;
  onEdit?: (r: Reservation) => void;
  onDelete?: (id: string) => Promise<void> | void;
}

export function ReservationList({
  reservations,
  futureReservations = [],
  month,
  year,
  onMonthChange,
  onShowDetail,
  selectedDay,
  onClearDayFilter,
  onBookFromDay,
  hideMonthlyNote = false,
  canManage,
  onEdit,
  onDelete,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteSaveError, setNoteSaveError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "upcoming">("month");
  const [deleteTarget, setDeleteTarget] = useState<Reservation | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Reset view to month when user navigates to a different month
  const prevMonthRef = useRef(`${year}-${month}`);
  useEffect(() => {
    const key = `${year}-${month}`;
    if (prevMonthRef.current !== key) {
      prevMonthRef.current = key;
      setViewMode("month");
    }
  }, [year, month]);

  const {
    data: monthlyNote,
    isError: monthlyNoteFailed,
    refetch: refetchMonthlyNote,
  } = useMonthlyNote(year, month, !hideMonthlyNote);
  const updateNote = useUpdateMonthlyNote();

  // Vybraný den filtruje vždy, i když zůstala zapnutá záložka Nadcházející.
  const sourceList = viewMode === "upcoming" && !selectedDay ? futureReservations : reservations;

  const sorted = useMemo(
    () => [...sourceList].sort((a, b) => new Date(a.from).getTime() - new Date(b.from).getTime()),
    [sourceList],
  );

  const openNoteModal = () => {
    setNoteSaveError(null);
    setNoteText(monthlyNote?.text ?? "");
    setNoteModalOpen(true);
  };

  const handleSaveNote = async () => {
    setNoteSaveError(null);
    try {
      await updateNote.mutateAsync({ year, month, text: noteText.trim() });
      setNoteModalOpen(false);
    } catch (error) {
      setNoteSaveError(
        getNetworkAwareActionMessage(
          error,
          "Poznámku se nepodařilo uložit. Zkus to znovu.",
          "Spojení vypadlo dřív, než se poznámka stihla uložit. Zkus to znovu po obnovení připojení.",
        ),
      );
    }
  };

  // Mazání s potvrzením není optimistické: řádek zmizí, až server potvrdí (DESIGN.md §7).
  const handleConfirmedDelete = async () => {
    if (!deleteTarget || !onDelete) return;
    setDeleteSubmitting(true);
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Chybu ohlásí toast mutace (lib/mutationError.ts), dialog zůstane otevřený pro nový pokus.
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handlePrevMonth = () => {
    if (month === 0) onMonthChange(11, year - 1);
    else onMonthChange(month - 1, year);
  };

  const handleNextMonth = () => {
    if (month === 11) onMonthChange(0, year + 1);
    else onMonthChange(month + 1, year);
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── A. Compact month navigator ── */}
      <div className="relative">
        <div className={css.monthNav}>
          <button type="button" className={css.monthNavArrow} onClick={handlePrevMonth} aria-label="Předchozí měsíc">‹</button>
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className={css.monthNavLabel}
          >
            {MONTH_NAMES[month]} {year}
            <ChevronDown
              size={16}
              className={`${css.monthNavChevron} ${pickerOpen ? css.monthNavChevronOpen : ""}`}
            />
          </button>
          <button type="button" className={css.monthNavArrow} onClick={handleNextMonth} aria-label="Další měsíc">›</button>
        </div>
        <AnimatePresence>
          {pickerOpen && (
            <MonthPicker
              month={month}
              year={year}
              onSelect={onMonthChange}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── B. Separator ── */}
      <div className={css.statsSection} />

      {/* ── C. View mode tab toggle ── */}
      {!selectedDay && (
        <div className={css.viewTabs}>
          <button
            type="button"
            className={`${css.viewTab} ${viewMode === "month" ? css.viewTabActive : ""}`}
            onClick={() => setViewMode("month")}
          >
            {MONTH_NAMES[month]} {year}
          </button>
          <button
            type="button"
            className={`${css.viewTab} ${viewMode === "upcoming" ? css.viewTabActive : ""}`}
            onClick={() => setViewMode("upcoming")}
          >
            Nadcházející
          </button>
        </div>
      )}

      {/* Day filter chip */}
      <AnimatePresence>
        {selectedDay && (
          <motion.div
            key="day-chip"
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={css.dayFilterChip}
          >
            <span className={css.dayFilterChipText}>
              Rezervace pro {formatDate(selectedDay)}
            </span>
            <button
              type="button"
              className={css.dayFilterChipClose}
              onClick={onClearDayFilter}
              aria-label="Zrušit filtr dne"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {sorted.length === 0 && selectedDay ? (
          <EmptyState
            icon={CalendarCheck}
            message={`${formatShortDate(selectedDay)} je volno.`}
            action={onBookFromDay && { label: `Zarezervovat od ${formatShortDate(selectedDay)}`, onClick: () => onBookFromDay(selectedDay) }}
          />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            message={viewMode === "upcoming" ? "Nejsou naplánované žádné nadcházející pobyty." : "V tomto měsíci nejsou naplánované žádné pobyty."}
          />
        ) : (
          <ul className="divide-y divide-rule-soft">
            {sorted.map((r) => {
              const manageable = canManage?.(r) ?? false;
              return (
                <ReservationRow
                  key={r.id}
                  reservation={r}
                  onClick={onShowDetail}
                  onEdit={manageable ? onEdit : undefined}
                  onAskDelete={manageable && onDelete ? setDeleteTarget : undefined}
                />
              );
            })}
          </ul>
        )}
      </div>

      {/* ── D. Monthly note (host ji nevidí, #484) ── */}
      {!hideMonthlyNote && <div className={css.noteSection}>
        <div className={css.noteHeader}>
          <h4 className={css.sectionHeading} style={{ margin: 0 }}>
            Poznámka k {monthName(month, "dative")}
          </h4>
          {monthlyNoteFailed ? (
            <button
              type="button"
              onClick={() => {
                void refetchMonthlyNote();
              }}
              className={`${css.btnReset} ${css.noteEditBtn}`}
              title="Načíst poznámku znovu"
            >
              Znovu
            </button>
          ) : (
            <button
              type="button"
              onClick={openNoteModal}
              className={`${css.btnReset} ${css.noteEditBtn}`}
              title="Upravit poznámku"
            >
              <PenLine size={16} />
            </button>
          )}
        </div>
        <div
          className={css.noteBox}
          onClick={monthlyNoteFailed ? undefined : openNoteModal}
          style={monthlyNoteFailed ? { cursor: 'default' } : undefined}
        >
          {monthlyNoteFailed ? (
            <p className={css.notePlaceholder}>Poznámku k měsíci se nepodařilo načíst.</p>
          ) : monthlyNote?.text ? (
            <p>&ldquo;{monthlyNote.text}&rdquo;</p>
          ) : (
            <p className={css.notePlaceholder}>Přidat vzkaz k tomuto měsíci pro ostatní…</p>
          )}
        </div>
      </div>}

      {/* ── Note edit modal ── */}
      <Modal
        isOpen={noteModalOpen}
        onClose={() => {
          setNoteModalOpen(false);
          setNoteSaveError(null);
        }}
        title={`Poznámka k měsíci — ${MONTH_NAMES[month]} ${year}`}
        maxWidth="max-w-md"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className={cn("text-meta", noteText.length > NOTE_MAX_LENGTH ? "font-semibold text-(--status-error-dark)" : "text-(--text-muted)")}>
              {noteText.length}/{NOTE_MAX_LENGTH}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setNoteModalOpen(false)}>
                Zrušit
              </Button>
              <Button disabled={noteText.length > NOTE_MAX_LENGTH} pending={updateNote.isPending} onClick={handleSaveNote}>
                {updateNote.isPending ? "Ukládám…" : "Uložit"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-label text-(--text-muted)">
            Tuto poznámku uvidí všichni členové chaty. Můžeš ji kdykoliv upravit.
          </p>
          <textarea
            value={noteText}
            onChange={(e) => {
              if (noteSaveError) setNoteSaveError(null);
              setNoteText(e.target.value);
            }}
            maxLength={NOTE_MAX_LENGTH + 20}
            rows={3}
            placeholder={'Např. „V březnu přijede instalatér 15.–16., buďte prosím doma."'}
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-body text-(--text-main) placeholder:text-(--text-placeholder) focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
          {noteSaveError ? (
            <div className="error-message show" role="alert">{noteSaveError}</div>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Smazat rezervaci"
        message="Opravdu chceš smazat tuto rezervaci? Tato akce je nevratná."
        confirmLabel="Smazat"
        danger
        loading={deleteSubmitting}
        onConfirm={() => void handleConfirmedDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ── Reservation row sub-component ───────────────────────────────────

/** Pevná plně, předběžná obrysem, záložní (#209). */
const TYPE_CLASS = { primary: css.typeFirm, soft: css.typeSoft, backup: css.typeBackup } as const;

function ReservationRow({
  reservation: r,
  onClick,
  onEdit,
  onAskDelete,
}: {
  reservation: Reservation;
  onClick: (r: Reservation) => void;
  onEdit?: (r: Reservation) => void;
  onAskDelete?: (r: Reservation) => void;
}) {
  const isPast = new Date(r.to + "T00:00:00") < new Date();
  const nights = nightsBetween(r.from, r.to);
  // Tvar „14. 6. – 19. 6.“ drží test reservationCards; formatDateRange by dal „14.–19. 6.“ (DESIGN.md §9); změnu tvaru i testu rozhodne člověk, viz PR k #456.
  const dateLabel = `${formatShortDate(r.from)} – ${formatShortDate(r.to)}`;
  const status = r.status ?? "primary";

  // Celý řádek otevře detail i klávesnicí: plocha tlačítka (after:) je roztažená přes řádek.
  const openDetail = (
    <button
      type="button"
      className="flex w-full items-center gap-3 text-left after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-ring"
      data-testid="reservation-list-item"
      data-reservation-id={r.id}
      data-reservation-status={r.status}
      onClick={() => onClick(r)}
    >
      {/* Avatar je jen ozdoba, jméno nese řádek „kdo" */}
      <span className={css.cardAvatar} aria-hidden="true">
        <AnimalAvatar icon={r.userAnimalIcon} username={r.username} color={r.userColor || undefined} size={52} />
      </span>

      <span className={css.cardContent}>
        <span className={css.cardTopRow}>
          <span className={css.cardTitle}>{r.purpose || "Bez názvu"}</span>
          <span className={TYPE_CLASS[status]}>{RESERVATION_TYPE_LABEL[status]}</span>
        </span>
        <span className={css.cardMeta}>
          {dateLabel}{nights > 0 && ` · ${nights} ${nightsLabel(nights)}`}
        </span>
        <span className={css.cardWho}>{r.username}</span>
      </span>
    </button>
  );

  return (
    <ListRow
      as="li"
      className={cn("relative px-0 md:px-0", isPast && css.cardPast)}
      action={(onEdit || onAskDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* relative: kebab leží nad roztaženou plochou tlačítka řádku */}
            <Button variant="ghost" size="icon" className="relative" aria-label={`Akce s rezervací ${r.username}, ${dateLabel}`}>
              <EllipsisVertical aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {onEdit && <DropdownMenuItem onSelect={() => onEdit(r)}><Pencil aria-hidden="true" />Upravit</DropdownMenuItem>}
            {onEdit && onAskDelete && <DropdownMenuSeparator />}
            {onAskDelete && (
              <DropdownMenuItem variant="danger" onSelect={() => onAskDelete(r)}><Trash2 aria-hidden="true" />Smazat</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    >
      {openDetail}
    </ListRow>
  );
}
