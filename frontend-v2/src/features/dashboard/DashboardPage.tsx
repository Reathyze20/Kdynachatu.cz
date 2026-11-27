import { useState, useEffect } from "react";
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import apiClient from "@/api/client";
import type { CabinSettings, DashboardActivationData, DashboardReservationsData, DashboardShoppingData, DashboardNotesData } from "@/api/dashboard";
import { DashboardActivationSchema, DashboardReservationsSchema, DashboardShoppingSchema, DashboardNotesSchema } from "@/api/schemas";
import { ActiveReservation } from "./ActiveReservation";
import { AdminActivationChecklist } from "./AdminActivationChecklist";
import { PinnedNote } from "./PinnedNote";
import { DepartureBanner } from "./DepartureBanner";
import { NudgeTray } from "./NudgeTray";
import { useTrayNudges } from "./useTrayNudges";
import { AttentionCard } from "./AttentionCard";
import { buildAttention } from "./attention";
import { useMediaQuery, WIDE_DESKTOP_QUERY } from "@/hooks/useMediaQuery";
import { CabinToday } from "./CabinToday";
import { pickOverviewStay, overviewStayTitle } from "./overviewStay";
import { StayWeatherCard } from "@/features/weather/StayWeatherCard";
import { useTodayWeather } from "@/features/weather/hooks/useTodayWeather";
import { InstallCard } from "@/components/shared/InstallCard";
import { DASHBOARD_RESERVATIONS_KEY } from "@/features/reservations/hooks/useReservations";
import { DASHBOARD_SHOPPING_KEY } from "@/features/shopping/hooks/useShoppingLists";
import { FeatureErrorFallback } from "@/components/shared/FeatureErrorFallback";
import { TwoColumnLayout } from "@/components/layout/TwoColumnLayout";
import { Card } from "@/components/shared/Card";
import { getLocalTodayIso } from "@/lib/dateUtils";
import { motion } from "framer-motion";
import { TriangleAlert } from "lucide-react";

// ─── Skeletons ────────────────────────────────────────────────────────

export function StatusCardSkeleton() {
  return (
    <Card flush className="flex flex-col status-card" id="dashboard-active-reservation">
      <div className="card-body-full status-content">
        <div className="status-split-row">
          <div className="skeleton skeleton-avatar-lg" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, justifyContent: "center" }}>
            <div className="skeleton skeleton-text short" style={{ width: 50, height: 11 }} />
            <div className="skeleton skeleton-text" style={{ width: "52%", height: 18 }} />
            <div className="skeleton skeleton-text" style={{ width: "72%", height: 13 }} />
          </div>
        </div>
        <div className="status-cta-row" style={{ marginTop: 14, gap: 8 }}>
          <div className="skeleton skeleton-btn" style={{ width: 160 }} />
          <div className="skeleton skeleton-btn" style={{ width: 130 }} />
        </div>
      </div>
    </Card>
  );
}

export function PinnedNoteSkeleton() {
  return (
    <Card flush className="flex flex-col dashboard-handover-card" id="dashboard-handover-note">
      <div className="card-body-full handover-card-content">
        <div className="dashboard-card-header">
          <div className="skeleton skeleton-text" style={{ width: 60, height: 14 }} />
          <div className="skeleton" style={{ width: 28, height: 28, borderRadius: "50%" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          <div className="skeleton skeleton-text long" style={{ height: 13 }} />
          <div className="skeleton skeleton-text" style={{ width: "78%", height: 13 }} />
          <div className="skeleton skeleton-text medium" style={{ height: 13 }} />
        </div>
      </div>
    </Card>
  );
}

export function ActivationChecklistSkeleton() {
  return (
    <Card flush className="flex flex-col dashboard-activation-inline-card">
      <div className="card-body-full dashboard-activation-inline-content">
        <div className="dashboard-activation-inline-main">
          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                <div className="skeleton skeleton-text" style={{ width: 120, height: 14 }} />
                <div className="skeleton skeleton-text" style={{ width: "56%", height: 18 }} />
              </div>
              <div className="skeleton" style={{ width: 76, height: 56, borderRadius: 14, flexShrink: 0 }} />
            </div>
            <div className="skeleton skeleton-text long" style={{ height: 13 }} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[0, 1, 2].map((index) => (
                <div key={index} className="skeleton" style={{ width: 108, height: 30, borderRadius: 999 }} />
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <div className="skeleton skeleton-btn" style={{ width: 154 }} />
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── Animation variants ───────────────────────────────────────────────

const stackVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
};

// ─── DashboardPage ────────────────────────────────────────────────────

export function DashboardPage() {
  useDocumentTitle('Přehled');
  const { isAdmin, isGuest, user } = useAuth();
  const [pinnedNote, setPinnedNote] = useState<string | null>(null);
  const [pinnedNoteAuthor, setPinnedNoteAuthor] = useState<string | null>(null);
  const [pinnedNoteUpdatedAt, setPinnedNoteUpdatedAt] = useState<string | null>(null);

  // Cabin info
  const cabinQuery = useQuery<CabinSettings>({
    queryKey: ["cabin"],
    queryFn: () => apiClient.get<CabinSettings>("/cabin").then((r) => r.data),
    staleTime: 60_000,
  });
  // Dnešní počasí pro scénu chaty (#564): stejný dotaz jako karta dneška a menu, nic dalšího se nestahuje
  const { data: todayWeather } = useTodayWeather(cabinQuery.data ?? undefined);

  // Independent queries for each domain
  const reservationsQuery = useQuery<DashboardReservationsData>({
    queryKey: DASHBOARD_RESERVATIONS_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<DashboardReservationsData>("/dashboard/reservations");
      return DashboardReservationsSchema.parse(data) as DashboardReservationsData;
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 30_000,
  });

  const activationQuery = useQuery<DashboardActivationData>({
    queryKey: ["dashboard", "activation"],
    queryFn: async () => {
      const { data } = await apiClient.get<DashboardActivationData>("/dashboard/activation");
      return DashboardActivationSchema.parse(data) as DashboardActivationData;
    },
    enabled: isAdmin,
    staleTime: 5_000,
    refetchOnMount: "always",
  });

  const shoppingQuery = useQuery<DashboardShoppingData>({
    queryKey: DASHBOARD_SHOPPING_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<DashboardShoppingData>("/dashboard/shopping");
      return DashboardShoppingSchema.parse(data) as DashboardShoppingData;
    },
    enabled: !isGuest, // host nevidí zásoby ani vzkazy chaty (#484)
    refetchInterval: 5 * 60 * 1000,
    staleTime: 30_000,
  });

  const notesQuery = useQuery<DashboardNotesData>({
    queryKey: ["dashboard", "notes"],
    queryFn: async () => {
      const { data } = await apiClient.get<DashboardNotesData>("/dashboard/notes");
      return DashboardNotesSchema.parse(data) as DashboardNotesData;
    },
    enabled: !isGuest,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 30_000,
  });

  // Sync the pinned board note initially
  useEffect(() => {
    if (notesQuery.data) {
      setPinnedNote(prev => prev === null ? notesQuery.data.pinnedHandoverNote : prev);
      setPinnedNoteAuthor(prev => prev === null ? notesQuery.data.handoverNoteAuthor : prev);
      setPinnedNoteUpdatedAt(prev => prev === null ? notesQuery.data.handoverNoteUpdatedAt : prev);
    }
  }, [notesQuery.data]);

  // Výpadek víc sekcí najednou (slabý signál na chatě) = jedna souhrnná hláška místo řady chybových karet (#512)
  const failedQueries = [cabinQuery, reservationsQuery, shoppingQuery, notesQuery].filter((query) => query.isError);
  const manyFailed = failedQueries.length > 1;
  const retryFailed = () => failedQueries.forEach((query) => void query.refetch());
  const cabinError = cabinQuery.isError && !manyFailed;
  const isWinterized = !!cabinQuery.data?.isWinterized;
  const departureChecklist = cabinQuery.data?.departureChecklist ?? [];
  // Počasí na pobyt (#326): nejbližší pobyt v okně 7 dní před příjezdem, vlastní má přednost
  const stayPick = reservationsQuery.data
    ? pickOverviewStay(reservationsQuery.data.activeReservation, reservationsQuery.data.upcomingReservations, user, getLocalTodayIso())
    : null;
  // „Visí na tobě“ a „Důležité“: na mobilu nahoře v hlavním sloupci, na desktopu
  // v bočním panelu nad vzkazem, aby se Přehled vešel bez scrollování (#275, #356)
  const isDesktop = useMediaQuery(WIDE_DESKTOP_QUERY);
  const tray = useTrayNudges(reservationsQuery.data, shoppingQuery.data);
  const nudges = <NudgeTray nudges={tray.nudges} onDismiss={tray.dismiss} />;
  // Důležité (#682): plyn jen tomu, komu ho nenese „Visí na tobě“; bouřka z počasí, i když karta počasí není vidět
  const gasInTray = tray.nudges.some((n) => n.id.startsWith("gas-"));
  const important = buildAttention({
    storm: todayWeather && typeof todayWeather === "object" ? todayWeather.stormAlert : null,
    gas: gasInTray ? null : reservationsQuery.data?.lastStay?.checkoutState?.gas,
    fault: reservationsQuery.data?.lastFault,
    supplies: shoppingQuery.data?.attention,
    isGuest,
  });
  // Co nese „Visí na tobě“ a „Důležité“, „Od minule“ zopakuje jen tlumeně (#425)
  const shownElsewhere = {
    gas: gasInTray || important.all.some((r) => r.kind === "gas"),
    faultText: important.all.find((r) => r.kind === "fault")?.text ?? null,
  };
  const attention = (
    <>
      {shoppingQuery.isError && !manyFailed && (
        <FeatureErrorFallback title="Zásoby se nepodařilo načíst" error={shoppingQuery.error as Error} resetErrorBoundary={() => shoppingQuery.refetch()} />
      )}
      {(isGuest || !shoppingQuery.isPending) && <AttentionCard attention={important} />}
    </>
  );

  const mainColumn = (
    <div className="dashboard nordic-dashboard" data-testid="dashboard-page">
      {/* Dnešek chaty (#338): na desktopu v hlavičce levého menu, jinak kompaktní karta nahoře */}
      {isDesktop ? <h1 className="sr-only">{cabinQuery.data?.name ?? "Přehled"}</h1> : <CabinToday variant="card" />}

      {/* Winter banner */}
      {isWinterized && (
        <div id="dashboard-winter-banner" className="winter-banner" data-testid="dashboard-winter-banner">
          <div className="winter-banner-content">
            <span className="winter-banner-icon">*</span>
            <div className="winter-banner-text">
              <strong>Chata je zazimovaná</strong>
              <span>Mrazové výstrahy a speciální režim jsou aktivní</span>
            </div>
          </div>
        </div>
      )}

      {manyFailed && (
        <FeatureErrorFallback title="Část přehledu se nepodařilo načíst" error={failedQueries[0].error as Error} resetErrorBoundary={retryFailed} />
      )}

      {/* Cabin error banner */}
      {cabinError && (
        <div className="essential-warning-banner">
          <TriangleAlert className="w-5 h-5 inline-block align-middle mr-2" aria-hidden="true" style={{ color: 'var(--status-warning)' }} />
          <span>Nepodařilo se načíst nastavení chaty — některé widgety nemusí fungovat správně.</span>
        </div>
      )}

      {/* Warnings & Banners */}
      {reservationsQuery.isSuccess && reservationsQuery.data?.departingToday && reservationsQuery.data.departingReservationId && (
        <DepartureBanner
          reservationId={reservationsQuery.data.departingReservationId}
          departureChecklist={departureChecklist}
          onRefresh={() => reservationsQuery.refetch()}
          postToChat={!isGuest}
        />
      )}

      {/* Nudge tray — timely coordination prompts derived from existing data */}
      {!isDesktop && nudges}
      {!isDesktop && attention}

      {/* Hlavní sloupec: prioritní stack karet (#172), karty se nenatahují do výšky sousedů */}
      <motion.div
        className="dashboard-stack"
        variants={stackVariants}
        initial="hidden"
        animate="visible"
        data-testid="dashboard-stack"
      >
        {/* Na chatě teď */}
        <motion.div variants={cardVariants} data-testid="dashboard-reservation-widget">
          {reservationsQuery.isLoading ? (
            <StatusCardSkeleton />
          ) : reservationsQuery.isError ? (
            manyFailed ? null : <ErrorBoundary FallbackComponent={(props) => <FeatureErrorFallback {...props} title="Rezervace se nepodařilo načíst" />}>
              <FeatureErrorFallback title="Rezervace se nepodařilo načíst" error={reservationsQuery.error as Error} resetErrorBoundary={() => reservationsQuery.refetch()} />
            </ErrorBoundary>
          ) : reservationsQuery.data ? (
            <ActiveReservation data={reservationsQuery.data} cabinDepartureChecklist={departureChecklist} isWinterized={isWinterized} weather={todayWeather} shownElsewhere={shownElsewhere} />
          ) : null}
        </motion.div>

        {stayPick && (
          <motion.div variants={cardVariants} className="empty:hidden" data-testid="dashboard-stay-weather-widget">
            <StayWeatherCard
              from={stayPick.stay.from}
              to={stayPick.stay.to}
              title={overviewStayTitle(stayPick)}
              frame="rounded-2xl border border-rule-soft bg-sheet shadow-lift"
              collapsibleChart
            />
          </motion.div>
        )}
      </motion.div>

      {isAdmin && (activationQuery.isLoading ? (
        <motion.div variants={cardVariants} data-testid="dashboard-activation-widget">
          <ActivationChecklistSkeleton />
        </motion.div>
      ) : activationQuery.isSuccess && activationQuery.data?.shouldShow ? (
        <motion.div variants={cardVariants} data-testid="dashboard-activation-widget">
          <ErrorBoundary fallbackRender={() => null}>
            <AdminActivationChecklist data={activationQuery.data} />
          </ErrorBoundary>
        </motion.div>
      ) : null)}
    </div>
  );

  // Rám #1b: hlavní sloupec = stav chaty a pobytu, boční panel = co visí na mně, pozornost a vzkaz (#356). Další příjezd je jen v hlavičce (#272).
  const aside = (
    <div className="dashboard-aside" data-testid="dashboard-aside">
      {isDesktop && nudges}
      {isDesktop && attention}
      {!isGuest && <div data-testid="dashboard-handover-widget">
        {notesQuery.isLoading ? (
          <PinnedNoteSkeleton />
        ) : notesQuery.isError ? (
          manyFailed ? null : <FeatureErrorFallback title="Nástěnku se nepodařilo načíst" error={notesQuery.error as Error} resetErrorBoundary={() => notesQuery.refetch()} />
        ) : notesQuery.data ? (
          <PinnedNote
            note={pinnedNote}
            author={pinnedNoteAuthor}
            updatedAt={pinnedNoteUpdatedAt}
            onNoteUpdate={(newNote, author, updatedAt) => {
              setPinnedNote(newNote);
              setPinnedNoteAuthor(author ?? null);
              setPinnedNoteUpdatedAt(updatedAt ?? null);
            }}
          />
        ) : null}
      </div>}
    </div>
  );

  return (
    <div className="dashboard-frame">
      <TwoColumnLayout aside={aside} asideLabel="Kontext chaty">{mainColumn}</TwoColumnLayout>
      {/* Výzva k instalaci jednou po 3. návštěvě, na konci stránky (#277) */}
      <InstallCard />
    </div>
  );
}
