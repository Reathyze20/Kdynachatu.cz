import type { DashboardReservationsData } from "@/api/dashboard";
import { cabinSceneLabel, deriveCabinScene, mascotPose, type CabinSceneState } from "./cabinSceneState";
import { AXE, CABIN, CABIN_PORCH_ROW, CAR, DORMOUSE, DORMOUSE_SLEEPING, MOON, PORCH, SCENE_PALETTE, SMOKE, STUMP, TREE, WAVE, WINDOW_LOOK, ZZZ, type Sprite } from "./cabinSceneSprites";

/**
 * Scéna chaty nahoře v kartě „Na chatě teď“ (#563). Statický obrázek: stav z `cabinSceneState.ts`,
 * sprity z `cabinSceneSprites.ts`. Jednotka mřížky je 1,5 CSS px (pruh 114 px = 76 řádků). Široký
 * viewBox se na užší kartě ořízne po stranách, chata s maskotem zůstane uprostřed.
 */
const W = 640;
const H = 76;
const GROUND = 68;
/** Zápraží (35), chata (60) a místo vpravo pro špalek nebo auto (70) uprostřed pruhu. */
const CABIN_X = W / 2 - 45;
const CABIN_Y = GROUND - CABIN.length;
const PORCH_X = CABIN_X - PORCH[0].length;
/** Horní hrana podlahy zápraží: prodloužení vlevo navazuje na zápraží chaty. */
const PORCH_TOP = CABIN_Y + CABIN_PORCH_ROW;

/** Jedna vrstva = jeden sprite na místě: token → cesta. Pořadí vrstev je pořadí kreslení. */
interface Layer { name: string; paths: Map<string, string>; opacity?: number }

function layer(name: string): Layer {
  return { name, paths: new Map() };
}

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

function landscape(night: boolean): Layer[] {
  const rnd = seededRandom(7);
  const sky = layer("sky");
  add(sky, night ? "ink" : "sky", box(0, 0, W, H));
  const hills = layer("hills");
  ([["mist", 26, 18, 1], ["hill", 14, 12, 3]] as const).forEach(([token, height, period, phase]) => {
    let d = `M0 ${GROUND}`;
    for (let x = 0; x < W; x++) d += `V${GROUND - Math.round(height + 3.2 * Math.sin(x / period + phase) + 2 * Math.sin(x / 6.6))}h1`;
    add(hills, token, `${d}V${GROUND}z`);
  });
  add(hills, "grass-dark", box(0, GROUND, W, H - GROUND));
  add(hills, "grass", box(0, GROUND, W, 1));
  for (let n = 0; n < W / 2; n++) add(hills, "grass", box(Math.floor(rnd() * W), GROUND + 1 + Math.floor(rnd() * (H - GROUND - 1)), 1 + Math.floor(rnd() * 2), 1));
  const trees = layer("trees");
  for (let x = 2; x < W - TREE[0].length; x += 10 + Math.floor(rnd() * 12)) {
    if (x + TREE[0].length > PORCH_X - 6 && x < CABIN_X + 136) continue;
    drawSprite(trees, TREE, x, GROUND - TREE.length + 1 - Math.floor(rnd() * 3));
  }
  return [sky, hills, trees];
}

function mascot(state: CabinSceneState): Layer[] {
  const pose = mascotPose(state);
  // Spí a odpočívá na zápraží vedle chaty, nikdy přes stěnu, dveře nebo okno (#579).
  const sprite = pose === "sleep" ? DORMOUSE_SLEEPING : DORMOUSE;
  const onPorch = pose === "sleep" || pose === "idle";
  const x = onPorch ? PORCH_X + 1 : pose === "wave" ? CABIN_X + 62 : CABIN_X + 86;
  const y = (onPorch ? PORCH_TOP : GROUND) - sprite.length;
  const props = layer("props");
  if (pose === "chop") drawSprite(props, STUMP, x - 15, GROUND - STUMP.length);
  const body = drawSprite(layer("mascot"), sprite, x, y);
  const extra = layer("mascot-extra");
  if (pose === "sleep") drawSprite(extra, ZZZ, x + 7, y - 8, state.night ? { o: "light" } : {});
  if (pose === "chop") drawSprite(extra, AXE, x - 8, y + 5);
  if (pose === "wave") drawSprite(extra, WAVE, x - 3, y + 7);
  return [props, body, extra];
}

function buildScene(state: CabinSceneState): Layer[] {
  const { occupied, winterized, night } = state;
  const glass = winterized ? WINDOW_LOOK.shut : occupied ? WINDOW_LOOK.lit : night ? WINDOW_LOOK.dark : WINDOW_LOOK.day;
  const layers = [...landscape(night), drawSprite(drawSprite(layer("cabin"), CABIN, CABIN_X, CABIN_Y, glass), PORCH, PORCH_X, PORCH_TOP)];
  if (state.carParked) layers.push(drawSprite(layer("car"), CAR, CABIN_X + 92, GROUND - CAR.length + 2));
  layers.push(...mascot(state));
  if (night) {
    const rnd = seededRandom(11);
    const veil = layer("night");
    veil.opacity = 0.5;
    add(veil, "night-veil", box(0, 0, W, H));
    const sky = drawSprite(layer("stars"), MOON, W / 2 + 64, 4);
    for (let n = 0; n < W / 5; n++) add(sky, "light", box(Math.floor(rnd() * W), Math.floor(rnd() * 34), 1, 1));
    layers.push(veil, sky);
    if (occupied) layers.push(drawSprite(layer("window-glow"), CABIN, CABIN_X, CABIN_Y, glass, "gGQ"));
  }
  if (occupied) layers.push(drawSprite(layer("smoke"), SMOKE, CABIN_X + 34, CABIN_Y - SMOKE.length - 1));
  return layers;
}

interface Props {
  data: DashboardReservationsData;
  winterized: boolean;
}

/** Neinteraktivní obrázek stavu chaty s popisem pro čtečky. */
export function CabinScene({ data, winterized }: Props) {
  const state = deriveCabinScene(data, winterized, new Date());
  return (
    <div className="w-full self-stretch overflow-hidden rounded-xl">
      <svg role="img" aria-label={cabinSceneLabel(state)} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" shapeRendering="crispEdges" className="block h-[114px] w-full">
        {buildScene(state).map((l) => (
          <g key={l.name} opacity={l.opacity}>
            {[...l.paths].map(([token, d]) => <path key={token} d={d} style={{ fill: `var(--scene-${token})` }} />)}
          </g>
        ))}
      </svg>
    </div>
  );
}
