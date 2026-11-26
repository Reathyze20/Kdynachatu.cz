import { useCallback, useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useCabinSceneMode } from "@/hooks/useCabinSceneMode";
import { MOBILE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import dormousePeek from "./scene/dormouse-peek.png";

/**
 * Maskot na mobilní liště (#566): plch ze scény chaty jednou za otevření appky přijde zleva po horní hraně spodní
 * lišty, zastaví se, rozhlédne, dvakrát poskočí (zamává) a odejde zpět doleva, takže nikdy nedojde k tlačítku
 * nápovědy vpravo. Jen na mobilu a ve stavu „Scéna chaty“ Animovaná. Nevyjde, dokud je otevřené okno, šuplík
 * profilu nebo klávesnice (fokus v textovém poli) nebo je appka na pozadí; když se něco z toho stane během
 * průchodu, zmizí a už se nevrátí. Dekorativní: `aria-hidden`, `pointer-events: none`. Chůzi nese keyframe
 * `scene-mascot-walk` v `shadcn-tokens.css`, rozhlížení pás snímků vykukování ze scény (`animate-scene-frames`).
 */

/** Po otevření appky chvíli počká, ať nepřekáží prvnímu pohledu. Průchod trvá jako `--animate-scene-mascot-walk`. */
const START_DELAY_MS = 4000;
const WALK_MS = 10_000;
/** „Jednou za otevření appky“: přežije navigaci i nové vykreslení lišty, ne zavření appky. */
const WALKED_KEY = "navMascotWalked";
/** Snímek plcha je 40 × 40 jednotek po 1,5 CSS px jako ve scéně; pod tlapkami (řádek 31) je 8 prázdných řádků. */
const FRAME_PX = 60;
const PEEK = { frames: 11, ms: 160 };

let walkedWithoutStorage = false;
function alreadyWalked(): boolean {
  try {
    return sessionStorage.getItem(WALKED_KEY) === "1";
  } catch {
    return walkedWithoutStorage;
  }
}
function markWalked() {
  walkedWithoutStorage = true;
  try {
    sessionStorage.setItem(WALKED_KEY, "1");
  } catch {
    // sessionStorage nedostupné: platí paměť do zavření appky
  }
}

/** Modální okno (`Modal`, `ConfirmDialog`, lightbox) a šuplík profilu. */
const OVERLAY = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], .drawer-overlay';
/** Pole, které na telefonu otevře klávesnici. */
const TYPING = 'textarea, select, input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"], [type="range"], [type="file"], [type="color"])';

/** Maskot by překážel: píše se, je otevřené okno nebo šuplík, nebo je appka na pozadí. */
function mascotSuppressed(): boolean {
  const focused = document.activeElement;
  const typing = focused instanceof HTMLElement && (focused.matches(TYPING) || focused.isContentEditable);
  return typing || document.visibilityState === "hidden" || document.querySelector(OVERLAY) !== null;
}

function subscribeBlockers(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, { childList: true, subtree: true });
  const events = ["focusin", "focusout", "visibilitychange"];
  for (const event of events) document.addEventListener(event, onChange);
  return () => {
    observer.disconnect();
    for (const event of events) document.removeEventListener(event, onChange);
  };
}

type Phase = "waiting" | "walking" | "done";

export function NavMascot() {
  const [mode] = useCabinSceneMode();
  const mobile = useMediaQuery(MOBILE_QUERY);
  const [phase, setPhase] = useState<Phase>(() => (alreadyWalked() ? "done" : "waiting"));
  const allowed = mode === "animated" && mobile;
  const start = useCallback(() => {
    markWalked();
    setPhase("walking");
  }, []);
  const finish = useCallback(() => setPhase("done"), []);

  // Přepnutí na Statickou / Skrytou nebo na desktop během průchodu ho ukončí, po návratu už nevyjde.
  useEffect(() => {
    if (phase === "walking" && !allowed) finish();
  }, [phase, allowed, finish]);

  if (!allowed || phase === "done") return null;
  return <Walk walking={phase === "walking"} onStart={start} onDone={finish} />;
}

/** Naplánuje start průchodu, pak ho vykreslí a po `WALK_MS` ukončí; když maskot začne překážet, průchod skončí. */
function Walk({ walking, onStart, onDone }: { walking: boolean; onStart: () => void; onDone: () => void }) {
  const suppressed = useSyncExternalStore(subscribeBlockers, mascotSuppressed, () => true);

  useEffect(() => {
    if (suppressed) {
      if (walking) onDone();
      return;
    }
    const timer = window.setTimeout(walking ? onDone : onStart, walking ? WALK_MS : START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [suppressed, walking, onStart, onDone]);

  if (!walking || suppressed) return null;
  const strip = {
    "--scene-strip-ms": `${PEEK.frames * PEEK.ms}ms`,
    "--scene-strip-frames": PEEK.frames,
    "--scene-strip-end": `${-PEEK.frames * FRAME_PX}px`,
  } as CSSProperties;
  return (
    <div
      aria-hidden="true"
      data-testid="nav-mascot"
      className="pointer-events-none absolute bottom-full left-0 -mb-3 size-[60px] overflow-hidden animate-scene-mascot-walk"
    >
      <img src={dormousePeek} alt="" width={PEEK.frames * FRAME_PX} height={FRAME_PX} className="h-[60px] max-w-none [image-rendering:pixelated] animate-scene-frames" style={strip} />
    </div>
  );
}
