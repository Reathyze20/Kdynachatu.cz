// Obrázek náhledu odkazu (Open Graph, #698): letní scéna chaty z pixel artu Přehledu (CabinScene) a claim landing page.
// Výstup frontend-v2/public/og-image.png, 1200 × 630. Spuštění z kořene repa (sharp je závislost backendu):
//   node scripts/og-image/generate.mjs <složka s PlusJakartaSans-Bold.ttf a PlusJakartaSans-Medium.ttf>
// Písmo (OFL) se necommituje: statické TTF z https://github.com/tokotype/PlusJakartaSans (fonts/ttf).
import path from "node:path";
import sharp from "sharp";

const fontDir = process.argv[2];
if (!fontDir) throw new Error("Chybí složka s písmem Plus Jakarta Sans (viz hlavička skriptu).");

const SCENE = "frontend-v2/src/features/dashboard/scene";
const OUT = "frontend-v2/public/og-image.png";
const [W, H] = [1200, 630];
const SCALE = 4; // celé násobky, pixel art zůstane ostrý (nearest neighbour)
const INK = "#26211c"; // --raw-ink
const BRAND = "#3e5c47"; // --raw-color-2

// Souřadnice scény stejné jako v CabinScene.tsx (mřížka 640 × 76, louka na řádku 70).
const GROUND = 70;
const CABIN = { x: 262, y: GROUND - 65 };
const MASCOT = { x: CABIN.x + 28, y: -6, frame: 5, size: 40 }; // vykukující plch za hřebenem střechy, snímek 40 × 40
const CROP = { left: 170, width: W / SCALE }; // výřez kolem chaty, 300 jednotek = 1200 px

const file = (name) => path.join(SCENE, `${name}.png`);
const pine = (x, big) => ({ input: file(big ? "pine-bare-lg" : "pine-bare-sm"), left: x, top: GROUND - (big ? 58 : 43) + 1 });

// Plch: jeden snímek z pásu, horních 6 řádků (prázdných) je nad okrajem scény.
const mascot = await sharp(file("dormouse-peek"))
  .extract({ left: MASCOT.frame * MASCOT.size, top: -MASCOT.y, width: MASCOT.size, height: MASCOT.size + MASCOT.y })
  .toBuffer();

const scene = await sharp(file("bg-summer"))
  .composite([
    pine(176, true), pine(446, true),
    { input: mascot, left: MASCOT.x, top: 0 },
    { input: file("cabin-bare"), left: CABIN.x, top: CABIN.y },
    { input: file("car"), left: 374, top: GROUND - 19 + 1 },
  ])
  .png()
  .toBuffer();

const strip = await sharp(scene)
  .extract({ left: CROP.left, top: 0, width: CROP.width, height: 76 })
  .resize(W, 76 * SCALE, { kernel: "nearest" })
  .toBuffer();

// Obloha nad scénou má barvu horního okraje pozadí krajiny (pixel uprostřed horního řádku).
const SKY_SAMPLE = { left: 320, top: 0, width: 1, height: 1 };
const { data: sky } = await sharp(file("bg-summer")).extract(SKY_SAMPLE).raw().toBuffer({ resolveWithObject: true });

async function renderText(markup, weight, size) {
  const fontfile = path.join(fontDir, `PlusJakartaSans-${weight}.ttf`);
  const { data, info } = await sharp({ text: { text: markup, font: `Plus Jakarta Sans ${weight} ${size}`, fontfile, rgba: true, dpi: 72, align: "centre" } })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const lines = [
  { ...(await renderText(`<span foreground="${BRAND}" letter_spacing="2048">KDY NA CHATU</span>`, "Bold", 26)), top: 56 },
  { ...(await renderText(`<span foreground="${INK}">Sdílená chata bez dohadování.</span>`, "Bold", 64)), top: 104 },
  { ...(await renderText(`<span foreground="${INK}">Kdo kdy jede, v jakém stavu chatu nechal a co dochází.\nNa jednom místě, pro všechny rodiny, co se na chatě střídají.</span>`, "Medium", 30)), top: 204 },
];

await sharp({ create: { width: W, height: H, channels: 3, background: { r: sky[0], g: sky[1], b: sky[2] } } })
  .composite([
    { input: strip, left: 0, top: H - 76 * SCALE },
    ...lines.map((t) => ({ input: t.data, left: Math.round((W - t.width) / 2), top: t.top })),
  ])
  .png({ palette: true, colours: 128, effort: 10 })
  .toFile(OUT);

console.log(`${OUT} hotovo`);
