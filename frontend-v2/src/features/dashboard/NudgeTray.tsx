/**
 * NudgeTray — renders the nudge engine's output as compact, dismissable cards
 * on the dashboard. Each nudge links into the app; broadcast-worthy ones expose
 * a "Kopírovat pro WhatsApp" button (message + deep link) so coordination can
 * be pushed into the family chat by hand until the Phase-3 bot lands.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Copy } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { showToast } from "@/lib/toast";
import type { DashboardReservationsData, DashboardShoppingData } from "@/api/dashboard";
import { buildNudges, type Nudge } from "./nudges";

const storageKey = (username?: string | null) => `dismissedNudges:${username ?? "anon"}`;

function readDismissed(username?: string | null): string[] {
  try {
    const raw = localStorage.getItem(storageKey(username));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface Props {
  reservations?: DashboardReservationsData;
  shopping?: DashboardShoppingData;
}

export function NudgeTray({ reservations, shopping }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed(user?.username));

  const nudges = buildNudges({ reservations, shopping }).filter((n) => !dismissed.includes(n.id));
  if (nudges.length === 0) return null;

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      localStorage.setItem(storageKey(user?.username), JSON.stringify(next));
    } catch {
      // storage unavailable — nudge just won't stay dismissed across reloads
    }
  };

  const copyForWhatsApp = async (n: Pick<Nudge, "whatsapp" | "href">) => {
    if (!n.whatsapp) return;
    const link = `${window.location.origin}${n.href}`;
    try {
      await navigator.clipboard.writeText(`${n.whatsapp}\n${link}`);
      showToast("Zkopírováno pro WhatsApp", "success");
    } catch {
      showToast("Kopírování se nepodařilo", "error");
    }
  };

  return (
    <div className="nudge-tray" data-testid="dashboard-nudge-tray">
      {nudges.map(({ icon: Icon, ...n }) => (
        <div key={n.id} className={`nudge nudge-${n.tone}`}>
          <Icon className="nudge-icon w-5 h-5" aria-hidden="true" />
          <button className="nudge-body" onClick={() => navigate(n.href)}>
            <span className="nudge-title">{n.title}</span>
            {n.detail && <span className="nudge-detail">{n.detail}</span>}
          </button>
          {n.whatsapp && (
            <button className="nudge-btn" onClick={() => void copyForWhatsApp(n)} title="Kopírovat pro WhatsApp" aria-label="Kopírovat pro WhatsApp">
              <Copy size={15} />
            </button>
          )}
          <button className="nudge-btn" onClick={() => dismiss(n.id)} title="Skrýt" aria-label="Skrýt">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
