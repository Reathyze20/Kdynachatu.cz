/**
 * ReservationsPage.tsx — Refactored: CSS Modules + Skeletons + Empty States + Ethical Friction
 *
 * Layout (TwoColumnLayout, #209):
 *   Main  — CalendarGrid + QuickStats + „Nová rezervace"
 *   Aside — ReservationList | ReservationDetail (landmark „Rezervace")
 */
import { useState, useEffect, useRef } from "react";
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useMediaQuery, WIDE_DESKTOP_QUERY } from '@/hooks/useMediaQuery';
import { useNavigate, useSearchParams } from "react-router-dom";
import { Umbrella, Home } from "lucide-react";
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
import { TwoColumnLayout } from "@/components/layout/TwoColumnLayout";
import styles from "./Reservations.module.css";
import { isIsoDateInRange } from "@/lib/dateUtils";

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

export function ReservationsPage() {
  useDocumentTitle('Rezervace');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isGuest } = useAuth();
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
    if (isGuest) return showToast("Rezervace uložena!", "success"); // zásoby chaty host nevidí
    showToast("Rezervace uložena! Kontroluji zásoby…", "info");
    const summary = await fetchMissingSummary();
    if (!summary || (summary.count === 0 && !summary.hasShoppingItems)) {
      showToast("Rezervace uložena! Zásoby jsou v pořádku.", "success");
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

  // Delete reservation (called from detail — ethical friction is handled there)
  const handleDelete = async (id: string) => {
    await del.mutateAsync(id);
    setSelectedReservation(null);
  };

  // Empty booking form (calendar header button)
  const handleNewReservation = () => {
    setEditingReservation(null);
    setBookingFrom("");
    setBookingTo("");
    setBookingOpen(true);
  };

  // Assign from detail/list
  const handleAssign = (_: string) => {
    showToast("Funkce přiřazení bude brzy dostupná.", "info");
  };

  // ── Skeleton while loading ────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className={styles.page} data-testid="reservations-page" data-reservations-state="loading">
        <ReservationsSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.page} data-testid="reservations-page" data-reservations-state="error">
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

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.page} data-testid="reservations-page" data-reservations-state="ready">
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
                  onAssign={handleAssign}
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
                  hideMonthlyNote={isGuest}
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
            onNewReservation={handleNewReservation}
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
          <p className="text-slate-600 text-sm">
            Co chceš v tomto termínu naplánovat?
          </p>
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={handleCreateReservation}
              className="flex items-center gap-3 p-4 rounded-xl border border-primary/40 bg-accent hover:border-primary transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                <Home size={20} />
              </div>
              <div>
                <div className="font-semibold text-foreground">Rezervovat chatu</div>
                <div className="text-xs text-muted-foreground">Vytvořit pevnou rezervaci pro pobyt</div>
              </div>
            </button>
            <button
              onClick={handleCreateAvailability}
              className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-700">
                <Umbrella size={20} />
              </div>
              <div>
                <div className="font-semibold text-slate-800">Označit jako mou dovolenou</div>
                <div className="text-xs text-slate-500">Dát ostatním vědět, že mám volno</div>
              </div>
            </button>
          </div>
        </div>
      </Modal>
      <InventoryNotifyDialog
        open={invDialogOpen}
        summary={invSummary}
        onConfirm={() => { setInvDialogOpen(false); navigate("/shopping"); }}
        onClose={() => setInvDialogOpen(false)}
      />
    </div>
  );
}
