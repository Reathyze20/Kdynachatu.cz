import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, EllipsisVertical, Eye, Trash2 } from "lucide-react";
import apiClient from "@/api/client";
import type { Reservation } from "@/api/reservations";
import { StayHandover } from "./StayHandover";
import { useAuth } from "@/context/AuthContext";
import { AnimalAvatar } from "@/components/shared/AnimalAvatar";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { escapeHtml } from "@/lib/utils";
import { getLocalTodayIso, nightsBetween, nightsLabel } from "@/lib/dateUtils";
import { formatLongDate } from "@/lib/format";
import { toMemberColor } from "@/lib/memberPalette";
import { getNetworkAwareActionMessage } from "@/lib/networkError";
import { showToast } from "@/lib/toast";
import { RESERVATION_TYPE_CLASS, RESERVATION_TYPE_LABEL } from "../reservationType";
import { StayWeatherCard } from "@/features/weather/StayWeatherCard";

interface WatchStatus { watching: boolean }

const EYEBROW = "text-eyebrow uppercase text-(--text-muted)";

interface Props {
  reservation: Reservation;
  onBack: () => void;
  onEdit: (r: Reservation) => void;
  onDelete: (id: string) => Promise<void> | void;
}

export function ReservationDetail({ reservation: r, onBack, onEdit, onDelete }: Props) {
  const { user, isGuest } = useAuth();
  const isMine = r.userId === user?.userId;
  const isAdmin = user?.role === "admin";
  const canEdit = isMine || isAdmin;
  const memberColor = toMemberColor(r.userColor);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [watchSubmitting, setWatchSubmitting] = useState(false);
  // Hlídat jde jen cizí pobyt, který ještě neskončil; host hlídání nemá (#484, #506).
  const canWatch = !isMine && !isGuest && r.to >= getLocalTodayIso();

  // Night count for timeline
  const nightCount = r.from && r.to ? nightsBetween(r.from, r.to) : 0;

  // Typ jako na kartě v seznamu (stejný štítek).
  const status = r.status ?? "primary";

  // Watch status
  const { data: watchData, refetch: refetchWatch } = useQuery<WatchStatus>({
    queryKey: ["watch", r.id],
    queryFn: () => apiClient.get<WatchStatus>(`/reservations/${r.id}/watch`).then((res) => res.data),
    enabled: canWatch,
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

  // Leží v papírovém bočním panelu (karta), proto bez vlastní karty; vnořené bloky jsou bg-inset.
  return (
    <article className="flex flex-col gap-4" aria-label={`Rezervace ${r.username}`} data-testid="reservation-detail-card">
      {/* ── Zpět vlevo, akce nad rezervací vpravo (DESIGN.md §7) ── */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-3 text-primary" onClick={onBack} data-testid="reservation-back-button">
          <ChevronLeft aria-hidden="true" />
          Zpět
        </Button>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => onEdit(r)} data-testid="reservation-edit-button">
              Upravit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Další akce">
                  <EllipsisVertical aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem variant="danger" onSelect={() => setDeleteConfirmOpen(true)} data-testid="reservation-delete-button">
                  <Trash2 aria-hidden="true" />
                  Smazat
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* ── Header: User left, Badge right ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AnimalAvatar icon={r.userAnimalIcon} username={r.username} color={memberColor} size={42} />
          <h2 className="text-card-title text-(--text-main) [overflow-wrap:anywhere]">{r.username}</h2>
        </div>
        <span className={RESERVATION_TYPE_CLASS[status]}>{RESERVATION_TYPE_LABEL[status]}</span>
      </div>

      {/* ── Timeline Widget ── */}
      <div className="flex items-center justify-between rounded-xl bg-inset p-4">
        <div className="flex flex-col gap-1 text-left">
          <span className={EYEBROW}>Příjezd</span>
          <span className="text-body font-semibold text-(--text-main)">{formatLongDate(r.from)}</span>
        </div>
        <div className="relative mx-3 flex flex-1 items-center justify-center">
          <div className="absolute h-px w-full bg-rule-soft" />
          <span className="relative whitespace-nowrap rounded-full bg-sheet px-2.5 py-0.5 text-meta text-(--text-muted)">
            {nightCount} {nightsLabel(nightCount)}
          </span>
        </div>
        <div className="flex flex-col gap-1 text-right">
          <span className={EYEBROW}>Odjezd</span>
          <span className="text-body font-semibold text-(--text-main)">{formatLongDate(r.to)}</span>
        </div>
      </div>

      {/* ── Data Fields (hidden if empty) ── */}
      {r.purpose && (
        <div className="flex flex-col gap-1.5">
          <span className={EYEBROW}>Účel</span>
          <span className="text-body text-(--text-main)">{r.purpose}</span>
        </div>
      )}
      {r.notes && (
        <div className="flex flex-col gap-1.5">
          <span className={EYEBROW}>Poznámka</span>
          <span
            className="rounded-xl bg-inset p-3 text-body text-(--text-main)"
            dangerouslySetInnerHTML={{ __html: escapeHtml(r.notes) }}
          />
        </div>
      )}
      {r.handoverNote && (
        <div className="flex flex-col gap-1.5">
          <span className={EYEBROW}>Vzkaz pro další</span>
          <span
            className="rounded-xl bg-(--status-warning-light) p-3 text-body text-(--text-main)"
            dangerouslySetInnerHTML={{ __html: escapeHtml(r.handoverNote) }}
          />
        </div>
      )}

      {/* ── Co-occupants (spolucestující) ── */}
      {r.participants && r.participants.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={EYEBROW}>Také jede</span>
          <div className="flex flex-wrap gap-2.5 mt-1">
            {r.participants.map((p) => (
              <span key={p.userId} className="inline-flex items-center gap-2" title={p.username}>
                <AnimalAvatar icon={p.userAnimalIcon ?? null} username={p.username} color={p.userColor || undefined} size={28} />
                <span className="text-body text-(--text-main)">{p.username}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {canWatch && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-inset p-3" data-testid="reservation-watch">
          <div className="flex flex-col gap-0.5">
            {watchData?.watching && (
              <span className="inline-flex items-center gap-1.5 text-label text-foreground">
                <Eye aria-hidden="true" className="size-4" />
                Hlídám
              </span>
            )}
            <p className="text-meta text-(--text-muted)">Až se termín uvolní, objeví se to na nástěnce chaty.</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleWatchToggle(!!watchData?.watching)}
            pending={watchSubmitting}
            data-testid="reservation-watch-button"
          >
            {watchData?.watching ? "Přestat hlídat" : "Hlídat"}
          </Button>
        </div>
      )}

      <StayWeatherCard from={r.from} to={r.to} />
      <StayHandover reservation={r} />

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
    </article>
  );
}
