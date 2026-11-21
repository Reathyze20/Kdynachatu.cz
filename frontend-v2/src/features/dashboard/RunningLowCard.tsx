/**
 * RunningLowCard — „Dochází“ v bočním panelu Přehledu (#172, lehký kontext).
 * Důležité položky (★), které čekají na dokoupení, a počet všeho na nákupním seznamu,
 * s odkazem do Zásob. Když nic nedochází ani se nic nekupuje, karta se nevykreslí.
 */
import { useId } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import type { DashboardShoppingData } from "@/api/dashboard";
import { pluralize } from "@/lib/utils";

const MAX_ITEMS = 5;

export function RunningLowCard({ data }: { data: DashboardShoppingData }) {
  const headingId = useId();
  const essentials = data.essentialWarning?.items ?? [];
  const pending = data.totalPendingShoppingCount;
  if (essentials.length === 0 && pending === 0) return null;

  const rest = essentials.length - MAX_ITEMS;
  return (
    <section className="glass-card running-low-card" aria-labelledby={headingId} data-testid="dashboard-running-low">
      <h2 id={headingId} className="dashboard-card-header-title">Dochází</h2>
      {essentials.length > 0 && (
        <ul className="running-low-list">
          {essentials.slice(0, MAX_ITEMS).map((item) => (
            <li key={item.name} className="running-low-item">
              <Star className="w-4 h-4 running-low-star" aria-label="Důležité" />
              {item.name}
            </li>
          ))}
          {rest > 0 && <li className="running-low-more">a {rest} {pluralize(rest, "další", "další", "dalších")}</li>}
        </ul>
      )}
      <p className="running-low-summary">
        Na nákupním seznamu {pending === 0 ? "nic nečeká" : `${pluralize(pending, "čeká", "čekají", "čeká")} ${pending} ${pluralize(pending, "položka", "položky", "položek")}`}.
      </p>
      <Link to="/shopping" className="running-low-link">Otevřít Zásoby</Link>
    </section>
  );
}
