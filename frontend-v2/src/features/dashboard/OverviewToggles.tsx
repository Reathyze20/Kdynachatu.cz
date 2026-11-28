/**
 * OverviewToggles — přepínače bloků Přehledu v pevném pořadí (#686, spec #677).
 * Stejný seznam je v „Upravit Přehled“ na Přehledu a v sekci „Přehled“ v Můj profil; obě místa čtou
 * i ukládají stejný dotaz `GET /users/me`, takže ukazují stejný stav. Host přepínače nemá.
 */
import { Checkbox } from "@/components/ui/checkbox";
import { effectiveToggles, OVERVIEW_TOGGLE_LABELS, OVERVIEW_TOGGLES, useDashboardPrefs, useUpdateDashboardPrefs } from "./overviewBlocks";

export function OverviewToggles() {
  const prefs = useDashboardPrefs(/* enabled */ true);
  const update = useUpdateDashboardPrefs();
  const toggles = effectiveToggles(prefs);
  // Dokud preference nedorazí, není co přepnout (optimistická změna potřebuje načtený stav)
  const loading = prefs === undefined;

  return (
    <ul className="divide-y divide-rule-soft">
      {OVERVIEW_TOGGLES.map((key) => (
        <li key={key}>
          {/* Přepínač jako v HandoverForm: checkbox s rolí switch, vizuálně dráha s jezdcem */}
          <label className="flex min-h-(--touch-target-min) cursor-pointer items-center gap-3 text-body text-(--text-main)">
            <span className="flex-1">{OVERVIEW_TOGGLE_LABELS[key]}</span>
            <Checkbox role="switch" className="peer sr-only" checked={toggles[key]} disabled={loading} onChange={(e) => update.mutate({ [key]: e.target.checked })} />
            <span aria-hidden="true" className="relative h-7 w-12 shrink-0 rounded-full bg-(--text-muted) transition-colors peer-checked:bg-primary peer-disabled:opacity-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-sheet after:transition-transform peer-checked:after:translate-x-5 motion-reduce:after:transition-none" />
          </label>
        </li>
      ))}
    </ul>
  );
}
