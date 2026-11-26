/**
 * Drobné vektorové sprity scény chaty (#563): kouř, zZz, měsíc a ptáček. Krajina, chata a plch jsou PNG z PixelLabu
 * v `scene/`. Každý sprite je znaková mřížka, `.` je průhledné. Znak → barva je `SCENE_PALETTE`, barvy jsou tokeny
 * `--scene-*` ve `styles/variables.css`.
 */

export type Sprite = readonly string[];

/** Znak mřížky → jméno tokenu bez předpony `--scene-`. */
export const SCENE_PALETTE: Record<string, string> = { o: "ink", M: "light", "~": "smoke" };

/** Spánek plcha. */
export const ZZZ: Sprite = ["...oooo", ".....o.", "....o..", "...oooo", "ooo....", ".o.....", "ooo...."];

/** Měsíc v noci bez sněžení. */
export const MOON: Sprite = ["..MMMM..", ".MMMM...", "MMMM....", "MMM.....", "MMM.....", "MMMM....", ".MMMM...", "..MMMM.."];

/** Ptáček, který ve stavu Animovaná občas přeletí oblohu (#565), zepředu. Snímky mávnutí křídly: nahoře, výš, rovně,
 * níž, dole a zpět; tělo a ocásek stojí na místě. */
const WINGS_UP: Sprite = ["o.....o", ".o...o.", "..ooo..", "...o...", "......."];
const WINGS_HIGH: Sprite = [".......", "oo...oo", "..ooo..", "...o...", "......."];
const WINGS_FLAT: Sprite = [".......", ".......", "ooooooo", "...o...", "......."];
const WINGS_LOW: Sprite = [".......", ".......", ".ooooo.", "o..o..o", "......."];
const WINGS_DOWN: Sprite = [".......", ".......", "..ooo..", ".o.o.o.", "o.....o"];
export const BIRD_FLAP: Sprite[] = [WINGS_UP, WINGS_HIGH, WINGS_FLAT, WINGS_LOW, WINGS_DOWN, WINGS_LOW, WINGS_FLAT, WINGS_HIGH];
/** Kouř z komína, spodní obláček sedí nad komínem. */
export const SMOKE: Sprite = [
  ".~~~......", "~~~~~.....", "~~~~~.....", ".~~~......", "....~~~...", "...~~~~~..",
  "...~~~~~..", "....~~~...", "......~~..", ".....~~~~.", "......~~..",
];
