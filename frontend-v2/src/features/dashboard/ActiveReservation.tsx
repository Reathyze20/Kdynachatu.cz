import { useId } from "react";
import { useNavigate } from "react-router-dom";
import type { ActiveReservation as ActiveStay, DashboardReservationsData, LastStay, UpcomingReservation } from "@/api/dashboard";
import { daysUntil, formatDateRange, formatShortDayDate, formatWeekendRange, getLocalTodayIso, nightsBetween, nightsLabel } from "@/lib/dateUtils";
import { pluralize } from "@/lib/utils";
import { AnimalAvatar } from "@/components/shared/AnimalAvatar";
import { TurnusChainLine } from "@/components/shared/TurnusChainLine";
import { useAuth } from "@/context/AuthContext";
import { buildTurnusChain, type ChainStay, type TurnusChainNode } from "@/lib/turnusChain";
import { gasLine } from "@/lib/gasLevel";
import { OVERVIEW_INVITE_ILLUSTRATION } from "./overviewAssets";
import { ParticipantStack } from "./ParticipantStack";
import { ArrowRight, CalendarPlus, CircleCheck, DoorOpen, House, TriangleAlert } from "lucide-react";

interface Props {
  data: DashboardReservationsData;
  cabinDepartureChecklist: string[];
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

type HeaderStay = ActiveStay | UpcomingReservation;

function inDaysLabel(from: string): string {
  const days = daysUntil(from);
  if (days === 0) return "dnes";
  if (days === 1) return "zítra";
  return `za ${days} ${pluralize(days, "den", "dny", "dní")}`;
}

/** Jedna strana hlavičky: avatar s iniciálou (nebo značka, když nikdo není) a jméno (G4), pod tím do/od kdy. */
function HeaderPerson({ stay, name, when, mark }: { stay?: HeaderStay; name: string; when?: string; mark?: "free" | "none" }) {
  return (
    <div className="status-header__person">
      {stay ? (
        <AnimalAvatar icon={stay.userAnimalIcon} username={stay.username} color={stay.userColor || undefined} size={40} />
      ) : (
        <span className={`status-header__mark status-header__mark--${mark}`} aria-hidden="true">{mark === "free" && <House className="w-5 h-5" />}</span>
      )}
      <div className="status-header__text">
        <strong className="status-header__name">{name}</strong>
        {when && <span className="status-header__when">{when}</span>}
      </div>
    </div>
  );
}

/** Detail pobytu pod osobou, CSS ho ukáže jen na desktopu (upřesnění 1 k návrhu #6): účel, noci, kdo jede s ním. */
function StayDetail({ stay, withNights }: { stay: HeaderStay; withNights: boolean }) {
  const nights = withNights ? nightsBetween(stay.from, stay.to) : 0;
  const meta = [stay.purpose, nights > 0 ? `${nights} ${nightsLabel(nights)}` : ""].filter(Boolean).join(" · ");
  return (
    <div className="status-header__detail">
      {meta && <p className="status-header__meta">{meta}</p>}
      <ParticipantStack participants={stay.participants} />
    </div>
  );
}

/**
 * Hlavička Přehledu teď → příště (#272, návrh #6 díl 2A). Jediné místo se jménem a datem dalšího
 * pobytu, proto řetězec pod ní začíná až za ním. Teď a příště počítá `buildTurnusChain`
 * (jen pevné pobyty, střídací den). Nic naplánováno = pozvánka „Chata zatím čeká“ (E2).
 */
export function ActiveReservation({ data, cabinDepartureChecklist }: Props) {
  const navigate = useNavigate();
  const headingId = useId();
  const { user } = useAuth();
  const todayStr = getLocalTodayIso();
  const chain = buildTurnusChain(dashboardChainStays(data, user?.username), todayStr);
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

  // ── Hlavička teď → příště: někdo je na chatě, nebo je naplánovaný další pobyt ──
  if (chain.length > 0) {
    // Plný záznam podle id uzlu; aktivní pobyt má navíc stav předávky, proto vyhrává.
    const stays = new Map<string, HeaderStay>([...data.upcomingReservations, ...(active ? [active] : [])].map((s) => [s.id, s]));
    const stayOf = (node?: TurnusChainNode) => (node?.stay ? stays.get(node.stay.id) ?? null : null);
    const nameOf = (s: HeaderStay) => (s.username === user?.username ? "Ty" : s.username);
    const now = stayOf(chain[0]);
    const next = stayOf(chain.find((n) => n.kind === "next"));
    const departingToday = !!now && now.to === todayStr;
    const departed = departingToday && currentHour >= 14;
    const checkoutDone = !!now && "isCheckoutCompleted" in now && now.isCheckoutCompleted;

    let checkoutReminderNode: React.ReactNode = null;
    if (departingToday && hasCheckoutTasks) {
      checkoutReminderNode = checkoutDone
        ? <div className="checkout-reminder checkout-reminder-done"><CircleCheck className="w-4 h-4 shrink-0" aria-hidden="true" />Odjezdový checklist splněn</div>
        : departed
          ? <div className="checkout-reminder checkout-reminder-missed"><TriangleAlert className="w-4 h-4 shrink-0" aria-hidden="true" />Odjezdový checklist nebyl vyplněn</div>
          : <div className="checkout-reminder checkout-reminder-warn"><span>Před odjezdem vyplň <a href="/reservations">odjezdový checklist</a></span></div>;
    }

    // Můj pevný pobyt, který hlavička ani řetězec neukazují.
    const mine = data.myNextReservation;
    const myNext = mine ? data.upcomingReservations.find((r) => r.status === "primary" && r.from === mine.from && r.to === mine.to) : undefined;

    return (
      <section className="glass-card status-card status-header" id="dashboard-active-reservation" aria-labelledby={headingId}>
        <div className="card-body-full status-content">
          <h2 id={headingId} className="status-header__label">Na chatě teď</h2>
          <div className="status-header__row">
            <div role="group" aria-label="Teď" className="status-header__side">
              {now && !departed ? (
                <>
                  <HeaderPerson stay={now} name={nameOf(now)} when={departingToday ? "do dneška" : `do ${formatShortDayDate(now.to)}`} />
                  <StayDetail stay={now} withNights={false} />
                </>
              ) : (
                <HeaderPerson mark="free" name="Chata je volná" when={now ? `Dnes uvolnil${now.username.endsWith("a") ? "a" : ""} ${now.username}` : undefined} />
              )}
            </div>
            <ArrowRight className="status-header__arrow" aria-hidden="true" />
            <div role="group" aria-label="Příště" className="status-header__side">
              {next ? (
                <>
                  <HeaderPerson stay={next} name={nameOf(next)} when={next.from === todayStr ? "od dneška" : `od ${formatShortDayDate(next.from)}`} />
                  <StayDetail stay={next} withNights />
                </>
              ) : (
                <HeaderPerson mark="none" name="Zatím nikdo" />
              )}
            </div>
          </div>
          <TurnusChainLine nodes={chain.filter((n) => n.kind === "later")} className="status-chain" />
          {!now && buildLastStayBlock(data.lastStay)}
          {myNext && !chain.some((n) => n.stay?.id === myNext.id) && (
            <p className="status-header__mine">
              <strong>Tvůj pobyt {inDaysLabel(myNext.from)}</strong> · {formatDateRange(myNext.from, myNext.to)}
            </p>
          )}
          {checkoutReminderNode}
          <div className="status-cta-row">
            {freeWeekendNode}
            <button onClick={() => navigate("/reservations")} className="status-cta status-cta-neutral">
              Kalendář
            </button>
          </div>
        </div>
      </section>
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
