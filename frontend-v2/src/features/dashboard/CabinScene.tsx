import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import type { DashboardReservationsData, WeatherResult } from "@/api/dashboard";
import { useCabinSceneMode } from "@/hooks/useCabinSceneMode";
import { cn } from "@/lib/utils";
import { cabinSceneLabel, deriveCabinScene, fallsSlanted, mascotPose, sceneBackdrop, smokeCurls, type Backdrop, type CabinSceneState, type MascotPose } from "./cabinSceneState";
import { BIRD_FLAP, MOON, SCENE_PALETTE, SMOKE, SMOKE_WIND, ZZZ, type Sprite } from "./cabinSceneSprites";
import bgAutumn from "./scene/bg-autumn.png";
import bgBare from "./scene/bg-bare.png";
import bgSnow from "./scene/bg-snow.png";
import bgSpring from "./scene/bg-spring.png";
import bgSummer from "./scene/bg-summer.png";
import cabinBare from "./scene/cabin-bare.png";
import cabinSnow from "./scene/cabin-snow.png";
import carImg from "./scene/car.png";
import dormouseNibble from "./scene/dormouse-nibble.png";
import dormousePeek from "./scene/dormouse-peek.png";
import dormouseSleep from "./scene/dormouse-sleep.png";
import pineBareLg from "./scene/pine-bare-lg.png";
import pineBareSm from "./scene/pine-bare-sm.png";
import pineSnowLg from "./scene/pine-snow-lg.png";
import pineSnowSm from "./scene/pine-snow-sm.png";

/**
 * Scéna chaty nahoře v kartě „Na chatě teď“ (#563). Obrázek stavu chaty: stav z `cabinSceneState.ts`; krajina, chata,
 * stromy, auto a plch jsou pixel art z PixelLabu (PNG v `scene/`, 1 px obrázku = 1 jednotka mřížky); kouř,
 * vločky, ptáček, měsíc a hvězdy jsou vektorové sprity z `cabinSceneSprites.ts`. Počasí ze sdíleného dotazu Přehledu
 * na dnešní počasí (#564). Jednotka mřížky je 1,5 CSS px (pruh 114 px = 76 řádků). Široký viewBox se na užší kartě
 * ořízne po stranách, chata s maskotem zůstane uprostřed. Podle volby „Scéna chaty“ (#565) je animovaná, statická,
 * nebo se nevykreslí; animace (`--animate-scene-*` v `shadcn-tokens.css`) stojí, když je stránka na pozadí nebo
 * scéna mimo obrazovku. Plch na chatě bydlí pod střechou, je vidět za hřebenem střechy a hýbe se přepínáním snímků
 * z pásu (sprite sheet) po krocích.
 */
const W = 640;
const H = 76;
const GROUND = 70;
const CABIN = { x: 262, w: 83, h: 65 };
const CABIN_Y = GROUND - CABIN.h;
/** Okna v souřadnicích obrázku chaty (svítí, v noci tmavnou, zavírají se okenice) a ústí komína. */
const WINDOWS = [[16, 41, 5, 9], [28, 42, 7, 9]] as const;
const CHIMNEY_X = 19;
/** Vpravo od chaty parkuje auto. */
const CAR = { x: 374, w: 62, h: 19 };
/** Rovný hřeben střechy (mezi komínem a štítem) je v obrázku chaty na řádku 9. */
const RIDGE_Y = CABIN_Y + 9;
/** Snímek plcha je 40 × 40, postavička v něm sahá od řádku 8 (hlava) po řádek 31 (tlapky). Na hřebeni stojí snímek
 * od sloupce 28 obrázku chaty, postavička pak sedí mezi komínem a štítem. */
const FRAME = 40;
const FEET = 31;
const MASCOT_X = CABIN.x + 28;
/** Smrky vlevo a vpravo od chaty: [x, velký]. */
const PINES: [number, boolean][] = [
  [14, false], [40, true], [78, false], [104, true], [146, false], [176, true],
  [446, true], [484, false], [512, true], [552, false], [580, true], [612, false],
];

/** Jedna vrstva = vektorové sprity (token → cesta), obrázky a případně pás snímků. Pořadí vrstev je pořadí kreslení.
 * `motion` jsou třídy animace vrstvy, platí jen ve stavu Animovaná; pás snímků se v ní přepíná sám. */
interface Img { href: string; x: number; y: number; w: number; h: number }
/** Pás snímků vedle sebe (obrázek, nebo vektorové sprity v `paths`), vidět je vždy jeden snímek `w` × `h`. */
interface Strip { x: number; y: number; w: number; h: number; frames: number; ms: number; href?: string; paths?: Map<string, string> }
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

/** Jednobarevný závoj přes celou scénu (noc, zatažená obloha, blesk). */
function veil(name: string, token: string, opacity?: number, motion?: string): Layer {
  const l = { ...layer(name, motion), opacity };
  add(l, token, box(0, 0, W, H));
  return l;
}

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

/** Pozadí krajiny (hory, les, louka) podle ročního období, při sněhové pokrývce zasněžené (#656). */
const BACKDROP: Record<Backdrop, string> = { spring: bgSpring, summer: bgSummer, autumn: bgAutumn, bare: bgBare, snow: bgSnow };

/** Sníh přebarví louku, střechu i stromy; v mrazu mají stromy zasněžené jehličí jako námrazu. Za zataženého dne leží
 * přes pozadí šedý závoj (stromy a chata před ním zůstanou syté); v noci ho nahradí noční clona. Mlha je před stromy. */
function landscape(state: CabinSceneState): Layer[] {
  const { snowCover, frost, overcast, night } = state;
  const white = snowCover || frost;
  const trees = PINES.map(([x, big]): Img => {
    const [w, h] = big ? [31, 58] : [23, 43];
    const href = big ? (white ? pineSnowLg : pineBareLg) : (white ? pineSnowSm : pineBareSm);
    return { href, x, y: GROUND - h + 1, w, h };
  });
  const sky = [image("sky", { href: BACKDROP[sceneBackdrop(state)], x: 0, y: 0, w: W, h: H })];
  if (overcast && !night) sky.push(veil("overcast", "overcast", 0.35));
  // Mlha leží ve dvou pásech přes stromy a louku, každý pluje jinou rychlostí; noční clona ji v noci ztmaví.
  const fog = state.fog ? [fogBand("fog-trees", 29, 36, "animate-scene-fog-slow", 0.5), fogBand("fog-meadow", 31, GROUND - 7, "animate-scene-fog", 0.6)] : [];
  return [...sky, image("trees", ...trees), ...fog];
}

/** Pás mlhy (#610): chuchvalce s periodou `FOG_PERIOD` skládané za sebou od jedné periody vlevo mimo scénu. Při animaci
 * pluje doprava o jednu periodu (`animate-scene-fog-*`), smyčka tak navazuje bez skoku. */
const FOG_PERIOD = 160;
function fogBand(name: string, seed: number, top: number, motion: string, opacity: number): Layer {
  const rnd = seededRandom(seed);
  const band = { ...layer(name, motion), opacity };
  // Chuchvalec je zaoblený: nad a pod jádrem užší řádek.
  const puffs = Array.from({ length: 7 }, () => [Math.floor(rnd() * FOG_PERIOD), top + 1 + Math.floor(rnd() * 3), 20 + Math.floor(rnd() * 28), 1 + Math.floor(rnd() * 2)]);
  for (let offset = -FOG_PERIOD; offset < W; offset += FOG_PERIOD) {
    for (const [x, y, w, h] of puffs) {
      add(band, "fog", box(offset + x + 4, y - 1, w - 8, 1));
      add(band, "fog", box(offset + x, y, w, h));
      add(band, "fog", box(offset + x + 3, y + h, w - 6, 1));
    }
  }
  return band;
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

/** Jedna částice jako obdélníky [dx, dy, w, h] od svého počátku. */
type Speck = readonly (readonly [number, number, number, number])[];

/** Částice přes celou scénu, `count` na šířku scény. Při animaci padají: kopie nad scénou se posouvá o výšku scény
 * (a o `drift` doprava, když je fouká vítr), smyčka tak navazuje bez skoku. S driftem začínají částice i vlevo mimo
 * scénu, aby levý okraj za pohybu nezůstal prázdný. */
function falling(l: Layer, token: string, seed: number, count: number, moving: boolean, speck: (n: number) => Speck, drift = 0): Layer {
  const rnd = seededRandom(seed);
  for (let n = 0; n < Math.round((count * (W + drift)) / W); n++) {
    const [x, y] = [Math.floor(rnd() * (W + drift)) - drift, Math.floor(rnd() * H)];
    for (const [dx, dy, w, h] of speck(n)) {
      add(l, token, box(x + dx, y + dy, w, h));
      if (moving) add(l, token, box(x + dx - drift, y + dy - H, w, h));
    }
  }
  return l;
}

/** Silný vítr (#610) žene vločky úhlopříčně (o výšku scény doprava) a kapky o polovinu výšky; šikmé jsou i částice
 * samotné, takže směr je vidět i ve statické scéně. */
const SNOW_DRIFT = H;
const RAIN_DRIFT = H / 2;

function snowfall(slanted: boolean, moving: boolean): Layer {
  const flakes = layer("snowfall", slanted ? "animate-scene-snow-wind" : "animate-scene-snow");
  const speck = (n: number): Speck => (n % 3 ? (slanted ? [[0, 0, 1, 1], [1, 1, 1, 1]] : [[0, 0, 1, 1]]) : [[0, 0, 2, 2]]);
  return falling(flakes, "snow", 13, (W * H) / 90, moving, speck, slanted ? SNOW_DRIFT : 0);
}

/** Kapky: mrholení řídké a pomalejší, déšť a bouřka husté. */
function rainfall(precipitation: CabinSceneState["precipitation"], slanted: boolean, moving: boolean): Layer {
  const drizzle = precipitation === "drizzle";
  // Celá jména tříd, ať je Tailwind najde ve zdrojácích a utility vygeneruje.
  const motion = drizzle ? (slanted ? "animate-scene-drizzle-wind" : "animate-scene-drizzle") : (slanted ? "animate-scene-rain-wind" : "animate-scene-rain");
  const speck = (n: number): Speck => {
    const len = n % 3 ? 2 : 3;
    return slanted ? [[0, 0, 1, 2], [1, 2, 1, len - 2]] : [[0, 0, 1, len]];
  };
  return falling(layer("rain", motion), "rain", 17, (W * H) / (drizzle ? 320 : 80), moving, speck, slanted ? RAIN_DRIFT : 0);
}

/** Šplouchání na louce při dešti a bouřce: čárky 1–3 jednotky, každá skupina svítí dva snímky pásu za sebou, pak zhasne.
 * Bez animace je vidět jen první snímek, tedy jen několik čárek. */
const SPLASH_FRAMES = 6;
const SPLASHES_PER_GROUP = 7;
function splashes(): Layer {
  const rnd = seededRandom(23);
  const [w, h] = [W, H - GROUND];
  const cels = layer("splash-cels");
  for (let n = 0; n < SPLASH_FRAMES * SPLASHES_PER_GROUP; n++) {
    const [x, y, len, group] = [Math.floor(rnd() * (w - 3)), Math.floor(rnd() * h), 1 + (n % 3), n % SPLASH_FRAMES];
    for (const frame of [group, (group + 1) % SPLASH_FRAMES]) add(cels, "rain", box(frame * w + x, y, len, 1));
  }
  return { ...layer("splash"), strip: { x: 0, y: GROUND, w, h, frames: SPLASH_FRAMES, ms: 170, paths: cels.paths } };
}

/** Plch na střeše se kreslí dřív než chata, takže jeho spodek schová střecha a nad hřebenem je vidět jen to, co z něj
 * vykoukne. `y` je horní okraj snímku: spící leží stočený za hřebenem, vykukující se vynoří po krk a zase zmizí
 * (`animate-scene-peek`). V noci sleze k chatě a na zemi hryže oříšek (místo `ground`, kreslí se až po chatě). Přes zimu spí
 * schovaný pod střechou, vidět je jen zZz; stejně se schová před deštěm. */
type MascotPlace = "roof" | "ground";
/** Schovaný plch (zimní spánek, déšť) se nekreslí, je vidět jen zZz u hřebene. */
type HiddenPose = "hibernate" | "shelter";
const isHidden = (pose: MascotPose): pose is HiddenPose => pose === "hibernate" || pose === "shelter";
interface MascotStrip { href: string; frames: number; ms: number; x: number; y: number; motion?: string; place: MascotPlace }
const MASCOT: Record<Exclude<MascotPose, HiddenPose>, MascotStrip> = {
  sleep: { href: dormouseSleep, frames: 6, ms: 420, x: MASCOT_X, y: -12, place: "roof" },
  peek: { href: dormousePeek, frames: 11, ms: 160, x: MASCOT_X, y: -6, motion: "animate-scene-peek", place: "roof" },
  nibble: { href: dormouseNibble, frames: 12, ms: 130, x: CABIN.x + CABIN.w - 6, y: GROUND - FEET, place: "ground" },
};

/** Vrstva plcha, když je v daném místě: na střeše (kreslí se dřív než chata), nebo na zemi u chaty (kreslí se po ní). */
function mascot(state: CabinSceneState, place: MascotPlace): Layer[] {
  const pose = mascotPose(state);
  if (isHidden(pose) || MASCOT[pose].place !== place) return [];
  const { href, frames, ms, x, y, motion } = MASCOT[pose];
  return [{ ...layer("mascot", motion), strip: { href, x, y, w: FRAME, h: FRAME, frames, ms } }];
}

/** zZz nad spícím plchem (kreslí se až po chatě); u schovaného (zima, déšť) u hřebene. U zazimované chaty stojí, protože
 * tam se nic nehýbe. */
function snoring(state: CabinSceneState): Layer[] {
  const pose = mascotPose(state);
  if (pose !== "sleep" && !isHidden(pose)) return [];
  const [x, y] = pose === "sleep" ? [MASCOT_X + 31, 2] : [CABIN.x + 44, RIDGE_Y - ZZZ.length - 1];
  return [drawSprite(layer("zzz", state.winterized ? undefined : "animate-scene-zzz"), ZZZ, x, y, state.night ? { o: "light" } : {})];
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
    ...mascot(state, "roof"),
    image("cabin", { href: snowCover ? cabinSnow : cabinBare, x: CABIN.x, y: CABIN_Y, w: CABIN.w, h: CABIN.h }),
  ];
  if (state.carParked) layers.push(image("car", { href: carImg, x: CAR.x, y: GROUND - CAR.h + 1, w: CAR.w, h: CAR.h }));
  layers.push(...mascot(state, "ground"));
  // Soumrak a svítání (#610): teplý závoj přes krajinu, okna a kouř zůstanou nad ním.
  if (state.twilight !== "none") layers.push(veil(state.twilight, state.twilight, 0.22));
  layers.push(windows(state));
  // Občasný drobný detail: ve dne přeletí ptáček zleva doprava (start i cíl jsou mimo scénu). U zazimované chaty se nic neděje.
  if (moving && !night && !winterized) layers.push(bird());
  if (night) {
    const rnd = seededRandom(11);
    layers.push(veil("night", "night-veil", 0.5));
    // Při sněžení, srážkách a mlze je zataženo: bez měsíce a hvězd.
    if (!state.snowing && !state.overcast) {
      const sky = drawSprite(layer("stars"), MOON, W / 2 + 64, 4);
      for (let n = 0; n < W / 5; n++) add(sky, "light", box(Math.floor(rnd() * W), Math.floor(rnd() * 30), 1, 1));
      layers.push(sky);
    }
    // Rozsvícená okna prosvítají noční clonou.
    if (occupied) layers.push(windows(state, "window-glow"));
  }
  // Blesk jen v pohybu: obloha jednou za ~8 s krátce zesvětlá (`animate-scene-lightning`), i přes noční clonu.
  if (moving && state.precipitation === "storm") layers.push(veil("lightning", "flash", undefined, "animate-scene-lightning"));
  // zZz až přes noční clonu, ať je v noci vidět.
  layers.push(...snoring(state));
  if (occupied) {
    // Ve větru (#610) se kouř stáčí zleva doprava.
    const [smoke, motion] = smokeCurls(state) ? [SMOKE_WIND, "animate-scene-smoke-wind"] : [SMOKE, "animate-scene-smoke"];
    layers.push(drawSprite(layer("smoke", motion), smoke, CABIN.x + CHIMNEY_X, CABIN_Y - smoke.length - 1));
  }
  const slanted = fallsSlanted(state);
  if (state.snowing) layers.push(snowfall(slanted, moving));
  if (state.precipitation !== "none") layers.push(rainfall(state.precipitation, slanted, moving));
  if (state.precipitation === "rain" || state.precipitation === "storm") layers.push(splashes());
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
            <g key={l.name} data-layer={l.name} opacity={l.opacity} className={animate}>
              {l.images.map((i) => <image key={`${i.href}-${i.x}`} href={i.href} x={i.x} y={i.y} width={i.w} height={i.h} className={PIXELATED} />)}
              {[...l.paths].map(([token, d]) => <path key={token} d={d} style={{ fill: `var(--scene-${token})` }} />)}
              {l.strip && <FrameStrip strip={l.strip} className={moving ? cn("animate-scene-frames", pause) : undefined} />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
