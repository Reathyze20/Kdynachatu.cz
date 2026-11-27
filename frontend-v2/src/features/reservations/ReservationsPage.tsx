/**
 * ReservationsPage.tsx — stránka rezervací podle DESIGN.md (#460)
 *
 * Hlavička: PageHeader „Rezervace“ s primární akcí „Nová rezervace“ (jediné h1).
 * Layout (TwoColumnLayout, #209):
 *   Main  — CalendarGrid + QuickStats
 *   Aside — ReservationList | ReservationDetail (landmark „Rezervace")
 */
import { useState, useEffect, useRef } from "react";
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useMediaQuery, WIDE_DESKTOP_QUERY } from '@/hooks/useMediaQuery';
import { useNavigate, useSearchParams } from "react-router-dom";
import { Umbrella, Home, Plus } from "lucide-react";
import { ErrorBoundary } from "react-error-boundary";
import { useReservationsData, fetchMissingSummary, useDeleteReservation } from "./hooks/useReservations";
import { useCalendar } from "./hooks/useCalendar";
import { CalendarGrid } from "./calendar/CalendarGrid";
import { QuickStats } from "./ui/QuickStats";
import { ReservationList } from "./ui/ReservationList";
import { ReservationDetail } from "./ui/ReservationDetail";
import { BookingForm } from "./ui/BookingForm";
import { AvailabilityModal } from "./ui/AvailabilityModal";
import { InventoryNotifyDialog } from "./ui/InventoryNotifyDialog";
import { ReservationsSkeleton } from "./ui/ReservationsSkeleton";
import type { Reservation, MissingSummary } from "@/api/reservations";
import { showToast } from "@/lib/toast";
import { useAuth } from "@/context/AuthContext";
import { FeatureErrorFallback } from "@/components/shared/FeatureErrorFallback";
import { Modal } from "@/components/shared/Modal";
import { Card } from "@/components/shared/Card";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { TwoColumnLayout } from "@/components/layout/TwoColumnLayout";
import styles from "./Reservations.module.css";
import { isIsoDateInRange, nightsBetween, nightsLabel } from "@/lib/dateUtils";
import { formatDateRange } from "@/lib/format";

/** Filter reservations that intersect with the given calendar month */
function filterByMonth(reservations: Reservation[], month: number, year: number) {
  const mStart = Date.UTC(year, month, 1);
  const mEndDate = new Date(year, month + 1, 0);
  const mEnd = Date.UTC(mEndDate.getFullYear(), mEndDate.getMonth(), mEndDate.getDate());

  return reservations.filter((r) => {
    if (!r.from || !r.to) return false;
    const [fy, fm, fd] = r.from.split("-").map(Number);
    const [ty, tm, td] = r.to.split("-").map(Number);
    const rFrom = Date.UTC(fy, fm - 1, fd);
    const rTo   = Date.UTC(ty, tm - 1, td);
    return rFrom <= mEnd && rTo >= mStart;
  });
}

/** Filter reservations that haven't ended yet */
function filterFuture(reservations: Reservation[]) {
  const now = new Date();
  const todayTs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return reservations.filter((r) => {
    if (!r.to) return false;
    const [ty, tm, td] = r.to.split("-").map(Number);
    return Date.UTC(ty, tm - 1, td) >= todayTs;
  });
}

/** Volba v dialogu „Vybraný termín“: velká dlaždice s ikonou a dvěma řádky textu. */
const CHOICE_CLASS = "h-auto w-full justify-start gap-3 whitespace-normal rounded-xl p-4 text-left";
const CHOICE_ICON_CLASS = "flex size-10 shrink-0 items-center justify-center rounded-full";

export function ReservationsPage() {
  useDocumentTitle('Rezervace');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isGuest, isAdmin } = useAuth();
  const cal = useCalendar();

  const { data, isLoading, isError, error, refetch } = useReservationsData();
  const del = useDeleteReservation();

  const allReservations: Reservation[] = data?.reservations ?? [];
  const allAvailabilities = data?.availabilities ?? [];
  const myAvailabilities = allAvailabilities.filter((a) => a.userId === user?.userId);

  // Detail view
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);

  // Pod 1024 px je panel pod kalendářem (#209) – při každém otevření detailu k němu stránku
  // posuneme, jinak se detail vykreslí mimo obrazovku a klepnutí vypadá, že nefunguje (#504).
  // Bez animace: poloha scrollu se neanimuje (DESIGN.md §5). `?.` kvůli jsdom bez scrollIntoView.
  const isWideDesktop = useMediaQuery(WIDE_DESKTOP_QUERY);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const showDetail = (r: Reservation) => {
    setSelectedReservation(r);
    if (!isWideDesktop) sidebarRef.current?.scrollIntoView?.({ block: "start" });
  };

  // Day filter — set when a calendar day is clicked
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const handleDaySelect = (dateStr: string) => {
    setSelectedDay(dateStr);
    setSelectedReservation(null);
  };

  // Booking modal
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingFrom, setBookingFrom] = useState("");
  const [bookingTo, setBookingTo]     = useState("");
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);

  // Range Choice Modal
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [choiceFrom, setChoiceFrom] = useState("");
  const [choiceTo, setChoiceTo] = useState("");

  // Availability modal
  const [availOpen, setAvailOpen]   = useState(false);
  const [availFrom, setAvailFrom]   = useState("");
  const [availTo, setAvailTo]       = useState("");

  // Inventory notify dialog
  const [invSummary, setInvSummary]   = useState<MissingSummary | null>(null);
  const [invDialogOpen, setInvDialogOpen] = useState(false);

  // Auto-open booking form from query params (e.g. ?from=2026-04-17&to=2026-04-18)
  useEffect(() => {
    const qFrom = searchParams.get("from");
    const qTo = searchParams.get("to");
    if (qFrom && qTo && /^\d{4}-\d{2}-\d{2}$/.test(qFrom) && /^\d{4}-\d{2}-\d{2}$/.test(qTo)) {
      setBookingFrom(qFrom);
      setBookingTo(qTo);
      setEditingReservation(null);
      setBookingOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Escape → clear calendar range selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") cal.clearRange();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cal]);

  // Open choice modal to decide between Reservation or Availability
  const handleRangeComplete = (from: string, to: string) => {
    setEditingReservation(null);
    if (isGuest) { // host volno ostatním nehlásí (#484), rovnou rezervuje
      setBookingFrom(from);
      setBookingTo(to);
      setBookingOpen(true);
      return;
    }
    setChoiceFrom(from);
    setChoiceTo(to);
    setChoiceOpen(true);
  };

  const handleCreateReservation = () => {
    setChoiceOpen(false);
    setBookingFrom(choiceFrom);
    setBookingTo(choiceTo);
    setBookingOpen(true);
  };

  const handleCreateAvailability = () => {
    setChoiceOpen(false);
    setAvailFrom(choiceFrom);
    setAvailTo(choiceTo);
    setAvailOpen(true);
  };

  // Open availability modal from calendar button
  const handleAvailabilityClick = () => {
    setAvailFrom("");
    setAvailTo("");
    setAvailOpen(true);
  };

  // After successful reservation create → check inventory
  const handleReservationCreated = async (_: string) => {
    if (isGuest) return showToast("Rezervace uložena.", "success"); // zásoby chaty host nevidí
    showToast("Rezervace uložena. Kontroluji zásoby…", "info");
    const summary = await fetchMissingSummary();
    if (!summary || (summary.count === 0 && !summary.hasShoppingItems)) {
      showToast("Rezervace uložena. Zásoby jsou v pořádku.", "success");
      return;
    }
    setInvSummary(summary);
    setInvDialogOpen(true);
  };

  // Edit from detail or list
  const handleEdit = (r: Reservation) => {
    setEditingReservation(r);
    setBookingFrom(r.from ?? "");
    setBookingTo(r.to ?? "");
    setBookingOpen(true);
  };

  // Upravit a smazat smí autor pobytu nebo admin, stejně jako v detailu.
  const canManage = (r: Reservation) => r.userId === user?.userId || isAdmin;

  // Delete reservation (called from detail or the list row menu, both confirm first)
  const handleDelete = async (id: string) => {
    await del.mutateAsync(id);
    setSelectedReservation(null);
  };

  // New booking form: empty from the page header, from a free day picked in the calendar (#506)
  const openNewBooking = (from = "") => {
    setEditingReservation(null);
    setBookingFrom(from);
    setBookingTo("");
    setBookingOpen(true);
  };

  // Hlavička je ve všech stavech, ať má stránka vždy jediné h1 (DESIGN.md §7).
  const header = (
    <Card className="shrink-0">
      <PageHeader title="Rezervace" primaryAction={{ label: "Nová rezervace", icon: Plus, onClick: () => openNewBooking() }} />
    </Card>
  );
  const pageClass = `${styles.page} gap-4 md:gap-6`;

  // ── Skeleton while loading ────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className={pageClass} data-testid="reservations-page" data-reservations-state="loading">
        {header}
        <ReservationsSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={pageClass} data-testid="reservations-page" data-reservations-state="error">
        {header}
        <FeatureErrorFallback
          error={error as Error}
          resetErrorBoundary={() => {
            void refetch();
          }}
          title="Rezervace se nepodařilo načíst"
        />
      </div>
    );
  }

  // ── Filtered list for right panel ─────────────────────────────────────
  const monthFiltered = filterByMonth(allReservations, cal.month, cal.year);
  const futureReservations = filterFuture(allReservations);

  // If a specific day is selected, narrow down to reservations covering that day
  const filtered = selectedDay
    ? monthFiltered.filter((r) => isIsoDateInRange(selectedDay, r.from, r.to))
    : monthFiltered;

  const choiceNights = choiceFrom && choiceTo ? nightsBetween(choiceFrom, choiceTo) : 0;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className={pageClass} data-testid="reservations-page" data-reservations-state="ready">
      {header}
      <TwoColumnLayout
        asideLabel="Rezervace"
        aside={
          <div ref={sidebarRef} className={styles.listContainer} data-testid="reservations-sidebar">
            <div className={styles.listScroll}>
              {selectedReservation ? (
                <ReservationDetail
                  reservation={selectedReservation}
                  onBack={() => setSelectedReservation(null)}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ) : (
                <ReservationList
                  reservations={filtered}
                  allReservations={allReservations}
                  futureReservations={futureReservations}
                  month={cal.month}
                  year={cal.year}
                  onMonthChange={(m, y) => { cal.goToMonth(m, y); setSelectedDay(null); }}
                  onShowDetail={showDetail}
                  selectedDay={selectedDay}
                  onClearDayFilter={() => setSelectedDay(null)}
                  onBookFromDay={openNewBooking}
                  hideMonthlyNote={isGuest}
                  canManage={canManage}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              )}
            </div>
          </div>
        }
      >
        <ErrorBoundary
          FallbackComponent={(props) => (
            <FeatureErrorFallback {...props} title="Kalendář rezervací se nepodařilo načíst" />
          )}
        >
          <CalendarGrid
            month={cal.month}
            year={cal.year}
            reservations={allReservations}
            availabilities={allAvailabilities}
            currentUserId={user?.userId ?? ""}
            selectedDay={selectedDay}
            selectedReservationId={selectedReservation?.id ?? null}
            rangeStart={cal.rangeStart}
            onGoToPrev={cal.goToPrev}
            onGoToNext={cal.goToNext}
            onRangeComplete={handleRangeComplete}
            onShowMonthList={handleAvailabilityClick}
            onRangeClear={cal.clearRange}
            onRangeStartSet={cal.setRangeStart}
            onShowDetail={showDetail}
            onDaySelect={handleDaySelect}
            onDayClear={() => setSelectedDay(null)}
            quickStatsNode={
              <QuickStats
                reservations={allReservations}
                month={cal.month}
                year={cal.year}
              />
            }
          />
        </ErrorBoundary>
      </TwoColumnLayout>

      {/* ── Modals ── */}
      <BookingForm
        open={bookingOpen}
        onClose={() => { setBookingOpen(false); setEditingReservation(null); }}
        fromDate={bookingFrom}
        toDate={bookingTo}
        existing={editingReservation}
        allReservations={allReservations}
        onCreated={handleReservationCreated}
      />

      <AvailabilityModal
        open={availOpen}
        onClose={() => setAvailOpen(false)}
        fromDate={availFrom}
        toDate={availTo}
        myAvailabilities={myAvailabilities}
      />
      <Modal
        isOpen={choiceOpen}
        onClose={() => setChoiceOpen(false)}
        title="Vybraný termín"
        maxWidth="max-w-md"
      >
        <div className="space-y-4 py-2">
          {choiceFrom && choiceTo && (
            <p className="text-card-title text-foreground">
              {formatDateRange(choiceFrom, choiceTo)} · {choiceNights} {nightsLabel(choiceNights)}
            </p>
          )}
          <p className="text-body text-(--text-muted)">
            Co chceš v tomto termínu naplánovat?
          </p>
          <div className="grid grid-cols-1 gap-3">
            <Button variant="secondary" onClick={handleCreateReservation} className={`${CHOICE_CLASS} border-primary/40 bg-accent hover:bg-accent hover:border-primary`}>
              <span className={`${CHOICE_ICON_CLASS} bg-sheet text-primary`}><Home aria-hidden="true" /></span>
              <span>
                <span className="block text-body font-semibold">Rezervovat chatu</span>
                <span className="block text-label text-(--text-muted)">Vytvořit pevnou rezervaci pro pobyt</span>
              </span>
            </Button>
            <Button variant="secondary" onClick={handleCreateAvailability} className={CHOICE_CLASS}>
              <span className={`${CHOICE_ICON_CLASS} bg-inset text-(--text-muted)`}><Umbrella aria-hidden="true" /></span>
              <span>
                <span className="block text-body font-semibold">Označit jako mou dovolenou</span>
                <span className="block text-label text-(--text-muted)">Dát ostatním vědět, že mám volno</span>
              </span>
            </Button>
          </div>
        </div>
      </Modal>
      <InventoryNotifyDialog
        open={invDialogOpen}
        summary={invSummary}
        onConfirm={() => { setInvDialogOpen(false); navigate("/shopping?view=shopping"); }}
        onClose={() => setInvDialogOpen(false)}
      />
    </div>
  );
}
