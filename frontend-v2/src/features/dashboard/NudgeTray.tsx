/**
 * NudgeTray — „Visí na tobě“ na Přehledu (návrh #1 díl 3 = A, #172): výstup nudge enginu
 * jako jedna akční karta. Upozornění s akcí jdou napřed; první je zvýrazněné a jeho tlačítko (56 px)
 * vede rovnou do úkolu;
 * nejvýš dvě jsou vidět, zbytek je za „Zobrazit víc“. Upozornění, která stojí za to poslat
 * rodině, mají „Zkopírovat pro WhatsApp“ (zpráva + odkaz, #264), dokud nepřijde bot (fáze 3).
 * Která upozornění se ukážou a jejich skrývání drží `useTrayNudges` (bez duplicity s jinými kartami, #425).
 * Když nic nevisí, karta se nevykreslí.
 */
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { whatsAppMessage } from "@/lib/whatsapp";
import { CopyForWhatsAppButton } from "@/components/shared/CopyForWhatsAppButton";
import { Card } from "@/components/shared/Card";
import { Button } from "@/components/ui/button";
import type { Nudge } from "./nudges";

const VISIBLE_COUNT = 2;

interface Props {
  /** Upozornění z `useTrayNudges`, už bez skrytých a duplicitních. */
  nudges: Nudge[];
  onDismiss: (id: string) => void;
}

export function NudgeTray({ nudges: shown, onDismiss }: Props) {
  const headingId = useId();
  const [expanded, setExpanded] = useState(false);

  const hasAction = (n: Nudge) => !!n.action;
  const nudges = [...shown].sort((a, b) => Number(hasAction(b)) - Number(hasAction(a)));
  if (nudges.length === 0) return null;
  const visible = expanded ? nudges : nudges.slice(0, VISIBLE_COUNT);
  const hiddenCount = nudges.length - VISIBLE_COUNT;

  return (
    <Card as="section" className="flex flex-col gap-2" aria-labelledby={headingId} data-testid="dashboard-nudge-tray">
      <h2 id={headingId} className="m-0 text-card-title text-(--text-main)">Visí na tobě</h2>
      <ul className="your-tasks__list">
        {visible.map(({ icon: Icon, ...n }, i) => (
            <li key={n.id} className={`nudge nudge-${n.tone}${i === 0 ? " nudge--first" : ""}`}>
              <Icon className="nudge-icon w-5 h-5" aria-hidden="true" />
              <div className="nudge-body">
                <span className="nudge-title">{n.title}</span>
                {n.detail && <span className="nudge-detail">{n.detail}</span>}
                {(n.action || n.whatsapp) && (
                  <div className="nudge-actions">
                    {n.action && (
                      <Button asChild variant={i === 0 ? "primary" : "secondary"} size={i === 0 ? "lg" : "default"}>
                        <Link to={n.href}>{n.action}</Link>
                      </Button>
                    )}
                    {n.whatsapp && (
                      <CopyForWhatsAppButton text={whatsAppMessage(n.whatsapp, n.href)} />
                    )}
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon" className="nudge-btn" onClick={() => onDismiss(n.id)} title="Skrýt" aria-label="Skrýt">
                <X />
              </Button>
            </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button className="your-tasks__more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Zobrazit méně" : `Zobrazit víc (${hiddenCount})`}
        </button>
      )}
    </Card>
  );
}
