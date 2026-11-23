import { useNavigate } from "react-router-dom";
import type { DashboardReservationsData, LastStay } from "@/api/dashboard";
import { formatWeekendRange, nightsBetween, getLocalTodayIso, isoDateToLocalNoon } from "@/lib/dateUtils";
import { AnimalAvatar } from "@/components/shared/AnimalAvatar";
import { TurnusChainLine } from "@/components/shared/TurnusChainLine";
import { useAuth } from "@/context/AuthContext";
import { buildTurnusChain, type ChainStay } from "@/lib/turnusChain";
import { gasLine } from "@/lib/gasLevel";
import { OVERVIEW_INVITE_ILLUSTRATION } from "./overviewAssets";
import { ParticipantStack } from "./ParticipantStack";
import { CalendarPlus, CircleCheck, DoorOpen, TriangleAlert } from "lucide-react";

interface Props {
  data: DashboardReservationsData;
  cabinDepartureChecklist: string[];
}

function isValidReservation(r: { from: string; to: string } | null | undefined): boolean {
  if (!r) return false;
  return !!r.from && !!r.to;
}

/** Arrival briefing derived from the last completed stay's checkout state. */
function buildArrivalBriefing(lastStay: LastStay): React.ReactNode {
  const s = lastStay.checkoutState;
  if (!s) return null;
  const chips: string[] = [];
  const gas = gasLine(s.gas);
  if (gas) chips.push(gas);
  if (s.heatingOff) chips.push("topení vypnuté");
  if (s.waterOff) chips.push("voda uzavřená");
  const hasText = !!(s.broken || s.leftBehind || s.note);
  if (chips.length === 0 && !hasText) return null;
  return (
    <div className="arrival-briefing">
      <div className="arrival-briefing-title">Od minule — {lastStay.username}</div>
      {chips.length > 0 && <div className="arrival-briefing-chips">{chips.join(" · ")}</div>}
      {s.broken && <div className="arrival-briefing-line"><strong>Rozbité:</strong> {s.broken}</div>}
      {s.leftBehind && <div className="arrival-briefing-line"><strong>Nechal/a:</strong> {s.leftBehind}</div>}
      {s.note && <div className="arrival-briefing-line">{s.note}</div>}
    </div>
  );
}

function buildLastStayBlock(lastStay: LastStay | null | undefined): React.ReactNode {
  if (!lastStay) return null;
  const daysLabel = lastStay.daysEmpty === 0 ? "dnes" :
    lastStay.daysEmpty === 1 ? "1 den" :
    lastStay.daysEmpty < 5 ? `${lastStay.daysEmpty} dny` :
    `${lastStay.daysEmpty} dní`;
  const isLongEmpty = lastStay.daysEmpty >= 14;
  const checklistPart = lastStay.isCheckoutCompleted
    ? " · Checklist OK"
    : lastStay.daysEmpty > 0 ? " · Checklist nevyplněn" : "";
  return (
    <>
      <div className={`last-stay-inline${isLongEmpty ? " last-stay-warning" : ""}`}>
        <span className="last-stay-text">
          Prázdná {daysLabel}{checklistPart}
        </span>
      </div>
      {buildArrivalBriefing(lastStay)}
    </>
  );
}

/** Řetězec teď → pak z dat Přehledu; aktivní pobyt API posílá jen pevný. Jméno je unikátní, vlastní pobyt = „Ty“. */
function dashboardChainStays(data: DashboardReservationsData, myUsername: string | undefined): ChainStay[] {
  const toChainStay = (r: { id: string; from: string; to: string; username: string }, status: string): ChainStay =>
    ({ id: r.id, from: r.from, to: r.to, status, username: r.username, isMine: r.username === myUsername });
  const active = data.activeReservation;
  return [
    ...(active ? [toChainStay(active, "primary")] : []),
    ...data.upcomingReservations.map((r) => toChainStay(r, r.status)),
  ];
}

export function ActiveReservation({ data, cabinDepartureChecklist }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const todayStr = getLocalTodayIso();
  const chainNode = <TurnusChainLine nodes={buildTurnusChain(dashboardChainStays(data, user?.username), todayStr)} className="status-chain" />;
  const currentHour = new Date().getHours();
  const active = data.activeReservation;

  const freeWeekendNode = data.nextFreeWeekend ? (
    <button 
      className="status-cta status-cta-smart" 
      onClick={() => navigate(`/reservations?from=${data.nextFreeWeekend!.start}&to=${data.nextFreeWeekend!.end}`)}
    >
      <CalendarPlus size={14} /> Volný víkend {formatWeekendRange(data.nextFreeWeekend.start, data.nextFreeWeekend.end)}
    </button>
  ) : null;

  const hasCheckoutTasks = cabinDepartureChecklist && cabinDepartureChecklist.length > 0;

  // ── Stav C: Occupied ─────────────────────────────────────────────────
  if (active && isValidReservation(active)) {
    const departingToday = active.to === todayStr;
    const userColor = active.userColor || undefined;

    let title: string;
    let subtitle: string;
    let cardClass: string;
    let avatarNode: React.ReactNode;
    let checkoutReminderNode: React.ReactNode = null;

    if (departingToday && currentHour >= 14) {
      title = "Volná!";
      subtitle = `Dnes uvolnil${active.username.endsWith("a") ? "a" : ""} ${active.username} · ${active.purpose}`;
      cardClass = "glass-card status-card is-free";
      avatarNode = (
        <div className="status-avatar-block" style={{ background: "var(--color-primary)" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
        </div>
      );
      if (hasCheckoutTasks) {
        checkoutReminderNode = active.isCheckoutCompleted
          ? <div className="checkout-reminder checkout-reminder-done"><CircleCheck className="w-4 h-4 shrink-0" aria-hidden="true" />Odjezdový checklist splněn</div>
          : <div className="checkout-reminder checkout-reminder-missed"><TriangleAlert className="w-4 h-4 shrink-0" aria-hidden="true" />Odjezdový checklist nebyl vyplněn</div>;
      }
    } else if (departingToday) {
      title = active.username;
      subtitle = `Odjíždí dnes · ${active.purpose}`;
      cardClass = "glass-card status-card is-occupied";
      avatarNode = <div className="status-avatar-block"><AnimalAvatar icon={active.userAnimalIcon} username={active.username} color={userColor} size={48} /></div>;
      if (hasCheckoutTasks) {
        checkoutReminderNode = active.isCheckoutCompleted
          ? <div className="checkout-reminder checkout-reminder-done">Odjezdový checklist splněn</div>
          : (
            <div className="checkout-reminder checkout-reminder-warn">
              <span>Před odjezdem vyplň <a href="/reservations">odjezdový checklist</a></span>
            </div>
          );
      }
    } else {
      const nights = nightsBetween(todayStr, active.to);
      const dLabel = nights === 1 ? "1 den" : nights >= 2 && nights <= 4 ? `${nights} dny` : `${nights} dní`;
      title = active.username;
      
      const toDate = isoDateToLocalNoon(active.to);
      const formattedToObj = new Intl.DateTimeFormat("cs-CZ", { weekday: "long", day: "numeric", month: "numeric" }).format(toDate);
      const formattedTo = formattedToObj.split(' ').map(w => w === 'Zítra' ? w : w).join(' ');

      // Subtitle e.g.: "Pobyt do pátku 17. 4. (ještě 5 dní) · Test"
      subtitle = `Pobyt do ${formattedTo} (ještě ${dLabel}) · ${active.purpose}`;
      cardClass = "glass-card status-card is-occupied";
      avatarNode = <div className="status-avatar-block"><AnimalAvatar icon={active.userAnimalIcon} username={active.username} color={userColor} size={48} /></div>;
    }

    return (
      <div className={cardClass} id="dashboard-active-reservation">
        <div className="card-body-full status-content">
          <div className="status-hero-row">
            {avatarNode}
            <div className="status-hero-text">
              <div className="status-name-row">
                <div className="status-name">{title}</div>
              </div>
              <div className="status-meta">
                <span className="status-dates">{subtitle}</span>
              </div>
            </div>
          </div>
          {chainNode}
          <ParticipantStack participants={active.participants} />
          {checkoutReminderNode}
          <div className="status-cta-row">
            {freeWeekendNode}
            <button onClick={() => navigate("/reservations")} className="status-cta status-cta-neutral">
              Kalendář
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Stav B: Free, but upcoming reservation exists ────────────────────
  if (data.upcomingReservations.some((r) => r.status === "primary" && isValidReservation(r))) {
    return (
      <div className="glass-card status-card is-free" id="dashboard-active-reservation">
        <div className="card-body-full status-content">
          <div className="status-hero-row">
            <div className="status-avatar-block" style={{ background: "var(--color-primary)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
            </div>
            <div className="status-hero-text">
              <div className="status-name-row">
                <div className="status-name">Chata je nyní volná</div>
              </div>
            </div>
          </div>
          {chainNode}
          {buildLastStayBlock(data.lastStay)}
          <div className="status-cta-row">
            {freeWeekendNode}
            <button onClick={() => navigate("/reservations")} className="status-cta status-cta-neutral">
              Kalendář
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Stav A: nic se neděje → pozvánka (návrh #1 díl 5 = A, E2) ─────────
  return (
    <section className="glass-card status-card overview-invite" id="dashboard-active-reservation" aria-labelledby="overview-invite-title">
      <div className="card-body-full status-content">
        <div className="overview-invite__media" data-testid="overview-invite-media" aria-hidden="true">
          {OVERVIEW_INVITE_ILLUSTRATION ? <img src={OVERVIEW_INVITE_ILLUSTRATION} alt="" /> : <DoorOpen className="w-5 h-5" />}
        </div>
        <h2 id="overview-invite-title" className="overview-invite__title">Chata zatím čeká</h2>
        <p className="overview-invite__text">Zaber termín a rozjeď to.</p>
        {buildLastStayBlock(data.lastStay)}
        <div className="status-cta-row overview-invite__actions">
          <button className="status-cta status-cta-primary" onClick={() => navigate("/reservations")}>
            Zabrat termín
          </button>
          {freeWeekendNode}
        </div>
      </div>
    </section>
  );
}
