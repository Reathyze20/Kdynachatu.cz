/**
 * NudgeTray — „Visí na tobě“ na Přehledu (návrh #1 díl 3 = A, #172): výstup nudge enginu
 * jako jedna akční karta. Upozornění s akcí jdou napřed; první je zvýrazněné a jeho tlačítko vede
 * rovnou do úkolu;
 * nejvýš dvě jsou vidět, zbytek je za „Zobrazit víc“. Upozornění, která stojí za to poslat
 * rodině, mají „Kopírovat pro WhatsApp“ (zpráva + odkaz), dokud nepřijde bot (fáze 3).
 * Docházející zásoby tu nejsou: ukazuje je karta „Dochází“ v bočním panelu (bez duplicity).
 * Když nic nevisí, karta se nevykreslí.
 */
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Copy } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { showToast } from "@/lib/toast";
import type { DashboardReservationsData, DashboardShoppingData } from "@/api/dashboard";
import { buildNudges, type Nudge } from "./nudges";

const VISIBLE_COUNT = 2;

/** Název akce podle cíle upozornění; bez názvu (např. odkaz na Přehled) se tlačítko neukáže. */
const ACTION_LABEL: Record<string, string> = {
  "/reservations": "Otevřít kalendář",
  "/shopping": "Otevřít Zásoby",
  "/handover": "Předat chatu",
};

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
  const headingId = useId();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed(user?.username));
  const [expanded, setExpanded] = useState(false);

  const hasAction = (n: Nudge) => n.href in ACTION_LABEL;
  const nudges = buildNudges({ reservations, shopping, myUsername: user?.username })
    .filter((n) => !n.id.startsWith("supply-") && !dismissed.includes(n.id))
    .sort((a, b) => Number(hasAction(b)) - Number(hasAction(a)));
  if (nudges.length === 0) return null;
  const visible = expanded ? nudges : nudges.slice(0, VISIBLE_COUNT);
  const hiddenCount = nudges.length - VISIBLE_COUNT;

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
    <section className="glass-card your-tasks" aria-labelledby={headingId} data-testid="dashboard-nudge-tray">
      <h2 id={headingId} className="dashboard-card-header-title">Visí na tobě</h2>
      <ul className="your-tasks__list">
        {visible.map(({ icon: Icon, ...n }, i) => {
          const action = ACTION_LABEL[n.href];
          return (
            <li key={n.id} className={`nudge nudge-${n.tone}${i === 0 ? " nudge--first" : ""}`}>
              <Icon className="nudge-icon w-5 h-5" aria-hidden="true" />
              <div className="nudge-body">
                <span className="nudge-title">{n.title}</span>
                {n.detail && <span className="nudge-detail">{n.detail}</span>}
                {action && (
                  <button className={i === 0 ? "status-cta status-cta-primary nudge-cta" : "status-cta status-cta-neutral nudge-cta"} onClick={() => navigate(n.href)}>
                    {action}
                  </button>
                )}
              </div>
              {n.whatsapp && (
                <button className="nudge-btn" onClick={() => void copyForWhatsApp(n)} title="Kopírovat pro WhatsApp" aria-label="Kopírovat pro WhatsApp">
                  <Copy size={16} />
                </button>
              )}
              <button className="nudge-btn" onClick={() => dismiss(n.id)} title="Skrýt" aria-label="Skrýt">
                <X size={16} />
              </button>
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 && (
        <button className="your-tasks__more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Zobrazit méně" : `Zobrazit víc (${hiddenCount})`}
        </button>
      )}
    </section>
  );
}
