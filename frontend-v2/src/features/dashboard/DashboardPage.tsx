import { useState, useEffect } from "react";
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import apiClient from "@/api/client";
import { fetchWeather } from "@/api/dashboard";
import type { CabinSettings, DashboardActivationData, DashboardReservationsData, DashboardShoppingData, DashboardNotesData } from "@/api/dashboard";
import { DashboardActivationSchema, DashboardReservationsSchema, DashboardShoppingSchema, DashboardNotesSchema } from "@/api/schemas";
import { ActiveReservation } from "./ActiveReservation";
import { AdminActivationChecklist } from "./AdminActivationChecklist";
import { PinnedNote } from "./PinnedNote";
import { DepartureBanner } from "./DepartureBanner";
import { NudgeTray } from "./NudgeTray";
import { RunningLowCard } from "./RunningLowCard";
import { CabinHero } from "./CabinHero";
import { InstallCard } from "@/components/shared/InstallCard";
import { DASHBOARD_RESERVATIONS_KEY } from "@/features/reservations/hooks/useReservations";
import { DASHBOARD_SHOPPING_KEY } from "@/features/shopping/hooks/useShoppingLists";
import { FeatureErrorFallback } from "@/components/shared/FeatureErrorFallback";
import { TwoColumnLayout } from "@/components/layout/TwoColumnLayout";
import { motion } from "framer-motion";
import { TriangleAlert } from "lucide-react";

// ─── Skeletons ────────────────────────────────────────────────────────

export function StatusCardSkeleton() {
  return (
    <div className="glass-card status-card" id="dashboard-active-reservation">
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
    </div>
  );
}

export function PinnedNoteSkeleton() {
  return (
    <div className="glass-card dashboard-handover-card" id="dashboard-handover-note">
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
    </div>
  );
}

export function ActivationChecklistSkeleton() {
  return (
    <div className="glass-card dashboard-activation-inline-card">
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
    </div>
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
  const { isAdmin } = useAuth();
  const [pinnedNote, setPinnedNote] = useState<string | null>(null);
  const [pinnedNoteAuthor, setPinnedNoteAuthor] = useState<string | null>(null);
  const [pinnedNoteUpdatedAt, setPinnedNoteUpdatedAt] = useState<string | null>(null);

  // Cabin info
  const cabinQuery = useQuery<CabinSettings>({
    queryKey: ["cabin"],
    queryFn: () => apiClient.get<CabinSettings>("/cabin").then((r) => r.data),
    staleTime: 60_000,
  });

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
    refetchInterval: 5 * 60 * 1000,
    staleTime: 30_000,
  });

  const notesQuery = useQuery<DashboardNotesData>({
    queryKey: ["dashboard", "notes"],
    queryFn: async () => {
      const { data } = await apiClient.get<DashboardNotesData>("/dashboard/notes");
      return DashboardNotesSchema.parse(data) as DashboardNotesData;
    },
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

  // Weather is fetched client-side using cabin's weatherLocation
  const weatherQuery = useQuery({
    queryKey: ["weather", cabinQuery.data?.weatherLocation ?? null],
    queryFn: () => fetchWeather(cabinQuery.data?.weatherLocation),
    enabled: cabinQuery.isSuccess,
    staleTime: 10 * 60 * 1000,
  });

  const cabinError = cabinQuery.isError;
  const isWinterized = !!cabinQuery.data?.isWinterized;
  const departureChecklist = cabinQuery.data?.departureChecklist ?? [];

  const mainColumn = (
    <div className="dashboard nordic-dashboard" data-testid="dashboard-page">
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

      {/* Cabin error banner */}
      {cabinError && (
        <div className="essential-warning-banner" style={{ borderLeftColor: 'var(--status-warning)' }}>
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
        />
      )}

      {/* Nudge tray — timely coordination prompts derived from existing data */}
      <NudgeTray reservations={reservationsQuery.data} shopping={shoppingQuery.data} />

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
            <ErrorBoundary FallbackComponent={(props) => <FeatureErrorFallback {...props} title="Rezervace se nepodařilo načíst" />}>
              <FeatureErrorFallback title="Rezervace se nepodařilo načíst" error={reservationsQuery.error as Error} resetErrorBoundary={() => reservationsQuery.refetch()} />
            </ErrorBoundary>
          ) : reservationsQuery.data ? (
            <ActiveReservation data={reservationsQuery.data} cabinDepartureChecklist={departureChecklist} />
          ) : null}
        </motion.div>
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

  // Rám #1b: hlavní sloupec = akce a stav, boční panel = lehký kontext (dochází, vzkaz). Další příjezd je jen v hlavičce (#272). Počasí je jen řádek v pruhu nahoře (mock 01).
  const aside = (
    <div className="dashboard-aside" data-testid="dashboard-aside">
      {shoppingQuery.isError ? (
        <FeatureErrorFallback title="Zásoby se nepodařilo načíst" error={shoppingQuery.error as Error} resetErrorBoundary={() => shoppingQuery.refetch()} />
      ) : shoppingQuery.data ? (
        <RunningLowCard data={shoppingQuery.data} />
      ) : null}
      <div data-testid="dashboard-handover-widget">
        {notesQuery.isLoading ? (
          <PinnedNoteSkeleton />
        ) : notesQuery.isError ? (
          <FeatureErrorFallback title="Nástěnku se nepodařilo načíst" error={notesQuery.error as Error} resetErrorBoundary={() => notesQuery.refetch()} />
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
      </div>
    </div>
  );

  // Kompaktní pruh chaty nad oběma sloupci (mock 01b: hero nad hlavním sloupcem i bočním panelem).
  return (
    <div className="dashboard-frame">
      <CabinHero cabinName={cabinQuery.data?.name} weather={weatherQuery.data} />
      <TwoColumnLayout aside={aside} asideLabel="Kontext chaty">{mainColumn}</TwoColumnLayout>
      {/* Výzva k instalaci jednou po 3. návštěvě, na konci stránky (#277) */}
      <InstallCard />
    </div>
  );
}
