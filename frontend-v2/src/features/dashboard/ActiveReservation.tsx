import { useId } from "react";
import { useNavigate } from "react-router-dom";
import type { ActiveReservation as ActiveStay, DashboardReservationsData, LastStay, UpcomingReservation } from "@/api/dashboard";
import { daysUntil, formatDateRange, formatShortDayDate, formatWeekendRange, getLocalTodayIso, nightsBetween, nightsLabel } from "@/lib/dateUtils";
import { pluralize } from "@/lib/utils";
import { AnimalAvatar } from "@/components/shared/AnimalAvatar";
import { useAuth } from "@/context/AuthContext";
import { buildTurnusChain, type ChainStay, type TurnusChainNode } from "@/lib/turnusChain";
import { gasLine } from "@/lib/gasLevel";
import { OVERVIEW_INVITE_ILLUSTRATION } from "./overviewAssets";
import { ArrowRight, CalendarPlus, CircleCheck, DoorOpen, Droplet, Flame, House, MessageSquare, Package, Thermometer, TriangleAlert, Wrench, type LucideIcon } from "lucide-react";

interface Props {
  data: DashboardReservationsData;
  cabinDepartureChecklist: string[];
}

interface BriefingRow { icon: LucideIcon; text: string; label?: string; warn?: boolean }

/**
 * „Od minule“ ze stavu předávky posledního pobytu (#366): vlevo stav chaty, vpravo vzkazy.
 * Popisky vzkazů nahrazuje ikona, čtečky je slyší (sr-only). Jantarově jen to, co chce akci.
 */
function buildArrivalBriefing(lastStay: LastStay): React.ReactNode {
  const s = lastStay.checkoutState;
  if (!s) return null;
  const gas = gasLine(s.gas);
  const state: BriefingRow[] = [
    ...(gas ? [{ icon: Flame, text: gas, warn: s.gas === "low" || s.gas === "empty" }] : []),
    ...(s.heatingOff ? [{ icon: Thermometer, text: "Topení vypnuté" }] : []),
    ...(s.waterOff ? [{ icon: Droplet, text: "Voda uzavřená" }] : []),
  ];
  const notes: BriefingRow[] = [
    ...(s.broken ? [{ icon: Wrench, label: "Rozbité", text: s.broken, warn: true }] : []),
    ...(s.leftBehind ? [{ icon: Package, label: "Nechal/a", text: s.leftBehind }] : []),
    ...(s.note ? [{ icon: MessageSquare, label: "Poznámka", text: s.note }] : []),
  ];
  if (state.length === 0 && notes.length === 0) return null;
  const list = (ariaLabel: string, rows: BriefingRow[], variant: string) => rows.length > 0 && (
    <ul className={`arrival-briefing-list arrival-briefing-list--${variant}`} aria-label={ariaLabel}>
      {rows.map(({ icon: Icon, text, label, warn }) => (
        <li key={label ?? text} className={warn ? "arrival-briefing-item arrival-briefing-item--warn" : "arrival-briefing-item"}>
          <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{label && <span className="sr-only">{label}: </span>}{text}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="arrival-briefing">
      <div className="arrival-briefing-title">Od minule — {lastStay.username}</div>
      <div className="arrival-briefing-body">
        {list("Stav chaty", state, "state")}
        {list("Vzkazy", notes, "notes")}
      </div>
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

/** Kolik nadcházejících pevných pobytů posílá `/dashboard/reservations` (`take` v routě). */
const UPCOMING_LIMIT = 5;

function inDaysLabel(from: string): string {
  const days = daysUntil(from);
  if (days === 0) return "dnes";
  if (days === 1) return "zítra";
  return `za ${days} ${pluralize(days, "den", "dny", "dní")}`;
}

/** Jeden sloupec osy: avatar s iniciálou (nebo značka, když nikdo není) a jméno (G4), pod tím jeden řádek „kdy“. */
function HeaderPerson({ stay, name, when, mark }: { stay?: HeaderStay; name: string; when?: React.ReactNode; mark?: "free" | "none" }) {
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

/** „prázdná 8 dní“ pod volnou chatou; od 14 dní a u nevyplněného checklistu jantarově. */
function emptySinceLabel(lastStay: LastStay): React.ReactNode {
  const days = lastStay.daysEmpty;
  const missingChecklist = !lastStay.isCheckoutCompleted && days > 0;
  return (
    <>
      <span className={days >= 14 ? "status-header__warn" : undefined}>prázdná {days === 0 ? "od dneška" : `${days} ${pluralize(days, "den", "dny", "dní")}`}</span>
      {missingChecklist && <> · <span className="status-header__warn">checklist nevyplněn</span></>}
    </>
  );
}

/**
 * Hlavička Přehledu jako osa teď → příště → pak (#366, dřív #272). Jediné místo se jménem a datem
 * dalších pobytů. Uzly počítá `buildTurnusChain` (jen pevné pobyty, střídací den); „pak“ ukáže první
 * a počet dalších pevných za ním. Nic naplánováno = pozvánka „Chata zatím čeká“ (E2).
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
    const later = stayOf(chain.find((n) => n.kind === "later"));
    // Pevné pobyty za „pak“. API jich posílá nejvýš UPCOMING_LIMIT, plný seznam tedy může být delší.
    const inChain = new Set(chain.map((n) => n.stay?.id));
    const moreLater = later ? data.upcomingReservations.filter((r) => r.status === "primary" && r.from >= later.from && !inChain.has(r.id)).length : 0;
    const maybeMore = data.upcomingReservations.length >= UPCOMING_LIMIT;
    const fromLabel = (s: HeaderStay) => (s.from === todayStr ? "od dneška" : `od ${formatShortDayDate(s.from)}`);
    const nextNights = next ? nightsBetween(next.from, next.to) : 0;
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
                <HeaderPerson stay={now} name={nameOf(now)} when={departingToday ? "do dneška" : `do ${formatShortDayDate(now.to)}`} />
              ) : (
                <HeaderPerson
                  mark="free"
                  name="Chata je volná"
                  when={now ? `Dnes uvolnil${now.username.endsWith("a") ? "a" : ""} ${now.username}` : data.lastStay ? emptySinceLabel(data.lastStay) : undefined}
                />
              )}
            </div>
            <ArrowRight className="status-header__arrow" aria-hidden="true" />
            <div role="group" aria-label="Příště" className="status-header__side status-header__side--next">
              {next ? (
                <HeaderPerson
                  stay={next}
                  name={nameOf(next)}
                  when={`${fromLabel(next)}${nextNights > 0 ? ` · ${nextNights} ${nightsLabel(nextNights)}` : ""}`}
                />
              ) : (
                <HeaderPerson mark="none" name="Zatím nikdo" />
              )}
            </div>
            {later && (
              <>
                <ArrowRight className="status-header__arrow" aria-hidden="true" />
                <div role="group" aria-label="Pak" className="status-header__side status-header__side--later">
                  <HeaderPerson
                    stay={later}
                    name={nameOf(later)}
                    when={<>{fromLabel(later)}{moreLater > 0 && <> <span className="status-header__more">+{moreLater}{maybeMore ? " a víc" : <span className="sr-only"> další</span>}</span></>}</>}
                  />
                </div>
              </>
            )}
          </div>
          {!now && data.lastStay && buildArrivalBriefing(data.lastStay)}
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
