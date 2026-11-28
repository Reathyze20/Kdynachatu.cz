import { Link } from "react-router-dom";
import { KeyRound } from "lucide-react";
import type { Reservation } from "@/api/reservations";
import { FeatureErrorFallback } from "@/components/shared/FeatureErrorFallback";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { HandoverMirror } from "@/features/handover/HandoverMirror";
import { addIsoDays, getLocalTodayIso } from "@/lib/dateUtils";
import { useCheckoutStatus } from "../hooks/useReservations";
import { CheckoutSection } from "./CheckoutSection";

// Detail leží v papírovém panelu, předávka je v něm vnořený blok (DESIGN.md §7: karta v kartě rounded-xl, bg-inset).
const NESTED = "rounded-xl border-0 bg-inset p-4 shadow-none md:p-4";

/** Můj (organizátor nebo spolucestující) hlavní pobyt v okně předávky: den odjezdu a den po něm (spec #173). */
function isMyStayInHandoverWindow(r: Reservation, userId: string | undefined): boolean {
  if (!userId || (r.status ?? "primary") !== "primary") return false;
  const mine = r.userId === userId || !!r.participants?.some((p) => p.userId === userId);
  const today = getLocalTodayIso();
  return mine && (r.to === today || r.to === addIsoDays(today, -1));
}

/**
 * Předávka v detailu pobytu (#222). Dokončená předávka je read-only zrcadlo (stejné jako tab Předávka),
 * u mého pobytu v okně předávky je odkaz na tab Předávka, jinak nic. Výjimka: host tab Předávka nemá
 * (`GET /api/handover` mu vrací 403), svou předávku proto dokončí tady formulářem `CheckoutSection`.
 */
export function StayHandover({ reservation: r }: { reservation: Reservation }) {
  const { user, isGuest } = useAuth();
  const completed = !!r.isCheckoutCompleted;
  const status = useCheckoutStatus(r.id, completed);

  if (completed) {
    if (status.data) {
      const { checkoutCompletedAt: completedAt, checkoutCompletedByUsername: completedByUsername, checkoutState } = status.data;
      return (
        <HandoverMirror title="Odjezd potvrzen" className={NESTED}
          handover={{ from: r.from, to: r.to, completedAt, completedByUsername, checkoutState: checkoutState ?? {} }} />
      );
    }
    if (status.isError) {
      return <FeatureErrorFallback bare error={status.error} resetErrorBoundary={() => void status.refetch()} title="Předávku se nepodařilo načíst" />;
    }
    return <div role="status" aria-busy="true" aria-label="Načítám předávku" className="skeleton h-24 rounded-xl" />;
  }

  if (isGuest) return <CheckoutSection reservation={r} />;
  if (!isMyStayInHandoverWindow(r, user?.userId)) return null;
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl bg-inset p-4">
      <p className="text-body text-(--text-main)">Odjíždíš? Napiš dalšímu, v jakém stavu chatu necháváš.</p>
      <Button asChild>
        <Link to="/handover">
          <KeyRound aria-hidden="true" />
          Předat chatu
        </Link>
      </Button>
    </div>
  );
}
