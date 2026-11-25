/**
 * Sprity scény chaty (#563): varianta B „Sépie zboku“ z pickeru `docs/design/10-scena-chaty.html`
 * v dvojnásobném rozlišení, maskot plch. Každý sprite je znaková mřížka, `.` je průhledné.
 * Znak → barva je `SCENE_PALETTE`, barvy jsou tokeny `--scene-*` ve `styles/variables.css`.
 * Logika stavů tu není (`cabinSceneState.ts`), sprity jde vyměnit za PNG sprite sheety.
 */

export type Sprite = readonly string[];

/** Znak mřížky → jméno tokenu bez předpony `--scene-`. Okno (g, G, Q, X, Y) přebarvuje `WINDOW_LOOK`. */
export const SCENE_PALETTE: Record<string, string> = {
  o: "ink", r: "roof", R: "roof-dark", c: "chimney", C: "roof", w: "log", W: "log-dark", T: "wood-cut",
  D: "roof-dark", n: "brass", m: "paper", g: "mist", G: "mist", Q: "paper", X: "paper", Y: "paper", s: "stone", S: "roof",
  f: "log", F: "roof", j: "pine-dark", J: "pine", k: "roof-dark", u: "car", U: "pine-dark", q: "mist",
  y: "light", x: "taillight", h: "steel", b: "fur", d: "fur-dark", l: "belly", e: "ink", i: "light",
  p: "nose", a: "paw", A: "steel", H: "handle", M: "light", "~": "smoke",
};

/** Okno: g sklo, G sklo v místě prken okenic, Q odlesk, X vodorovná příčka, Y svislá (spára okenic). */
export const WINDOW_LOOK = {
  day: {},
  dark: { g: "glass-night", G: "glass-night", Q: "glass-night" },
  lit: { g: "lamp", G: "lamp", Q: "light" },
  shut: { g: "roof", G: "roof-dark", Q: "roof", X: "roof", Y: "ink" },
} satisfies Record<string, Record<string, string>>;

/** Chata zboku 60 × 40. Zápraží (f/F) je řádek 36, komín nad sloupci 38–43. */
export const CABIN: Sprite = [
  ".....................................oooooooo...............",
  ".....................................occcccco...............",
  "......................................occcco................",
  "......................................occCco................",
  "......................................oCCCCo................",
  "......................................occcco................",
  "......................................ocCcco................",
  "......................................oCCCCo................",
  ".........ooooooooooooooooooooooooooooooccccoooooooo.........",
  "........orrrRrrrrrRrrrrrRrrrrrRrrrrrRroccCcorrrrRrro........",
  ".......orrrrRrrrrrRrrrrrRrrrrrRrrrrrRroCCCCorrrrRrrro.......",
  "......oRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRo......",
  ".....orrrRrrrrrRrrrrrRrrrrrRrrrrrRrrrrrRrrrrrRrrrrrRrro.....",
  "....orrrrRrrrrrRrrrrrRrrrrrRrrrrrRrrrrrRrrrrrRrrrrrRrrro....",
  "...oRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRo...",
  "..orrrRrrrrrRrrrrrRrrrrrRrrrrrRrrrrrRrrrrrRrrrrrRrrrrrRrro..",
  ".orrrrRrrrrrRrrrrrRrrrrrRrrrrrRrrrrrRrrrrrRrrrrrRrrrrrRrrro.",
  "oooooooooooooooooooooooooooooooooooooooooooooooooooooooooooo",
  "oRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRo",
  "orRooTowwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwoTo..",
  "orRooWoWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWoWo..",
  "orRooTowwwwwwwwwwwwwwwwwwoooooooooowwwwwwwwwwwwwwwwwwwwoTo..",
  "orRooWoWWWWWWWWWWWWWWWWWWooooooooooWWWWWWWWWWWWWWWWWWWWoWo..",
  "orRooTowwwwwwwwwwwwwwwwwwoDDoDDoDDowwwwoooooooooooooowwoTo..",
  "orRooWoWWWWWWWWWWWWWWWWWWoDDoDDoDDoWWWWommmmmmmmmmmmoWWoWo..",
  "orRooTowwwwwwwwwwwwwwwwwwoDDoDDoDDowwwwomggGQYYgGggmowwoTo..",
  "orRooWoWWWWWWWWWWWWWWWWWWoDDoDDoDDoWWWWomgQGgYYgGggmoWWoWo..",
  "orRooTowwwwwwwwwwwwwwwwwwoDDoDDoDDowwwwomQgGgYYgGggmowwoTo..",
  "orRooWoWWWWWWWWWWWWWWWWWWoDDoDDoDDoWWWWomXXXXYYXXXXmoWWoWo..",
  "orRooTowwwwwwwwwwwwwwwwwwoDDoDDonDowwwwomggGgYYgGgQmowwoTo..",
  "orRooWoWWWWWWWWWWWWWWWWWWoDDoDDoDDoWWWWomggGgYYgGQgmoWWoWo..",
  "orRooTowwwwwwwwwwwwwwwwwwoDDoDDoDDowwwwomggGgYYgGggmowwoTo..",
  "orRooWoWWWWWWWWWWWWWWWWWWoDDoDDoDDoWWWWommmmmmmmmmmmoWWoWo..",
  "orRooTowwwwwwwwwwwwwwwwwwoDDoDDoDDowwwwoooooooooooooowwoTo..",
  "orRooWoWWWWWWWWWWWWWWWWWWoDDoDDoDDoWWWommmmmmmmmmmmmmoWoWo..",
  "orRooTowwwwwwwwwwwwwwwwwwoDDoDDoDDowwwwRRRRRRRRRRRRRRwwoTo..",
  "fffffFfffffFfffffFfffffFfffffFfffffFfffffFfffffFfffffFfffff.",
  "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF.",
  "oFFosssSssssssSssssssSssssssSssssssSssssssSssssssSssssssSs..",
  "oFFoSssssssSssssssSssssssSssssssSssssssSssssssSssssssSssss..",
];

/** Plch velký 24 × 20, sedí čelem: kulaté uši bez růžové (ne kočka), velké oči v tmavých kruzích, hlodavčí
 * zoubky, huňatý ocas vedle těla (ne přes záda jako veverka z avatarů). */
export const DORMOUSE: Sprite = [
  ".ooo........ooo.........",
  "obddo......oddbo........",
  "obddboooooobddbo........",
  "obbbbbbbbbbbbbbo........",
  "obbbbbbbbbbbbbbo........",
  "obbdddbbbbdddbbo........",
  "obdieedbbdieedbo........",
  "obdeeedbbdeeedbo........",
  "obdeeedbbdeeedbo...oooo.",
  "obbdddbbbbdddbbo..obbbbo",
  ".obbbllppllbbbo..obbdbbo",
  "..obllllllllbo...obdbbdo",
  "..obdddiidddbo...obbdbbo",
  ".obbllllllllbbo..obdbbdo",
  ".obblaallaalbbo..obbdbbo",
  ".obbllllllllbbooobdbbdbo",
  ".obbllllllllbbbbbdbbdbbo",
  "..obbllllllbbbdbbdbbdbbo",
  "..oaaabbbbaaaobbdbbdbbo.",
  "...oooooooooo.oooooooo..",
];

/** Spánek: oči se zavřou (přebarvení) a přes ně jde víčko. */
export const DORMOUSE_ASLEEP = { e: "fur", i: "fur" };
export const EYELIDS: Sprite = ["ooo....ooo"];
export const ZZZ: Sprite = ["...oooo", ".....o.", "....o..", "...oooo", "ooo....", ".o.....", "ooo...."];

/** Zvednutá sekera, dlaň vpravo dole patří plchovi. */
export const AXE: Sprite = [
  ".ooo.......", "oAAAo......", "oAAAHH.....", ".oooHH.....", ".....HH....",
  "......HH...", ".......HH..", "........HH.", ".........aa", ".........aa",
];
export const STUMP: Sprite = [".oooooooooo.", "oTTTTTTTTTTo", "oTTHHHHHHTTo", "oHTTTTTTTTHo", "ooHHHHHHHHoo", "oHHRHHHRHHHo", "oHRHHHRHHHRo"];
/** Mávající tlapka vlevo nahoře. */
export const WAVE: Sprite = [".oo..", "oaao.", "oaao.", ".obo.", ".obo.", "..obo", "..obo", "...ob"];

/** Auto 40 × 16, čelem doprava. */
export const CAR: Sprite = [
  "..........ooooooooooooooooo.............",
  ".........ouuuuuuuuuuuuuuuuuo............",
  "........ouqqqqqqquuqqqqqqquuo...........",
  ".......ouuqqqqqqquuqqqqqqqquuo..........",
  "......ouuuqqqqqqquuqqqqqqqqquuo.........",
  ".....ouuuuqqqqqqquuqqqqqqqqqquuuo.......",
  ".ouuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuoooo...",
  "oxuuuuuuuuuuuuuuuUuuuuuuuuUuuuuuuuuuyo..",
  "oxuuuuuuuuuuuuuuuUuuuUuuuuUuuuuuuuuuyo..",
  "oUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUo.",
  "oUUUUoooooooooooUUUUUUUUUUoooooooooooUUo",
  ".oooo..oohhoo...ooooooooooo.oohhoo..ooo.",
  "......oohhhhoo...............oohhhhoo...",
  "......oohhhhoo...............oohhhhoo...",
  ".......oohhoo.................oohhoo....",
  "........oooo...................oooo.....",
];

/** Smrk 14 × 20. */
export const TREE: Sprite = [
  "......jJ......", ".....jjJJ.....", "....jjjjJJ....", "......jjJ.....", ".....jjjJJ....",
  "...jjjjjjJJ...", "..jj.jjjjJJJ..", ".....jjjjJ....", "....jjjjjJJ...", "..jjjjjjjjJJ..",
  ".jjjjjjjjjJJJ.", "jj..jjjjjjJ.JJ", "....jjjjjjJJ..", "..jjjjjjjjjJJ.", ".jjjjjjjjjjJJJ",
  "jjjjjjjjjjjJJJ", "jjj.jjjjjjJJ.J", "......kk......", "......kk......", "......kk......",
];

export const MOON: Sprite = ["..MMMM..", ".MMMM...", "MMMM....", "MMM.....", "MMM.....", "MMMM....", ".MMMM...", "..MMMM.."];
/** Kouř z komína, spodní obláček sedí nad komínem. */
export const SMOKE: Sprite = [
  ".~~~......", "~~~~~.....", "~~~~~.....", ".~~~......", "....~~~...", "...~~~~~..",
  "...~~~~~..", "....~~~...", "......~~..", ".....~~~~.", "......~~..",
];
