
import type { Reservation, UserAvailability } from "@/api/reservations";
import styles from "../Reservations.module.css";
import { isIsoDateInRange } from "@/lib/dateUtils";
import { memberInitial, toMemberColor } from "@/lib/memberPalette";

// ─── Helpers ─────────────────────────────────────────────────────────

function hexToRgba(hex: string | undefined, alpha = 1): string {
  if (!hex || !/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) return `rgba(128,128,128,${alpha})`;
  let c = hex.substring(1).split("");
  if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
  const n = parseInt(c.join(""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// function isMobile() {
//   return typeof window !== "undefined" && window.innerWidth <= 768;
// }

// ─── Props ────────────────────────────────────────────────────────────

interface CalendarCellProps {
  date: Date;
  dateStr: string;
  isOtherMonth: boolean;
  todayMidnight: Date;
  reservations: Reservation[];
  availabilities: UserAvailability[];
  currentUserId: string;
  selectedDay?: string | null;
  selectedReservationId: string | null;
  rangeStart: string | null;
  rangeHoverDate: string | null;
  onCellClick: (dateStr: string, isOtherMonth: boolean) => void;
  onHover: (dateStr: string) => void;
  onShowDetail: (r: Reservation) => void;
  onShowMonthList: () => void;
  onDaySelect: (dateStr: string) => void;
}

export function CalendarCell({
  date,
  dateStr,
  isOtherMonth,
  todayMidnight,
  reservations,
  availabilities,
  currentUserId: _currentUserId,
  selectedDay,
  selectedReservationId,
  rangeStart,
  rangeHoverDate,
  onCellClick,
  onHover,
  onShowDetail,
  onShowMonthList: _onShowMonthList,
  onDaySelect,
}: CalendarCellProps) {
  const dow = date.getDay();
  const isPast = date < todayMidnight;
  const isToday = date.getTime() === todayMidnight.getTime();

  // ── Range classes ─────────────────────────────────────────────────
  const isRangeStart = rangeStart === dateStr;
  const isInRange =
    !!rangeStart &&
    !!rangeHoverDate &&
    dateStr > rangeStart &&
    dateStr < rangeHoverDate;
  const isRangeEnd =
    !!rangeStart &&
    !!rangeHoverDate &&
    dateStr === rangeHoverDate &&
    dateStr > rangeStart;
  const isSelectedDay = selectedDay === dateStr;

  // ── Build className ───────────────────────────────────────────────
  const cls = [
    styles.calDay,
    (dow === 0 || dow === 6) ? styles.weekend : "",
    isOtherMonth ? styles.otherMonth : "",
    isToday ? styles.today : "",
    isPast ? styles.pastDate : "",
    isSelectedDay ? styles.selectedDay : "",
    isRangeStart ? styles.rangeStart : "",
    isInRange ? styles.inRange : "",
    isRangeEnd ? styles.rangeEnd : "",
  ]
    .filter(Boolean)
    .join(" ");

  // ── Reservation bars for this date ────────────────────────────────
  const forDay = reservations.filter((r) => isIsoDateInRange(dateStr, r.from, r.to));

  const maxVisible = 1;
  const visible = forDay.slice(0, maxVisible);
  const hiddenCount = forDay.length - visible.length;

  // ── Availability dots ─────────────────────────────────────────────
  const availForDay = availabilities.filter((a) => isIsoDateInRange(dateStr, a.startDate, a.endDate));

  // isMobile reserved for responsive adjustments

  return (
    <div
      className={cls}
      data-date={dateStr}
      onClick={() => { onCellClick(dateStr, isOtherMonth); }}
      onMouseEnter={() => { if (!isPast && rangeStart) onHover(dateStr); }}
    >
      <div className={`${styles.dayNum} ${isOtherMonth ? styles.otherMonthDayNum : ""} ${isPast ? styles.pastDateDayNum : ""}`}>
        {date.getDate()}
      </div>

      <div className={styles.calDayBody}>
        {/* Reservation bars */}
        <div className={styles.calBars}>
          {forDay.length > 0 && (
            <>
              {visible.map((r, index) => {
                const memberColor = toMemberColor(r.userColor);
                const isStart = dateStr === r.from;
                const isEnd = dateStr === r.to;
                const isSingleDay = isStart && isEnd;
                const isMiddle = !isStart && !isEnd;
                const hasOverflowBadge = hiddenCount > 0 && index === visible.length - 1;
                const isSelected = r.id === selectedReservationId;

                const barCls = [
                  styles.calBar,
                  hasOverflowBadge ? styles.calBarWithOverflow : "",
                  r.status === "backup" ? styles.calBarBackup : "",
                  isSingleDay ? styles.calBarSingle : "",
                  !isSingleDay && isStart ? styles.calBarStart : "",
                  isMiddle ? styles.calBarMiddle : "",
                  !isSingleDay && isEnd ? styles.calBarEnd : "",
                  isOtherMonth ? styles.otherMonthBar : "",
                  isSelected ? styles.calBarSelected : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                const barStyle: React.CSSProperties =
                  r.status === "soft"
                    ? {
                        background: `repeating-linear-gradient(45deg, ${hexToRgba(memberColor, 0.15)}, ${hexToRgba(memberColor, 0.15)} 5px, rgba(255,255,255,0.7) 5px, rgba(255,255,255,0.7) 10px)`,
                        borderColor: memberColor,
                        border: `1px solid ${memberColor}`,
                      }
                    : { backgroundColor: hexToRgba(memberColor, 0.3) };

                // G4: name (initial on mobile) on the first segment and on every week row the bar continues into
                const showLabel = isStart || dow === 1;

                return (
                  <div
                    key={r.id}
                    className={barCls}
                    style={barStyle}
                    aria-current={isSelected ? "true" : undefined}
                    title={`${r.username} (${r.purpose})${r.participants && r.participants.length > 0 ? ` +${r.participants.length}: ${r.participants.map((p) => p.username).join(", ")}` : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowDetail(r);
                    }}
                  >
                    {isSelected ? <span className="sr-only">Vybraná rezervace</span> : null}
                    <span className={styles.calBarLabel}>{showLabel ? r.username : "\u00A0"}</span>
                    {showLabel ? <span className={styles.calBarInitial} aria-hidden="true">{memberInitial(r.username)}</span> : null}
                    {hasOverflowBadge ? (
                      <button
                        type="button"
                        className={styles.calBarOverflowBadge}
                        title={forDay.slice(maxVisible).map((item) => `${item.username} (${item.purpose})`).join(", ")}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDaySelect(dateStr);
                        }}
                      >
                        +{hiddenCount}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div
          className={styles.calAvailDots}
          title={availForDay.length > 0 ? `Mají dovolenou: ${availForDay.map((a) => a.username).join(", ")}` : undefined}
        >
          {availForDay.map((a) => (
            <div
              key={a.id}
              className={styles.calAvailBadge}
              style={{ backgroundColor: toMemberColor(a.userColor) }}
            >
              <span className={styles.calAvailCount}>{memberInitial(a.username)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
