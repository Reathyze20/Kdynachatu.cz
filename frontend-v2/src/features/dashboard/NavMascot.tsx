import { useCallback, useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useCabinSceneMode } from "@/hooks/useCabinSceneMode";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import dormousePeek from "./scene/dormouse-peek.png";

/**
 * Maskot na mobilnĂ­ liĹˇtÄ› (#566): plch ze scĂ©ny chaty jednou za otevĹ™enĂ­ appky pĹ™ijde zleva po hornĂ­ hranÄ› spodnĂ­
 * liĹˇty, zastavĂ­ se, rozhlĂ©dne, dvakrĂˇt poskoÄŤĂ­ (zamĂˇvĂˇ) a odejde zpÄ›t doleva, takĹľe nikdy nedojde k tlaÄŤĂ­tku
 * nĂˇpovÄ›dy vpravo. Jen na mobilu a ve stavu â€žScĂ©na chatyâ€ś AnimovanĂˇ. Nevyjde, dokud je otevĹ™enĂ© okno, ĹˇuplĂ­k
 * profilu nebo klĂˇvesnice (fokus v textovĂ©m poli) nebo je appka na pozadĂ­; kdyĹľ se nÄ›co z toho stane bÄ›hem
 * prĹŻchodu, zmizĂ­ a uĹľ se nevrĂˇtĂ­. DekorativnĂ­: `aria-hidden`, `pointer-events: none`. ChĹŻzi nese keyframe
 * `scene-mascot-walk` v `shadcn-tokens.css`, rozhlĂ­ĹľenĂ­ pĂˇs snĂ­mkĹŻ vykukovĂˇnĂ­ ze scĂ©ny (`animate-scene-frames`).
 */

/** Po otevĹ™enĂ­ appky chvĂ­li poÄŤkĂˇ, aĹĄ nepĹ™ekĂˇĹľĂ­ prvnĂ­mu pohledu. PrĹŻchod trvĂˇ jako `--animate-scene-mascot-walk`. */
const START_DELAY_MS = 4000;
const WALK_MS = 10_000;
const MOBILE_QUERY = "(max-width: 767px)";
/** â€žJednou za otevĹ™enĂ­ appkyâ€ś: pĹ™eĹľije navigaci i novĂ© vykreslenĂ­ liĹˇty, ne zavĹ™enĂ­ appky. */
const WALKED_KEY = "navMascotWalked";
/** SnĂ­mek plcha je 40 Ă— 40 jednotek po 1,5 CSS px jako ve scĂ©nÄ›; pod tlapkami (Ĺ™Ăˇdek 31) je 8 prĂˇzdnĂ˝ch Ĺ™ĂˇdkĹŻ. */
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
    // sessionStorage nedostupnĂ©: platĂ­ pamÄ›ĹĄ do zavĹ™enĂ­ appky
  }
}

/** ModĂˇlnĂ­ okno (`Modal`, `ConfirmDialog`, lightbox) a ĹˇuplĂ­k profilu. */
const OVERLAY = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], .drawer-overlay';
/** Pole, kterĂ© na telefonu otevĹ™e klĂˇvesnici. */
const TYPING = 'textarea, select, input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"], [type="range"], [type="file"], [type="color"])';

function blocked(): boolean {
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

  // PĹ™epnutĂ­ na Statickou / Skrytou nebo na desktop bÄ›hem prĹŻchodu ho ukonÄŤĂ­, po nĂˇvratu uĹľ nevyjde.
  useEffect(() => {
    if (phase === "walking" && !allowed) finish();
  }, [phase, allowed, finish]);

  if (!allowed || phase === "done") return null;
  return <Walk walking={phase === "walking"} onStart={start} onDone={finish} />;
}

function Walk({ walking, onStart, onDone }: { walking: boolean; onStart: () => void; onDone: () => void }) {
  const isBlocked = useSyncExternalStore(subscribeBlockers, blocked, () => true);

  useEffect(() => {
    if (isBlocked) {
      if (walking) onDone();
      return;
    }
    const timer = window.setTimeout(walking ? onDone : onStart, walking ? WALK_MS : START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isBlocked, walking, onStart, onDone]);

  if (!walking || isBlocked) return null;
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
