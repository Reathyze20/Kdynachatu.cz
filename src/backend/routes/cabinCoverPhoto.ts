/**
 * Titulní fotka chaty (#321): dvě WebP varianty ve velikosti pozadí appky (#340), ořez na střed.
 * Do `Cabin.coverPhotoUrl` jde cesta široké varianty (`/uploads/covers/<uuid>.webp`),
 * úzká pro mobil má stejné jméno s příponou `-sm` (`<uuid>-sm.webp`).
 * Bez importu configu: adresáře dodává volající, unit testy tak běží v dočasném adresáři.
 */
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import { MAX_INPUT_PIXELS } from "./imageUpload";

export const COVER_PHOTO_URL_PREFIX = "/uploads/covers/";
export const COVER_PHOTO_NARROW_SUFFIX = "-sm";

/**
 * Pozadí přes celou obrazovku (#340): desktop na šířku, mobil na výšku. `maxBytes` je strop
 * velikosti souboru; kvalita se snižuje po `COVER_PHOTO_QUALITIES`, dokud se varianta nevejde.
 * Klíče `wide`/`narrow` zůstaly z #321 kvůli jménům souborů: `narrow` je mobilní `-sm`.
 */
export const COVER_PHOTO_SIZES = {
  wide: { width: 1920, height: 1200, maxBytes: 200_000 },
  narrow: { width: 1080, height: 1920, maxBytes: 150_000 },
} as const;

/** Nejvyšší kvalita první; poslední stupeň se použije, i když by soubor byl pořád větší. */
const COVER_PHOTO_QUALITIES = [72, 64, 56, 48, 40] as const;

type CoverPhotoVariantSize = (typeof COVER_PHOTO_SIZES)[keyof typeof COVER_PHOTO_SIZES];

const COVER_URL = /^\/uploads\/covers\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.webp$/;

/**
 * Jména souborů titulní fotky, kterou vyrobil tento modul. Cokoli jiného (seed, starý volný
 * text z PATCH, pokus o `..`) vrátí null – takovou hodnotu server nikdy nemaže z disku.
 */
export function coverPhotoFileNames(url: string | null | undefined): { wide: string; narrow: string } | null {
  const match = url ? COVER_URL.exec(url) : null;
  if (!match) return null;
  return { wide: `${match[1]}.webp`, narrow: `${match[1]}${COVER_PHOTO_NARROW_SUFFIX}.webp` };
}

/** Vyrobí obě varianty pod novým náhodným jménem a vrátí URL široké. Při chybě nic nenechá. */
export async function createCoverPhotoVariants(sourcePath: string, coversDir: string): Promise<string> {
  await fs.mkdir(coversDir, { recursive: true });
  const url = `${COVER_PHOTO_URL_PREFIX}${uuidv4()}.webp`;
  const names = coverPhotoFileNames(url)!;

  try {
    const source = await fs.readFile(sourcePath);
    await Promise.all(
      (["wide", "narrow"] as const).map(async (variant) => {
        const webp = await encodeWithinBudget(source, COVER_PHOTO_SIZES[variant]);
        await fs.writeFile(path.join(coversDir, names[variant]), webp);
      }),
    );
  } catch (error) {
    await removeCoverPhotoFiles(url, coversDir);
    throw error;
  }
  return url;
}

/**
 * Ořízne zdroj na střed do cílové velikosti a zakóduje ho do WebP v nejvyšší kvalitě, která se vejde.
 * Používá ho i staging seed (`seedStagingFiles.ts`), aby demo titulní fotka měla stejné varianty.
 */
export async function encodeWithinBudget(source: Buffer, { width, height, maxBytes }: CoverPhotoVariantSize): Promise<Buffer> {
  const { data, info } = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize(width, height, { fit: "cover", position: "centre" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const encode = (quality: number) => sharp(data, { raw: info }).webp({ quality }).toBuffer();
  for (const quality of COVER_PHOTO_QUALITIES.slice(0, -1)) {
    const webp = await encode(quality);
    if (webp.length <= maxBytes) return webp;
  }
  return encode(COVER_PHOTO_QUALITIES[COVER_PHOTO_QUALITIES.length - 1]);
}

/** Smaže obě varianty titulní fotky; neznámou URL a chybějící soubory tiše přeskočí. */
export async function removeCoverPhotoFiles(url: string | null | undefined, coversDir: string): Promise<void> {
  const names = coverPhotoFileNames(url);
  if (!names) return;
  await Promise.all(
    [names.wide, names.narrow].map((name) => fs.unlink(path.join(coversDir, name)).catch(() => undefined)),
  );
}
