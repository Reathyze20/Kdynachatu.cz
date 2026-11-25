import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import type { DashboardReservationsData, WeatherResult } from "@/api/dashboard";
import { useCabinSceneMode } from "@/hooks/useCabinSceneMode";
import { cn } from "@/lib/utils";
import { cabinSceneLabel, deriveCabinScene, mascotPose, type CabinSceneState, type MascotPose } from "./cabinSceneState";
import {
  AXE, BIRD, CABIN, CABIN_EAVE_ROW, CABIN_PORCH_ROW, CAR, DORMOUSE, DORMOUSE_SCARF, DORMOUSE_SLEEPING, DORMOUSE_SLEEPING_SCARF, MOON, PORCH,
  SCENE_PALETTE, SMOKE, STUMP, TREE, WAVE, WINDOW_LOOK, ZZZ, type Sprite,
} from "./cabinSceneSprites";

/**
 * Scéna chaty nahoře v kartě „Na chatě teď“ (#563). Obrázek stavu chaty: stav z `cabinSceneState.ts`,
 * sprity z `cabinSceneSprites.ts`, počasí ze sdíleného dotazu Přehledu na dnešní počasí (#564). Jednotka mřížky je 1,5 CSS px (pruh 114 px = 76 řádků). Široký
 * viewBox se na užší kartě ořízne po stranách, chata s maskotem zůstane uprostřed.
 * Podle volby „Scéna chaty“ (#565) je
 * animovaná, statická, nebo se nevykreslí; krokované animace (`--animate-scene-*` v `shadcn-tokens.css`) stojí, když je
 * stránka na pozadí nebo scéna mimo obrazovku.
 */
const W = 640;
const H = 76;
const GROUND = 68;
/** Zápraží (28), chata (60) a místo vpravo pro špalek nebo auto (70) uprostřed pruhu. */
const CABIN_X = W / 2 - 52;
const CABIN_Y = GROUND - CABIN.length;
const PORCH_X = CABIN_X - PORCH[0].length;
/** Horní hrana podlahy zápraží: prodloužení vlevo navazuje na zápraží chaty. */
const PORCH_TOP = CABIN_Y + CABIN_PORCH_ROW;

/** Jedna vrstva = jeden sprite na místě: token → cesta. Pořadí vrstev je pořadí kreslení. `motion` jsou třídy
 * animace vrstvy, platí jen ve stavu Animovaná. */
interface Layer { name: string; paths: Map<string, string>; opacity?: number; motion?: string }

function layer(name: string, motion?: string): Layer {
  return { name, paths: new Map(), motion };
}

/** Otáčení a dýchání kolem vlastního okraje vrstvy (dlaň, nohy), ne kolem počátku SVG. */
const PIVOT_PAW = "[transform-box:fill-box] origin-bottom-right";
const PIVOT_FEET = "[transform-box:fill-box] origin-bottom";

function add(l: Layer, token: string, d: string) {
  l.paths.set(token, (l.paths.get(token) ?? "") + d);
}

const box = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}z`;

/** Řádky mřížky po úsecích stejného znaku; `only` omezí kreslení na vybrané znaky. */
function drawSprite(l: Layer, grid: Sprite, x: number, y: number, remap: Record<string, string> = {}, only?: string) {
  grid.forEach((row, j) => {
    for (let i = 0; i < row.length;) {
      let k = i;
      while (k < row.length && row[k] === row[i]) k++;
      const token = remap[row[i]] ?? SCENE_PALETTE[row[i]];
      if (token && (!only || only.includes(row[i]))) add(l, token, box(x + i, y + j, k - i, 1));
      i = k;
    }
  });
  return l;
}

/** Stejná scéna při každém vykreslení: pevné semínko. */
function seededRandom(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

/** Sníh přebarví louku, kopce a střechu; jinovatka trávu, střechu a stromy. Na stromech má jinovatka přednost
 * před sněhem, aby byl mráz vidět i pod sněhovou pokrývkou. */
function landscape({ night, snowing, snowCover, frost }: CabinSceneState): Layer[] {
  const rnd = seededRandom(7);
  const sky = layer("sky");
  add(sky, night ? "ink" : snowing ? "sky-snow" : "sky", box(0, 0, W, H));
  const hills = layer("hills");
  ([["mist", 26, 18, 1], ["hill", 14, 12, 3]] as const).forEach(([token, height, period, phase]) => {
    let d = `M0 ${GROUND}`;
    for (let x = 0; x < W; x++) d += `V${GROUND - Math.round(height + 3.2 * Math.sin(x / period + phase) + 2 * Math.sin(x / 6.6))}h1`;
    add(hills, snowCover ? "snow-shade" : token, `${d}V${GROUND}z`);
  });
  const blades = snowCover ? "snow-shade" : frost ? "rime" : "grass";
  add(hills, snowCover ? "snow" : "grass-dark", box(0, GROUND, W, H - GROUND));
  add(hills, snowCover ? "snow" : blades, box(0, GROUND, W, 1));
  for (let n = 0; n < W / 2; n++) add(hills, blades, box(Math.floor(rnd() * W), GROUND + 1 + Math.floor(rnd() * (H - GROUND - 1)), 1 + Math.floor(rnd() * 2), 1));
  const trees = layer("trees");
  const needles: Record<string, string> = frost ? { J: "rime" } : snowCover ? { J: "snow" } : {};
  for (let x = 2; x < W - TREE[0].length; x += 10 + Math.floor(rnd() * 12)) {
    if (x + TREE[0].length > PORCH_X - 6 && x < CABIN_X + 136) continue;
    drawSprite(trees, TREE, x, GROUND - TREE.length + 1 - Math.floor(rnd() * 3), needles);
  }
  return [sky, hills, trees];
}

/** Chata se střechou nad okapem zvlášť, aby ji sníh nebo jinovatka přebarvily bez rohů stěny (r/R). */
function cabin({ snowCover, frost }: CabinSceneState, glass: Record<string, string>): Layer {
  const roof: Record<string, string> = snowCover ? { r: "snow", R: "snow-shade" } : frost ? { R: "rime" } : {};
  const cabinLayer = drawSprite(layer("cabin"), CABIN.slice(0, CABIN_EAVE_ROW), CABIN_X, CABIN_Y, { ...glass, ...roof });
  drawSprite(cabinLayer, CABIN.slice(CABIN_EAVE_ROW), CABIN_X, CABIN_Y + CABIN_EAVE_ROW, glass);
  return drawSprite(cabinLayer, PORCH, PORCH_X, PORCH_TOP);
}

/** Vločky přes celou scénu. Při animaci padají: kopie nad scénou se posouvá o výšku scény, smyčka tak navazuje bez skoku. */
function snowfall(moving: boolean): Layer {
  const rnd = seededRandom(13);
  const flakes = layer("snowfall", "animate-scene-snow");
  for (let n = 0; n < (W * H) / 90; n++) {
    const size = n % 3 ? 1 : 2;
    const x = Math.floor(rnd() * W);
    const y = Math.floor(rnd() * H);
    add(flakes, "snow", box(x, y, size, size));
    if (moving) add(flakes, "snow", box(x, y - H, size, size));
  }
  return flakes;
}

/** Plch dýchá ve spánku, při štípání a mávání se občas protáhne; zazimovaný odpočívá bez hnutí. */
const BODY_MOTION: Record<MascotPose, string | undefined> = { sleep: `animate-scene-breathe ${PIVOT_FEET}`, chop: `animate-scene-stretch ${PIVOT_FEET}`, wave: `animate-scene-stretch ${PIVOT_FEET}`, idle: undefined };

function mascot(state: CabinSceneState): Layer[] {
  const pose = mascotPose(state);
  // Spí a odpočívá na zápraží vedle chaty, nikdy přes stěnu, dveře nebo okno (#579).
  const sprite = pose === "sleep" ? DORMOUSE_SLEEPING : DORMOUSE;
  const onPorch = pose === "sleep" || pose === "idle";
  const x = onPorch ? PORCH_X + 1 : pose === "wave" ? CABIN_X + 62 : CABIN_X + 86;
  const y = (onPorch ? PORCH_TOP : GROUND) - sprite.length;
  const props = layer("props");
  if (pose === "chop") drawSprite(props, STUMP, x - 15, GROUND - STUMP.length);
  const body = drawSprite(layer("mascot", BODY_MOTION[pose]), sprite, x, y);
  if (state.frost) drawSprite(body, pose === "sleep" ? DORMOUSE_SLEEPING_SCARF : DORMOUSE_SCARF, x, y);
  const layers = [props, body];
  if (pose === "sleep") layers.push(drawSprite(layer("zzz", "animate-scene-zzz"), ZZZ, x + 7, y - 8, state.night ? { o: "light" } : {}));
  if (pose === "chop") layers.push(drawSprite(layer("axe", `animate-scene-chop ${PIVOT_PAW}`), AXE, x - 8, y + 5));
  if (pose === "wave") layers.push(drawSprite(layer("wave", `animate-scene-wave ${PIVOT_PAW}`), WAVE, x - 3, y + 7));
  return layers;
}

/** `moving` = volba Animovaná: přidá vrstvy, které existují jen v pohybu (ptáček, vločky nad scénou). */
function buildScene(state: CabinSceneState, moving: boolean): Layer[] {
  const { occupied, winterized, night } = state;
  const glass = winterized ? WINDOW_LOOK.shut : occupied ? WINDOW_LOOK.lit : night ? WINDOW_LOOK.dark : WINDOW_LOOK.day;
  const layers = [...landscape(state), cabin(state, glass)];
  if (state.carParked) layers.push(drawSprite(layer("car"), CAR, CABIN_X + 92, GROUND - CAR.length + 2));
  layers.push(...mascot(state));
  // Občasný drobný detail: ve dne přeletí ptáček zleva doprava (start i cíl jsou mimo scénu). U zazimované chaty se nic neděje.
  if (moving && !night && !winterized) layers.push(drawSprite(layer("bird", "animate-scene-bird"), BIRD, -BIRD[0].length - 3, 10));
  if (night) {
    const rnd = seededRandom(11);
    const veil = layer("night");
    veil.opacity = 0.5;
    add(veil, "night-veil", box(0, 0, W, H));
    layers.push(veil);
    // Při sněžení je zataženo: bez měsíce a hvězd.
    if (!state.snowing) {
      const sky = drawSprite(layer("stars"), MOON, W / 2 + 64, 4);
      for (let n = 0; n < W / 5; n++) add(sky, "light", box(Math.floor(rnd() * W), Math.floor(rnd() * 34), 1, 1));
      layers.push(sky);
    }
    if (occupied) layers.push(drawSprite(layer("window-glow"), CABIN, CABIN_X, CABIN_Y, glass, "gGQ"));
  }
  if (occupied) layers.push(drawSprite(layer("smoke", "animate-scene-smoke"), SMOKE, CABIN_X + 34, CABIN_Y - SMOKE.length - 1));
  if (state.snowing) layers.push(snowfall(moving));
  return layers;
}

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageVisible = () => document.visibilityState !== "hidden";

/** Smí se scéna hýbat: stránka není na pozadí a scéna je aspoň zčásti na obrazovce. Bez IntersectionObserveru platí „na obrazovce“. */
function useOnScreen(ref: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const visible = useSyncExternalStore(subscribeVisibility, pageVisible, () => true);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => setInView(entries[entries.length - 1]?.isIntersecting ?? true));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, enabled]);
  return visible && inView;
}

interface Props {
  data: DashboardReservationsData;
  winterized: boolean;
  /** Dnešní počasí obce chaty; bez něj (bez obce, chyba, načítání) je scéna bez počasí. */
  weather?: WeatherResult;
}

/** Neinteraktivní obrázek stavu chaty s popisem pro čtečky. `data-motion`: animated (hýbe se), paused (stojí na pozadí
 * nebo mimo obrazovku), static (volba Statická). */
export function CabinScene({ data, winterized, weather }: Props) {
  const [mode] = useCabinSceneMode();
  const ref = useRef<HTMLDivElement>(null);
  const moving = mode === "animated";
  const onScreen = useOnScreen(ref, moving);
  if (mode === "hidden") return null;
  const state = deriveCabinScene(data, winterized, new Date(), weather);
  const motion = !moving ? "static" : onScreen ? "animated" : "paused";
  return (
    <div ref={ref} className="w-full self-stretch overflow-hidden rounded-xl">
      <svg role="img" aria-label={cabinSceneLabel(state)} data-motion={motion} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" shapeRendering="crispEdges" className="block h-[114px] w-full">
        {buildScene(state, moving).map((l) => (
          <g key={l.name} opacity={l.opacity} className={moving && l.motion ? cn(l.motion, motion === "paused" && "[animation-play-state:paused]") : undefined}>
            {[...l.paths].map(([token, d]) => <path key={token} d={d} style={{ fill: `var(--scene-${token})` }} />)}
          </g>
        ))}
      </svg>
    </div>
  );
}
