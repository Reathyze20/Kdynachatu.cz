/**
 * Tab Předávka (spec #173): poslední předávka v chatě a karta mého pobytu (#216), ve fázi `departure`
 * (nebo po „Odjíždím dřív“) formulář „Předat chatu“ a po předání shrnutí (#218).
 */
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import type { HandoverOverview } from "@/api/handover";
import type { CheckoutStatus } from "@/api/reservations";
import { TwoColumnLayout } from "@/components/layout/TwoColumnLayout";
import { Card } from "@/components/shared/Card";
import { EmptyState } from "@/components/shared/EmptyState";
import { FeatureErrorFallback } from "@/components/shared/FeatureErrorFallback";
import { PageHeader } from "@/components/shared/PageHeader";
import { PendingSyncBadge } from "@/components/shared/PendingSyncBadge";
import { Button } from "@/components/ui/button";
import { useCheckoutStatus, useHandoverOverview } from "@/features/reservations/hooks/useReservations";
import { useCheckoutPending } from "@/hooks/useOfflineQueue";
import { formatDateRange } from "@/lib/format";
import { HandoverForm } from "./HandoverForm";
import { HandoverMirror } from "./HandoverMirror";

const TITLE = "text-card-title text-(--text-main)";
const HINT = "text-meta text-(--text-muted)";

function MyStayCard({ stay, onLeaveEarly }: { stay: HandoverOverview["myStay"]; onLeaveEarly: () => void }) {
  if (!stay) {
    return (
      <Card>
        <EmptyState
          icon={CalendarDays}
          message="Teď nemáš naplánovaný žádný pobyt."
          action={{ label: "Otevřít Kalendář", icon: CalendarDays, to: "/reservations" }}
        />
      </Card>
    );
  }
  return (
    <Card as="section" aria-labelledby="my-handover-title" className="flex flex-col gap-1">
      <h2 id="my-handover-title" className={TITLE}>Tvoje předávka</h2>
      <p className="text-body text-(--text-main)">Otevře se, až budeš odjíždět.</p>
      <p className={HINT}>Tvůj pobyt {formatDateRange(stay.from, stay.to)}</p>
      {stay.phase === "ongoing" && <Button variant="secondary" className="mt-2 self-start" onClick={onLeaveEarly}>Odjíždím dřív – předat teď</Button>}
    </Card>
  );
}

/** Můj pobyt: formulář, čekání v offline frontě, shrnutí „Chata předána“, jinak „Od minule“ a karta pobytu. */
function MyHandover({ overview: { myStay: stay, lastHandover } }: { overview: HandoverOverview }) {
  const id = stay?.reservationId ?? "";
  const [leavingEarly, setLeavingEarly] = useState(false);
  const [editing, setEditing] = useState(false);
  const [queued, setQueued] = useState(false);
  const [saved, setSaved] = useState<CheckoutStatus | null>(null);
  const pending = useCheckoutPending(id);
  const status = useCheckoutStatus(id, !!stay?.isCheckoutCompleted);
  const current = status.data ?? saved;
  const inWindow = stay?.phase === "departure" || leavingEarly;

  if (stay && (pending || (queued && !stay.isCheckoutCompleted))) {
    return <Card as="section" role="status" className="flex flex-col items-start gap-2"><h2 className={TITLE}>Čeká na připojení</h2>
      <p className="text-body text-(--text-main)">Předávka se odešle automaticky, jakmile bude signál.</p><PendingSyncBadge /></Card>;
  }
  if (stay && (editing || (inWindow && !stay.isCheckoutCompleted && !saved))) {
    return (
      <HandoverForm reservationId={id} stayRange={formatDateRange(stay.from, stay.to)} initial={editing ? current?.checkoutState : null}
        onSaved={(next) => { setSaved(next); setEditing(false); }} onQueued={() => { setQueued(true); setEditing(false); }} />
    );
  }
  if (stay && (stay.isCheckoutCompleted || saved)) {
    if (!current) return status.isError
      ? <FeatureErrorFallback error={status.error} resetErrorBoundary={() => void status.refetch()} title="Předávku se nepodařilo načíst" />
      : <div role="status" aria-busy="true" aria-label="Načítám předávku" className="skeleton h-40 rounded-2xl" />;
    const { checkoutCompletedAt: completedAt, checkoutCompletedByUsername: completedByUsername, checkoutState } = current;
    return (
      <HandoverMirror title="Chata předána" handover={{ ...stay, completedAt, completedByUsername, checkoutState: checkoutState ?? {} }}>
        {stay.phase === "departure" && <Button variant="secondary" className="self-start" onClick={() => setEditing(true)}>Upravit předávku</Button>}
      </HandoverMirror>
    );
  }
  return (
    <>
      {lastHandover && <HandoverMirror handover={lastHandover} />}
      <MyStayCard stay={stay} onLeaveEarly={() => setLeavingEarly(true)} />
    </>
  );
}

export function HandoverPage() {
  const { data, isPending, isError, error, refetch } = useHandoverOverview();
  return (
    <div className="flex flex-col gap-4 p-3 md:gap-6 md:p-0" data-testid="handover-page">
      <PageHeader title="Předávka chaty" />
      <TwoColumnLayout>
        <div className="flex flex-col gap-4 md:gap-6">
          {isPending ? (
            <div role="status" aria-busy="true" aria-label="Načítám předávku" className="flex flex-col gap-4 md:gap-6">
              <div className="skeleton h-40 rounded-2xl" />
              <div className="skeleton h-24 rounded-2xl" />
            </div>
          ) : isError && !data ? (
            <FeatureErrorFallback
              error={error}
              resetErrorBoundary={() => void refetch()}
              title="Předávku se nepodařilo načíst"
            />
          ) : (
            <MyHandover key={data.myStay?.reservationId} overview={data} />
          )}
        </div>
      </TwoColumnLayout>
    </div>
  );
}
