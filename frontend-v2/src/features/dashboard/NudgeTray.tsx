/**
 * NudgeTray — „Visí na tobě“ na Přehledu (návrh #1 díl 3 = A, #172): výstup nudge enginu
 * jako jedna akční karta. Upozornění s akcí jdou napřed; první je zvýrazněné a jeho tlačítko vede
 * rovnou do úkolu;
 * nejvýš dvě jsou vidět, zbytek je za „Zobrazit víc“. Upozornění, která stojí za to poslat
 * rodině, mají „Zkopírovat pro WhatsApp“ (zpráva + odkaz, #264), dokud nepřijde bot (fáze 3).
 * Která upozornění se ukážou a jejich skrývání drží `useTrayNudges` (bez duplicity s jinými kartami, #425).
 * Když nic nevisí, karta se nevykreslí.
 */
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { whatsAppMessage } from "@/lib/whatsapp";
import { CopyForWhatsAppButton } from "@/components/shared/CopyForWhatsAppButton";
import type { Nudge } from "./nudges";

const VISIBLE_COUNT = 2;

/** Název akce podle cíle upozornění; bez názvu (např. odkaz na Přehled) se tlačítko neukáže. */
const ACTION_LABEL: Record<string, string> = {
  "/reservations": "Otevřít kalendář",
  "/shopping": "Otevřít Zásoby",
  "/handover": "Předat chatu",
};

interface Props {
  /** Upozornění z `useTrayNudges`, už bez skrytých a duplicitních. */
  nudges: Nudge[];
  onDismiss: (id: string) => void;
}

export function NudgeTray({ nudges: shown, onDismiss }: Props) {
  const headingId = useId();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const hasAction = (n: Nudge) => n.href in ACTION_LABEL;
  const nudges = [...shown].sort((a, b) => Number(hasAction(b)) - Number(hasAction(a)));
  if (nudges.length === 0) return null;
  const visible = expanded ? nudges : nudges.slice(0, VISIBLE_COUNT);
  const hiddenCount = nudges.length - VISIBLE_COUNT;

  return (
    <section className="glass-card your-tasks" aria-labelledby={headingId} data-testid="dashboard-nudge-tray">
      <h2 id={headingId} className="m-0 text-card-title text-(--text-main)">Visí na tobě</h2>
      <ul className="your-tasks__list">
        {visible.map(({ icon: Icon, ...n }, i) => {
          const action = ACTION_LABEL[n.href];
          return (
            <li key={n.id} className={`nudge nudge-${n.tone}${i === 0 ? " nudge--first" : ""}`}>
              <Icon className="nudge-icon w-5 h-5" aria-hidden="true" />
              <div className="nudge-body">
                <span className="nudge-title">{n.title}</span>
                {n.detail && <span className="nudge-detail">{n.detail}</span>}
                {(action || n.whatsapp) && (
                  <div className="nudge-actions">
                    {action && (
                      <button className={i === 0 ? "status-cta status-cta-primary nudge-cta" : "status-cta status-cta-neutral nudge-cta"} onClick={() => navigate(n.href)}>
                        {action}
                      </button>
                    )}
                    {n.whatsapp && (
                      <CopyForWhatsAppButton text={whatsAppMessage(n.whatsapp, n.href)} />
                    )}
                  </div>
                )}
              </div>
              <button className="nudge-btn" onClick={() => onDismiss(n.id)} title="Skrýt" aria-label="Skrýt">
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
