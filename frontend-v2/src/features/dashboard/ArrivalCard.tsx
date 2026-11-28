/**
 * Příjezdová karta „přivítání“ (#174, návrh #3 = všech pět dílů A). Hero nahoře na Přehledu den před
 * mým příjezdem a v den příjezdu, pak se stáhne: po „Potvrdit příjezd“ nebo po dni příjezdu. Ukazuje vzkaz
 * od minule jako citaci, stav chaty jako read-only zrcadlo předávky (`HandoverMirror`) a co dochází s odkazem
 * do Zásob. Kdy se ukáže, rozhoduje `useArrival`.
 */
import { useId } from "react";
import { Link } from "react-router-dom";
import type { AttentionItem } from "@/api/dashboard";
import { Card } from "@/components/shared/Card";
import { Button } from "@/components/ui/button";
import { HandoverMirror } from "@/features/handover/HandoverMirror";
import { formatDateRange } from "@/lib/format";
import type { Arrival } from "./useArrival";

export function ArrivalCard({ arrival, supplies = [] }: { arrival: Arrival; supplies?: AttentionItem[] }) {
  const headingId = useId();
  const { stay, lastHandover, arrivesToday, confirm } = arrival;
  const note = lastHandover?.checkoutState.note;
  const author = lastHandover ? lastHandover.completedByUsername ?? lastHandover.organizer.username : null;

  return (
    <Card as="section" className="flex flex-col gap-4" aria-labelledby={headingId} data-testid="dashboard-arrival-card">
      <div className="rounded-xl bg-accent p-4">
        <h2 id={headingId} className="m-0 text-card-title text-(--text-main)">Vítej na chatě</h2>
        <p className="text-meta text-(--text-muted)">
          {arrivesToday ? "Dnes přijíždíš" : "Zítra přijíždíš"} · tvůj pobyt {formatDateRange(stay.from, stay.to)}
        </p>
      </div>

      <div className={supplies.length > 0 ? "grid gap-4 md:grid-cols-[3fr_2fr]" : "flex flex-col gap-4"}>
        <div className="flex flex-col gap-4">
          {note && (
            <figure className="flex flex-col gap-1 rounded-xl bg-inset p-3">
              <blockquote className="text-body text-(--text-main)">„{note}“</blockquote>
              {author && <figcaption className="text-meta text-(--text-muted)">{author}</figcaption>}
            </figure>
          )}
          {lastHandover ? (
            // Vzkaz už je nahoře jako citace, zrcadlo ho neopakuje
            <HandoverMirror handover={{ ...lastHandover, checkoutState: { ...lastHandover.checkoutState, note: undefined } }} nested />
          ) : (
            <p className="text-body text-(--text-muted)">Od minule tu žádná předávka není.</p>
          )}
        </div>

        {supplies.length > 0 && (
          <div className="flex flex-col items-start gap-2 self-start rounded-xl bg-inset p-4">
            <h3 className="text-card-title text-(--text-main)">Co dochází</h3>
            <p className="text-body text-(--text-main)">{supplies.map((s) => s.name).join(", ")}</p>
            <Button asChild variant="secondary" size="sm">
              <Link to="/shopping?view=pantry">Otevřít Zásoby</Link>
            </Button>
          </div>
        )}
      </div>

      {arrivesToday && (
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <Button size="lg" onClick={confirm}>Potvrdit příjezd</Button>
          <p className="text-meta text-(--text-muted)">Až dorazíš, potvrď příjezd a karta se schová.</p>
        </div>
      )}
    </Card>
  );
}
