import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import type { DashboardReservationsData, WeatherResult } from "@/api/dashboard";
import { useCabinSceneMode } from "@/hooks/useCabinSceneMode";
import { cn } from "@/lib/utils";
import { cabinSceneLabel, deriveCabinScene, mascotPose, type CabinSceneState, type MascotPose } from "./cabinSceneState";
import { BIRD_FLAP, MOON, SCENE_PALETTE, SMOKE, ZZZ, type Sprite } from "./cabinSceneSprites";
import bgBare from "./scene/bg-bare.png";
import bgSnow from "./scene/bg-snow.png";
import cabinBare from "./scene/cabin-bare.png";
import cabinSnow from "./scene/cabin-snow.png";
import carImg from "./scene/car.png";
import dormouseChopScarf from "./scene/dormouse-chop-scarf.png";
import dormouseChop from "./scene/dormouse-chop.png";
import dormouseIdleScarf from "./scene/dormouse-idle-scarf.png";
import dormouseIdle from "./scene/dormouse-idle.png";
import dormouseSleepScarf from "./scene/dormouse-sleep-scarf.png";
import dormouseSleep from "./scene/dormouse-sleep.png";
import dormouseWaveScarf from "./scene/dormouse-wave-scarf.png";
import dormouseWave from "./scene/dormouse-wave.png";
import pineBareLg from "./scene/pine-bare-lg.png";
import pineBareSm from "./scene/pine-bare-sm.png";
import pineSnowLg from "./scene/pine-snow-lg.png";
import pineSnowSm from "./scene/pine-snow-sm.png";
import stumpImg from "./scene/stump.png";

/**
 * Scéna chaty nahoře v kartě „Na chatě teď“ (#563). Obrázek stavu chaty: stav z `cabinSceneState.ts`; krajina, chata,
 * stromy, auto, špalek a plch jsou pixel art z PixelLabu (PNG v `scene/`, 1 px obrázku = 1 jednotka mřížky); kouř,
 * vločky, ptáček, měsíc a hvězdy jsou vektorové sprity z `cabinSceneSprites.ts`. Počasí ze sdíleného dotazu Přehledu
 * na dnešní počasí (#564). Jednotka mřížky je 1,5 CSS px (pruh 114 px = 76 řádků). Široký viewBox se na užší kartě
 * ořízne po stranách, chata s maskotem zůstane uprostřed. Podle volby „Scéna chaty“ (#565) je animovaná, statická,
 * nebo se nevykreslí; animace (`--animate-scene-*` v `shadcn-tokens.css`) stojí, když je stránka na pozadí nebo
 * scéna mimo obrazovku. Plch se hýbe přepínáním snímků z pásu (sprite sheet) po krocích.
 */
const W = 640;
const H = 76;
const GROUND = 70;
const CABIN = { x: 262, w: 83, h: 65 };
const CABIN_Y = GROUND - CABIN.h;
/** Okna v souřadnicích obrázku chaty (svítí, v noci tmavnou, zavírají se okenice) a ústí komína. */
const WINDOWS = [[16, 41, 5, 9], [28, 42, 7, 9]] as const;
const CHIMNEY_X = 19;
/** Vpravo od chaty je místo buď pro auto, nebo pro špalek, u kterého plch štípe; obojí najednou nenastane. */
const CAR = { x: 374, w: 62, h: 19 };
const STUMP = { x: CABIN.x + CABIN.w + 28, w: 34, h: 32 };
/** Snímek plcha je 40 × 40, postavička v něm stojí na řádku 33. */
const FRAME = 40;
const FEET = 33;
/** Smrky vlevo a vpravo od chaty: [x, velký]. */
const PINES: [number, boolean][] = [
  [14, false], [40, true], [78, false], [104, true], [146, false], [176, true],
  [446, true], [484, false], [512, true], [552, false], [580, true], [612, false],
];

/** Jedna vrstva = vektorové sprity (token → cesta), obrázky a případně pás snímků. Pořadí vrstev je pořadí kreslení.
 * `motion` jsou třídy animace vrstvy, platí jen ve stavu Animovaná; pás snímků se v ní přepíná sám. */
interface Img { href: string; x: number; y: number; w: number; h: number }
/** Pás snímků vedle sebe (obrázek, nebo vektorové sprity v `paths`), vidět je vždy jeden snímek `w` × `h`. */
interface Strip { x: number; y: number; w: number; h: number; frames: number; ms: number; href?: string; paths?: Map<string, string>; still?: boolean }
interface Layer { name: string; paths: Map<string, string>; images: Img[]; strip?: Strip; opacity?: number; motion?: string }

function layer(name: string, motion?: string): Layer {
  return { name, paths: new Map(), images: [], motion };
}

function image(name: string, ...images: Img[]): Layer {
  return { ...layer(name), images };
}

function add(l: Layer, token: string, d: string) {
  l.paths.set(token, (l.paths.get(token) ?? "") + d);
}

const box = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}z`;

/** Řádky mřížky po úsecích stejného znaku. */
function drawSprite(l: Layer, grid: Sprite, x: number, y: number, remap: Record<string, string> = {}) {
  grid.forEach((row, j) => {
    for (let i = 0; i < row.length;) {
      let k = i;
      while (k < row.length && row[k] === row[i]) k++;
      const token = remap[row[i]] ?? SCENE_PALETTE[row[i]];
      if (token) add(l, token, box(x + i, y + j, k - i, 1));
      i = k;
    }
  });
  return l;
}

/** Stejná scéna při každém vykreslení: pevné semínko. */
function seededRandom(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

/** Sníh přebarví louku, střechu i stromy; v mrazu mají stromy zasněžené jehličí jako námrazu. */
function landscape({ snowCover, frost }: CabinSceneState): Layer[] {
  const white = snowCover || frost;
  const trees = PINES.map(([x, big]): Img => {
    const [w, h] = big ? [31, 58] : [23, 43];
    const href = big ? (white ? pineSnowLg : pineBareLg) : (white ? pineSnowSm : pineBareSm);
    return { href, x, y: GROUND - h + 1, w, h };
  });
  return [image("sky", { href: snowCover ? bgSnow : bgBare, x: 0, y: 0, w: W, h: H }), image("trees", ...trees)];
}

/** Okna chaty: svítí (obsazeno), v noci tmavnou, u zazimované chaty jsou zavřené okenice. */
function windows({ occupied, winterized, night }: CabinSceneState, name = "windows"): Layer {
  const panes = layer(name);
  for (const [x, y, w, h] of WINDOWS) {
    const [px, py] = [CABIN.x + x, CABIN_Y + y];
    if (winterized) {
      add(panes, "roof-dark", box(px, py, w, h));
      add(panes, "log-dark", box(px + Math.floor(w / 2), py, 1, h));
    } else if (occupied) {
      add(panes, "lamp", box(px, py, w, h));
      add(panes, "light", box(px + 1, py + 1, w - 2, Math.ceil(h / 2) - 1));
    } else if (night) add(panes, "glass-night", box(px, py, w, h));
  }
  return panes;
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

/** Pás snímků plcha podle pózy: spí vedle chaty, u špalku štípe dříví (nápřah za hlavu, úder), u auta mává, u zazimované
 * chaty stojí bez pohybu (tam se nic nehýbe). V mrazu má plch šálu: vlastní pásy téže postavičky (`scarf`), u spánku
 * s jiným počtem snímků. */
type StripFrames = { href: string; frames: number };
const MASCOT: Record<MascotPose, StripFrames & { scarf: StripFrames; ms: number; x: number }> = {
  sleep: { href: dormouseSleep, frames: 6, scarf: { href: dormouseSleepScarf, frames: 8 }, ms: 420, x: CABIN.x + CABIN.w - 6 },
  chop: { href: dormouseChop, frames: 10, scarf: { href: dormouseChopScarf, frames: 10 }, ms: 120, x: STUMP.x - 26 },
  wave: { href: dormouseWave, frames: 13, scarf: { href: dormouseWaveScarf, frames: 13 }, ms: 150, x: CAR.x - 30 },
  idle: { href: dormouseIdle, frames: 9, scarf: { href: dormouseIdleScarf, frames: 9 }, ms: 200, x: CABIN.x + CABIN.w - 6 },
};

function mascot(state: CabinSceneState): Layer[] {
  const pose = mascotPose(state);
  const { ms, x, scarf, ...bare } = MASCOT[pose];
  const { href, frames } = state.frost ? scarf : bare;
  const y = GROUND - FEET;
  const props = pose === "chop" ? [image("stump", { href: stumpImg, x: STUMP.x, y: GROUND - STUMP.h + 1, w: STUMP.w, h: STUMP.h })] : [];
  const layers: Layer[] = [...props, { ...layer("mascot"), strip: { href, x, y, w: FRAME, h: FRAME, frames, ms, still: state.winterized } }];
  if (pose === "sleep") layers.push(drawSprite(layer("zzz", "animate-scene-zzz"), ZZZ, x + 26, y + 6, state.night ? { o: "light" } : {}));
  return layers;
}

/** Ptáček letí po vlnovce (`animate-scene-bird`) a za letu mává křídly: snímky z `BIRD_FLAP` vedle sebe jako pás. */
function bird(): Layer {
  const [w, h] = [BIRD_FLAP[0][0].length, BIRD_FLAP[0].length];
  const cels = layer("bird-cels");
  BIRD_FLAP.forEach((grid, k) => drawSprite(cels, grid, k * w, 0));
  return { ...layer("bird", "animate-scene-bird"), strip: { x: -w - 3, y: 10, w, h, frames: BIRD_FLAP.length, ms: 70, paths: cels.paths } };
}

/** `moving` = volba Animovaná: přidá vrstvy, které existují jen v pohybu (ptáček, vločky nad scénou). */
function buildScene(state: CabinSceneState, moving: boolean): Layer[] {
  const { occupied, winterized, night, snowCover } = state;
  const layers = [
    ...landscape(state),
    image("cabin", { href: snowCover ? cabinSnow : cabinBare, x: CABIN.x, y: CABIN_Y, w: CABIN.w, h: CABIN.h }),
    windows(state),
  ];
  if (state.carParked) layers.push(image("car", { href: carImg, x: CAR.x, y: GROUND - CAR.h + 1, w: CAR.w, h: CAR.h }));
  layers.push(...mascot(state));
  // Občasný drobný detail: ve dne přeletí ptáček zleva doprava (start i cíl jsou mimo scénu). U zazimované chaty se nic neděje.
  if (moving && !night && !winterized) layers.push(bird());
  if (night) {
    const rnd = seededRandom(11);
    const veil = layer("night");
    veil.opacity = 0.5;
    add(veil, "night-veil", box(0, 0, W, H));
    layers.push(veil);
    // Při sněžení je zataženo: bez měsíce a hvězd.
    if (!state.snowing) {
      const sky = drawSprite(layer("stars"), MOON, W / 2 + 64, 4);
      for (let n = 0; n < W / 5; n++) add(sky, "light", box(Math.floor(rnd() * W), Math.floor(rnd() * 30), 1, 1));
      layers.push(sky);
    }
    // Rozsvícená okna prosvítají noční clonou.
    if (occupied) layers.push(windows(state, "window-glow"));
  }
  if (occupied) layers.push(drawSprite(layer("smoke", "animate-scene-smoke"), SMOKE, CABIN.x + CHIMNEY_X, CABIN_Y - SMOKE.length - 1));
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

/** Pixel art se při zvětšení nerozmaže. */
const PIXELATED = "[image-rendering:pixelated]";

/** Okno velikosti jednoho snímku, pás za ním se posouvá po snímcích (`steps`); bez animace je vidět první snímek. */
function FrameStrip({ strip: { href, paths, x, y, w, h, frames, ms }, className }: { strip: Strip; className?: string }) {
  // Délku smyčky, počet kroků a cíl posunu bere `--animate-scene-frames` z proměnných pásu.
  const style = { "--scene-strip-ms": `${frames * ms}ms`, "--scene-strip-frames": frames, "--scene-strip-end": `${-frames * w}px` } as CSSProperties;
  return (
    <svg x={x} y={y} width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="hidden">
      {href && <image href={href} width={frames * w} height={h} className={cn(PIXELATED, className)} style={style} />}
      {paths && (
        <g className={className} style={style}>
          {[...paths].map(([token, d]) => <path key={token} d={d} style={{ fill: `var(--scene-${token})` }} />)}
        </g>
      )}
    </svg>
  );
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
        {buildScene(state, moving).map((l) => {
          const pause = motion === "paused" && "[animation-play-state:paused]";
          const animate = moving && l.motion ? cn(l.motion, pause) : undefined;
          return (
            <g key={l.name} opacity={l.opacity} className={animate}>
              {l.images.map((i) => <image key={`${i.href}-${i.x}`} href={i.href} x={i.x} y={i.y} width={i.w} height={i.h} className={PIXELATED} />)}
              {[...l.paths].map(([token, d]) => <path key={token} d={d} style={{ fill: `var(--scene-${token})` }} />)}
              {l.strip && <FrameStrip strip={l.strip} className={moving && !l.strip.still ? cn("animate-scene-frames", pause) : undefined} />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
