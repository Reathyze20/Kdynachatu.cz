import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/api/client";
import type { Reservation } from "@/api/reservations";
import { CheckoutSection } from "./CheckoutSection";
import { useAuth } from "@/context/AuthContext";
import { AnimalAvatar } from "@/components/shared/AnimalAvatar";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { escapeHtml } from "@/lib/utils";
import { toMemberColor } from "@/lib/memberPalette";
import { getNetworkAwareActionMessage } from "@/lib/networkError";
import { showToast } from "@/lib/toast";
import { RESERVATION_TYPE_LABEL } from "../reservationType";
import { StayWeatherCard } from "@/features/weather/StayWeatherCard";

const MONTH_NAMES_GEN = [
  "Ledna", "Února", "Března", "Dubna", "Května", "Června",
  "Července", "Srpna", "Září", "Října", "Listopadu", "Prosince",
];

function formatDateFull(date: string): string {
  if (!date) return "";
  const d = new Date(date + "T00:00:00");
  return `${d.getDate()}. ${MONTH_NAMES_GEN[d.getMonth()]}`;
}

interface WatchStatus { watching: boolean }

interface Props {
  reservation: Reservation;
  onBack: () => void;
  onEdit: (r: Reservation) => void;
  onDelete: (id: string) => Promise<void> | void;
  onAssign: (id: string) => void;
}

export function ReservationDetail({ reservation: r, onBack, onEdit, onDelete, onAssign }: Props) {
  const { user, isGuest } = useAuth();
  const isMine = r.userId === user?.userId;
  const isAdmin = user?.role === "admin";
  const canEdit = isMine || isAdmin;
  const memberColor = toMemberColor(r.userColor);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [watchSubmitting, setWatchSubmitting] = useState(false);

  // Night count for timeline
  const nightCount = r.from && r.to
    ? Math.round((new Date(r.to + "T00:00:00").getTime() - new Date(r.from + "T00:00:00").getTime()) / 86400000)
    : 0;

  // Typ jako na kartě v seznamu; štítek 14 px (G3), velká písmena jen stylem.
  const status = r.status ?? "primary";
  const statusCls = { primary: "bg-accent text-primary", backup: "bg-amber-50 text-amber-700", soft: "bg-slate-50 text-slate-700" }[status];

  // Watch status
  const { data: watchData, refetch: refetchWatch } = useQuery<WatchStatus>({
    queryKey: ["watch", r.id],
    queryFn: () => apiClient.get<WatchStatus>(`/reservations/${r.id}/watch`).then((res) => res.data),
    enabled: !isMine && !isGuest, // hlídání termínu host nemá (#484)
  });

  const handleWatchToggle = async (watching: boolean) => {
    setWatchSubmitting(true);
    try {
      const method = watching ? "delete" : "post";
      await apiClient[method](`/reservations/${r.id}/watch`);
      await refetchWatch();
    } catch (error) {
      showToast(
        getNetworkAwareActionMessage(
          error,
          "Nepodařilo se změnit hlídání termínu.",
          "Spojení vypadlo dřív, než se hlídání termínu stihlo změnit. Zkus to znovu po obnovení připojení.",
        ),
        "error",
      );
    } finally {
      setWatchSubmitting(false);
    }
  };

  const handleConfirmedDelete = async () => {
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      await onDelete(r.id);
      setDeleteConfirmOpen(false);
    } catch (error) {
      setDeleteError(
        getNetworkAwareActionMessage(
          error,
          "Rezervaci se nepodařilo smazat. Zkus to znovu.",
          "Spojení vypadlo dřív, než se rezervace stihla smazat. Zkus to znovu po obnovení připojení.",
        ),
      );
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-[24px] p-5 shadow-sm flex flex-col gap-5 overflow-hidden" data-testid="reservation-detail-card">
      {/* ── Header: User left, Badge right ── */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2.5">
          <AnimalAvatar
            icon={r.userAnimalIcon}
            username={r.username}
            color={memberColor}
            size={42}
          />
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: memberColor }} />
          <strong className="text-[16px] font-bold text-slate-800">{r.username}</strong>
        </div>
        <span className={`${statusCls} px-2.5 py-1 rounded-full text-xs font-bold tracking-wide uppercase`}>{RESERVATION_TYPE_LABEL[status]}</span>
      </div>

      {/* ── Timeline Widget ── */}
      <div className="bg-slate-50 border border-slate-100/60 rounded-[20px] p-4 flex items-center justify-between mt-1">
        <div className="flex flex-col gap-1 z-10 text-left">
          <span className="text-[10px] font-bold text-[var(--text-placeholder)] uppercase tracking-widest">Příjezd</span>
          <span className="font-bold text-[15px] text-slate-900">{formatDateFull(r.from)}</span>
        </div>
        
        <div className="flex-1 mx-4 flex items-center justify-center relative">
          <div className="w-full h-[1px] bg-slate-200 absolute"></div>
          <span className="bg-white px-2.5 py-0.5 rounded-full text-[11px] font-medium text-slate-600 shadow-sm z-10 whitespace-nowrap">
            {nightCount} {nightCount === 1 ? "noc" : nightCount > 1 && nightCount < 5 ? "noci" : "nocí"}
          </span>
        </div>

        <div className="flex flex-col gap-1 z-10 text-right">
          <span className="text-[10px] font-bold text-[var(--text-placeholder)] uppercase tracking-widest">Odjezd</span>
          <span className="font-bold text-[15px] text-slate-900">{formatDateFull(r.to)}</span>
        </div>
      </div>

      {/* ── Data Fields (hidden if empty) ── */}
      {r.purpose && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-[var(--text-placeholder)] uppercase tracking-widest">Účel</span>
          <span className="text-slate-800 font-medium text-[15px]">{r.purpose}</span>
        </div>
      )}
      {r.notes && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Poznámka</span>
          <span
            className="text-sm text-slate-600 bg-[var(--color-bg-alt)] p-3 rounded-xl border border-slate-100/60 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: escapeHtml(r.notes) }}
          />
        </div>
      )}
      {r.handoverNote && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vzkaz pro další</span>
          <span
            className="text-sm text-amber-900 bg-amber-50/50 p-3 rounded-xl leading-relaxed"
            dangerouslySetInnerHTML={{ __html: escapeHtml(r.handoverNote) }}
          />
        </div>
      )}

      {/* ── Co-occupants (spolucestující) ── */}
      {r.participants && r.participants.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Také jede</span>
          <div className="flex flex-wrap gap-2.5 mt-1">
            {r.participants.map((p) => (
              <span key={p.userId} className="inline-flex items-center gap-2" title={p.username}>
                <AnimalAvatar icon={p.userAnimalIcon ?? null} username={p.username} color={p.userColor || undefined} size={28} />
                <span className="text-sm font-medium text-slate-700">{p.username}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <StayWeatherCard from={r.from} to={r.to} />
      {/* ── Checkout ── */}
      <CheckoutSection reservation={r} />

      {/* ── Action Bar (footer) ── */}
      <div className="flex justify-between items-center mt-1 pt-4 border-t border-slate-100">
        <div className="flex gap-4 items-center">
          <button className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors" onClick={onBack} data-testid="reservation-back-button">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Zpět
          </button>
          {canEdit && (
            <button
              className="text-[13px] font-medium text-red-600 hover:text-red-700 transition-colors"
              onClick={() => setDeleteConfirmOpen(true)}
              data-testid="reservation-delete-button"
            >
              Smazat
            </button>
          )}
        </div>
        <div className="flex gap-2 items-center">
          {!isMine && !isGuest && (
            watchData?.watching ? (
              <button className="px-3 py-1.5 rounded-[12px] text-[12px] font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-sm" onClick={() => void handleWatchToggle(true)} disabled={watchSubmitting} data-testid="reservation-watch-button">
                Zrušit
              </button>
            ) : (
              <button className="px-3 py-1.5 rounded-[12px] text-[12px] font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-sm" title="Když se termín uvolní, objeví se to na nástěnce chaty" onClick={() => void handleWatchToggle(false)} disabled={watchSubmitting} data-testid="reservation-watch-button">
                Hlídat
              </button>
            )
          )}
          {canEdit && isAdmin && (
            <button className="px-3 py-1.5 rounded-[12px] text-[12px] font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-sm" onClick={() => onAssign(r.id)} data-testid="reservation-assign-button">
              Přiřadit
            </button>
          )}
          {canEdit && (
            <button className="px-4 py-1.5 rounded-[12px] text-[12px] font-semibold bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary-hover)] transition-colors shadow-sm" onClick={() => onEdit(r)} data-testid="reservation-edit-button">
              Upravit
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Smazat rezervaci"
        message="Opravdu chceš smazat tuto rezervaci? Tato akce je nevratná."
        confirmLabel="Smazat"
        danger
        loading={deleteSubmitting}
        errorMessage={deleteError}
        onConfirm={() => void handleConfirmedDelete()}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setDeleteError(null);
        }}
      />
    </div>
  );
}
