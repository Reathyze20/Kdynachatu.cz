/**
 * Tab Předávka (#216, spec #173): poslední předávka v chatě a karta mého pobytu.
 * Formulář je zatím v detailu pobytu v Kalendáři; ve fázi `departure` na něj vede dočasná karta.
 */
import { Link } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import type { HandoverOverview } from "@/api/handover";
import { TwoColumnLayout } from "@/components/layout/TwoColumnLayout";
import { Card } from "@/components/shared/Card";
import { FeatureErrorFallback } from "@/components/shared/FeatureErrorFallback";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useHandoverOverview } from "@/features/reservations/hooks/useReservations";
import { formatDateRange } from "@/lib/format";
import { HandoverMirror } from "./HandoverMirror";

const TITLE = "text-card-title text-(--text-main)";
const HINT = "text-meta text-(--text-muted)";

function CalendarLink({ label }: { label: string }) {
  return (
    <Button asChild variant="secondary" className="self-start">
      <Link to="/reservations"><CalendarDays aria-hidden="true" />{label}</Link>
    </Button>
  );
}

function MyStayCard({ stay }: { stay: HandoverOverview["myStay"] }) {
  if (!stay) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="text-body text-(--text-main)">Teď nemáš naplánovaný žádný pobyt. Předávka se otevře v den tvého odjezdu.</p>
        <CalendarLink label="Otevřít Kalendář" />
      </Card>
    );
  }
  const range = formatDateRange(stay.from, stay.to);
  if (stay.phase === "departure") {
    return (
      <Card as="section" aria-labelledby="my-handover-title" className="flex flex-col gap-3">
        <h2 id="my-handover-title" className={TITLE}>{stay.isCheckoutCompleted ? "Chata předána" : "Dnes odjíždíš"}</h2>
        <p className={HINT}>Tvůj pobyt {range}. Předávku najdeš v detailu pobytu v Kalendáři.</p>
        <CalendarLink label={stay.isCheckoutCompleted ? "Otevřít Kalendář" : "Předat chatu v Kalendáři"} />
      </Card>
    );
  }
  return (
    <Card as="section" aria-labelledby="my-handover-title" className="flex flex-col gap-1">
      <h2 id="my-handover-title" className={TITLE}>Tvoje předávka</h2>
      <p className="text-body text-(--text-main)">Otevře se, až budeš odjíždět.</p>
      <p className={HINT}>Tvůj pobyt {range}</p>
    </Card>
  );
}

export function HandoverPage() {
  const { data, isPending, isError, error, refetch } = useHandoverOverview();
  return (
    <div className="flex flex-col gap-4 p-3 md:gap-6 md:p-0" data-testid="handover-page">
      <PageHeader title="Předávka" />
      <TwoColumnLayout>
        <div className="flex flex-col gap-4 md:gap-6">
          {isPending ? (
            <div aria-busy="true" aria-label="Načítám předávku" className="flex flex-col gap-4 md:gap-6">
              <div className="skeleton h-40 rounded-2xl" />
              <div className="skeleton h-24 rounded-2xl" />
            </div>
          ) : isError ? (
            <FeatureErrorFallback
              error={error}
              resetErrorBoundary={() => void refetch()}
              title="Předávku se nepodařilo načíst"
            />
          ) : (
            <>
              {data.lastHandover && <HandoverMirror handover={data.lastHandover} />}
              <MyStayCard stay={data.myStay} />
            </>
          )}
        </div>
      </TwoColumnLayout>
    </div>
  );
}
