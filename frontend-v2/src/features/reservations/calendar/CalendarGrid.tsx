import { useMemo, useState } from "react";
import { getDaysInMonth, getDay, format } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { CalendarCell } from "./CalendarCell";
import type { Reservation, UserAvailability } from "@/api/reservations";
import styles from "../Reservations.module.css";

const MONTH_NAMES = [
  "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
];
const MONTH_NAMES_GENITIVE = [
  "ledna", "února", "března", "dubna", "května", "června",
  "července", "srpna", "září", "října", "listopadu", "prosince",
];
const WEEKDAY_LABELS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const TOTAL_CELLS = 42;

function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Format "2026-03-21" → "21. března" */
function formatCzechDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()}. ${MONTH_NAMES_GENITIVE[d.getMonth()]}`;
}

interface CalendarGridProps {
  month: number;
  year: number;
  reservations: Reservation[];
  availabilities: UserAvailability[];
  currentUserId: string;
  selectedDay?: string | null;
  /** Reservation whose detail is open in the side panel — marked in the grid. */
  selectedReservationId?: string | null;
  rangeStart: string | null;
  onGoToPrev: () => void;
  onGoToNext: () => void;
  onRangeStartSet: (date: string) => void;
  onRangeClear: () => void;
  onRangeComplete: (from: string, to: string) => void;
  onShowDetail: (r: Reservation) => void;
  onShowMonthList: () => void;
  onDaySelect: (dateStr: string) => void;
  onDayClear?: () => void;
  quickStatsNode?: React.ReactNode;
  /** „Nová rezervace" in the header — opens an empty booking form (no button without it). */
  onNewReservation?: () => void;
}

export function CalendarGrid({
  month,
  year,
  reservations,
  availabilities,
  currentUserId,
  selectedDay,
  selectedReservationId = null,
  rangeStart,
  onGoToPrev,
  onGoToNext,
  onRangeStartSet,
  onRangeClear,
  onRangeComplete,
  onShowDetail,
  onShowMonthList,
  onDaySelect,
  onDayClear,
  quickStatsNode,
  onNewReservation,
}: CalendarGridProps) {
  const [rangeHoverDate, setRangeHoverDate] = useState<string | null>(null);

  const cells = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    const totalDays = getDaysInMonth(firstOfMonth);
    let startOffset = getDay(firstOfMonth) - 1;
    if (startOffset === -1) startOffset = 6;

    const items: { date: Date; isOtherMonth: boolean }[] = [];

    for (let i = 0; i < startOffset; i++) {
      const dayNum = new Date(year, month, 0).getDate() - startOffset + i + 1;
      items.push({ date: new Date(year, month - 1, dayNum), isOtherMonth: true });
    }

    for (let d = 1; d <= totalDays; d++) {
      items.push({ date: new Date(year, month, d), isOtherMonth: false });
    }

    const trailing = TOTAL_CELLS - items.length;
    for (let d = 1; d <= trailing; d++) {
      items.push({ date: new Date(year, month + 1, d), isOtherMonth: true });
    }

    return items;
  }, [month, year]);

  const todayMidnight = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const handleCellClick = (dateStr: string, isOtherMonth: boolean) => {
    const date = new Date(dateStr + "T00:00:00");
    if (date < todayMidnight) return;

    if (!rangeStart) {
      if (isOtherMonth) return;
      if (selectedDay !== dateStr) {
        onDaySelect(dateStr);
        return;
      }
      onRangeStartSet(dateStr);
    } else {
      if (dateStr === rangeStart) {
        onRangeClear();
        setRangeHoverDate(null);
      } else if (dateStr < rangeStart) {
        if (isOtherMonth) return;
        onRangeClear();
        setRangeHoverDate(null);
        onRangeStartSet(dateStr);
      } else {
        const start = rangeStart;
        onRangeClear();
        setRangeHoverDate(null);
        onRangeComplete(start, dateStr);
      }
    }
  };

  const rangeTitle = rangeStart
    ? `Příjezd: ${formatCzechDate(rangeStart)} — vyber odjezd`
    : selectedDay
      ? `Vybraný den: ${formatCzechDate(selectedDay)}`
      : "Vyber den v kalendáři";

  // Formulace bez směrových odkazů — seznam rezervací je na desktopu vpravo,
  // na mobilu pod kalendářem.
  const rangeDescription = rangeStart
    ? "Druhé klepnutí na pozdější den potvrdí odjezd."
    : selectedDay
      ? "Seznam rezervací teď ukazuje jen zvolený den. Dalším klepnutím na stejný den začneš novou rezervaci."
      : "První klepnutí zobrazí rezervace pro konkrétní den. Druhým klepnutím na stejný den začneš vybírat pobyt.";

  const handleHover = (dateStr: string) => {
    if (rangeStart && dateStr > rangeStart) {
      setRangeHoverDate(dateStr);
    }
  };

  const handleGridMouseLeave = () => {
    setRangeHoverDate(null);
  };

  return (
    <div className={styles.calendarCard}>
      {/* Header */}
      <div className={styles.calendarHeaderBar}>
        <div className={styles.calendarNav}>
          <button className={styles.iconButton} onClick={onGoToPrev} aria-label="Předchozí měsíc" title="Předchozí měsíc">
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <h2 className={styles.calendarTitle}>
            {MONTH_NAMES[month]} {year}
          </h2>
          <button className={styles.iconButton} onClick={onGoToNext} aria-label="Další měsíc" title="Další měsíc">
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className={styles.calendarStats}>
          {rangeStart || selectedDay ? (
            <div className={styles.selectionChip} data-testid="calendar-selection-chip">
              <span className={styles.selectionChipText}>{rangeTitle}</span>
              <button
                type="button"
                className={styles.selectionChipClear}
                aria-label="Zrušit výběr"
                title="Zrušit výběr"
                onClick={() => {
                  if (rangeStart) {
                    onRangeClear();
                    setRangeHoverDate(null);
                  } else {
                    onDayClear?.();
                  }
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ) : quickStatsNode}
        </div>
        {onNewReservation ? (
          <button type="button" className={`btn-primary ${styles.newReservationButton}`} onClick={onNewReservation} data-testid="reservation-create-button">
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span className="max-md:sr-only">Nová rezervace</span>
          </button>
        ) : null}
      </div>

      {/* Calendar grid */}
      <div className={styles.calendarGridScroller}>
        <div className={styles.calendarGrid}>
          <div className={styles.calWeekdays}>
            {WEEKDAY_LABELS.map((d) => (
              <div key={d} className={styles.calWeekday}>{d}</div>
            ))}
          </div>
          <div
            className={rangeStart ? styles.calDaysSelecting : styles.calDays}
            onMouseLeave={handleGridMouseLeave}
          >
            {cells.map(({ date, isOtherMonth }) => {
              const dateStr = toDateStr(date);
              return (
                <CalendarCell
                  key={dateStr + (isOtherMonth ? "-o" : "")}
                  date={date}
                  dateStr={dateStr}
                  isOtherMonth={isOtherMonth}
                  todayMidnight={todayMidnight}
                  reservations={reservations}
                  availabilities={availabilities}
                  currentUserId={currentUserId}
                  rangeStart={rangeStart}
                  rangeHoverDate={rangeHoverDate}
                  onCellClick={handleCellClick}
                  onHover={handleHover}
                  onShowDetail={onShowDetail}
                  onShowMonthList={onShowMonthList}
                  onDaySelect={onDaySelect}
                  selectedDay={selectedDay}
                  selectedReservationId={selectedReservationId}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Range hint + action buttons */}
      <div className={styles.panelActions}>
        <div className={styles.rangeHint}>
          <div className={styles.rangeHintIcon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className={styles.rangeHintBody}>
            {/* Při aktivním výběru nese titulek chip v hlavičce — tady stačí instrukce */}
            {!(rangeStart || selectedDay) && <strong>{rangeTitle}</strong>}
            <span>{rangeDescription}</span>
          </div>
          {rangeStart ? (
            <button
              type="button"
              className={styles.rangeHintCancel}
              title="Zrušit výběr"
              onClick={() => { onRangeClear(); setRangeHoverDate(null); }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ) : null}
        </div>

        <div className={styles.panelActionsButtons}>
          
        </div>
      </div>
    </div>
  );
}
