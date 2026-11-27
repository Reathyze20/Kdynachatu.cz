/**
 * LaterAndFreeCard — „Potom a volno“ na Přehledu (#273, spec #677): kdo jede po „příště“ a kdy je chata
 * volná k zabrání. Data z kalendáře (všechny pobyty včetně předběžných), výpočet v `buildLaterAndFree`.
 * Když po „příště“ nic není (nebo se ještě načítá), karta se nevykreslí: je volitelná a nemá posouvat Přehled.
 */
import { useId } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, House } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useReservationsData } from "@/features/reservations/hooks/useReservations";
import { nightsBetween } from "@/lib/dateUtils";
import { formatCount, formatDateRange } from "@/lib/format";
import { AnimalAvatar } from "@/components/shared/AnimalAvatar";
import { Card } from "@/components/shared/Card";
import { FeatureErrorFallback } from "@/components/shared/FeatureErrorFallback";
import { ListRow } from "@/components/shared/ListRow";
import { Button } from "@/components/ui/button";
import { buildLaterAndFree } from "./laterAndFree";

const nights = (n: number) => formatCount(n, "noc", "noci", "nocí");

export function LaterAndFreeCard() {
  const headingId = useId();
  const { user } = useAuth();
  const { data, error, refetch } = useReservationsData();
  if (error) return <FeatureErrorFallback title="Kalendář se nepodařilo načíst" error={error} resetErrorBoundary={() => void refetch()} />;
  const items = data ? buildLaterAndFree(data.reservations, new Date(), user?.username) : [];
  if (items.length === 0) return null;

  return (
    <Card as="section" flush className="flex flex-col pb-2" aria-labelledby={headingId} data-testid="dashboard-later-free">
      <h2 id={headingId} className="m-0 px-4 pt-4 text-card-title text-(--text-main) md:px-6 md:pt-6">Potom a volno</h2>
      <ul className="m-0 list-none divide-y divide-rule-soft p-0">
        {items.map((item) => {
          if (item.kind === "free") {
            const range = formatDateRange(item.from, item.to);
            return (
              <ListRow
                as="li"
                key={`free-${item.from}`}
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link to={`/reservations?from=${item.from}&to=${item.to}`} aria-label={`Zabrat ${range}`}>Zabrat</Link>
                  </Button>
                }
              >
                <span className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-inset text-(--text-muted)">
                    <House className="size-5" aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-body text-(--text-main)">Volno · {nights(item.nights)}</span>
                    <span className="text-meta text-(--text-muted)">{range}</span>
                  </span>
                </span>
              </ListRow>
            );
          }
          const { stay } = item;
          return (
            <ListRow as="li" key={stay.id}>
              <span className="flex items-center gap-3">
                <AnimalAvatar icon={stay.userAnimalIcon} username={stay.username} color={stay.userColor || undefined} size={40} />
                <span className="flex min-w-0 flex-col">
                  <span className="break-words text-body font-semibold text-(--text-main)">{stay.username === user?.username ? "Ty" : stay.username}</span>
                  <span className="text-meta text-(--text-muted)">
                    {formatDateRange(stay.from, stay.to)} · {nights(nightsBetween(stay.from, stay.to))}
                    {stay.status === "soft" && " · předběžně"}
                  </span>
                </span>
              </span>
            </ListRow>
          );
        })}
      </ul>
      <Link to="/reservations" className="flex min-h-(--touch-target-min) items-center gap-1 self-start px-4 text-meta font-semibold text-primary md:px-6">
        Celý kalendář
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </Card>
  );
}
