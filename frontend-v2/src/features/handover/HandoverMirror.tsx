import type { ReactNode } from "react";
import { Droplets, Flame, Fuel, Package, TriangleAlert } from "lucide-react";
import type { LastHandover } from "@/api/handover";
import { Card } from "@/components/shared/Card";
import { GAS_LABEL, gasStateLabel, type GasValue } from "@/lib/gasLevel";
import { formatDate, formatDateRange, formatTime } from "@/lib/format";

// Štítek plynu tónem stavu (DESIGN.md §2, stavové štítky)
const GAS_TONE: Record<GasValue, string> = {
  full: "bg-(--ok-bg) text-[rgb(var(--ok))]",
  half: "bg-(--ok-bg) text-[rgb(var(--ok))]",
  low: "bg-(--low-bg) text-[rgb(var(--low))]",
  empty: "bg-(--empty-bg) text-[rgb(var(--empty))]",
};

function Row({ icon, className = "", children }: { icon: ReactNode; className?: string; children: ReactNode }) {
  return (
    <li className={`flex items-center gap-3 text-body text-(--text-main) ${className}`}>
      <span aria-hidden="true" className="flex shrink-0 text-(--text-muted)">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}

/**
 * Read-only zrcadlo předávky (spec #173): stejný jazyk jako formulář, bez interakce. Prázdné části
 * skryje, topení a vodu ukáže jen u uvedeného údaje. Znovu ho použije příjezdová karta #174.
 */
export function HandoverMirror({ handover }: { handover: LastHandover }) {
  const { checkoutState: s, completedAt } = handover;
  const who = handover.completedByUsername ?? handover.organizer.username;
  const gas = gasStateLabel(s.gas);
  const rows = [
    s.gas && gas && (
      <Row key="gas" icon={<Fuel className="size-4" />}>
        {GAS_LABEL} <span className={`ml-1 rounded-full px-2 py-1 text-eyebrow uppercase ${GAS_TONE[s.gas]}`}>{gas}</span>
      </Row>
    ),
    s.heatingOff !== undefined && (
      <Row key="heating" icon={<Flame className="size-4" />}>{s.heatingOff ? "Topení vypnuté" : "Topení zapnuté"}</Row>
    ),
    s.waterOff !== undefined && (
      <Row key="water" icon={<Droplets className="size-4" />}>{s.waterOff ? "Voda uzavřená" : "Voda otevřená"}</Row>
    ),
    s.broken && (
      <Row key="broken" className="rounded-xl bg-(--low-bg) p-3" icon={<TriangleAlert className="size-4 text-[rgb(var(--low))]" />}>
        <strong>Potřebuje pozornost:</strong> {s.broken}
      </Row>
    ),
    s.leftBehind && <Row key="left" icon={<Package className="size-4" />}>Nechal/a: {s.leftBehind}</Row>,
  ].filter(Boolean);

  return (
    <Card as="section" aria-labelledby="handover-mirror-title" className="flex flex-col gap-3">
      <div>
        <h2 id="handover-mirror-title" className="text-card-title text-(--text-main)">Od minule · {who}</h2>
        <p className="text-meta text-(--text-muted)">
          Pobyt {formatDateRange(handover.from, handover.to)}
          {completedAt && ` · předáno ${formatDate(completedAt)} v ${formatTime(completedAt)}`}
        </p>
      </div>
      {rows.length > 0 && <ul className="flex flex-col gap-2">{rows}</ul>}
      {s.note && (
        <figure className="flex flex-col gap-1 rounded-xl bg-inset p-3">
          <blockquote className="text-body text-(--text-main)">„{s.note}“</blockquote>
          <figcaption className="text-meta text-(--text-muted)">{who}</figcaption>
        </figure>
      )}
    </Card>
  );
}
