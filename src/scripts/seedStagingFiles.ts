/**
 * Soubory (fotky) pro staging seed. Píšou se jen do `UPLOADS_PATH` s prefixem `seed-`,
 * aby je šlo při opakovaném běhu bezpečně smazat, aniž by se sáhlo na jiné (reálné) uploady.
 * Formát cesty i náhledů kopíruje galerii (`/uploads/<name>` + `/uploads/thumbs/<name>`).
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { COVER_PHOTO_NARROW_SUFFIX, COVER_PHOTO_SIZES, encodeWithinBudget } from "../backend/routes/cabinCoverPhoto";

export const SEED_FILE_PREFIX = "seed-";

/** Titulní fotka demo chaty (hrad Koštálov). Leží pod `src/`, protože jen ten jde na staging. */
export const SEED_COVER_SOURCE = fileURLToPath(new URL("./assets/kostalov_view.jpeg", import.meta.url));
const SEED_COVER_URL_PATTERN = new RegExp(String.raw`^/uploads/(${SEED_FILE_PREFIX}cover-[0-9a-f]+)\.webp$`);

/**
 * `Cabin.coverPhotoUrl` demo chaty pro jeden běh seedu: `/uploads/seed-cover-<id>.webp`, mobilní
 * varianta má stejné jméno s `-sm` (vzor `cabinCoverPhoto.ts`). Jméno je při každém běhu nové,
 * protože PWA cachuje `/uploads/` jako CacheFirst a pod starým jménem by ukazovala starou fotku.
 * Prefix `seed-` zajistí, že ji `cleanSeedFiles` při dalším běhu smaže.
 */
export function createSeedCoverUrl(): string {
  return `/uploads/${SEED_FILE_PREFIX}cover-${randomBytes(4).toString("hex")}.webp`;
}

export interface SeedColor {
  r: number;
  g: number;
  b: number;
}

/** Smaže jen seed soubory (prefix `seed-`) v `UPLOADS_PATH` i v jeho `thumbs`. Ostatní nechá být. */
export async function cleanSeedFiles(uploadsPath: string): Promise<void> {
  for (const dir of [uploadsPath, path.join(uploadsPath, "thumbs")]) {
    let entries: string[];
    try {
      entries = await fs.promises.readdir(dir);
    } catch {
      continue; // adresář ještě neexistuje
    }
    await Promise.all(
      entries
        .filter((name) => name.startsWith(SEED_FILE_PREFIX))
        .map((name) => fs.promises.unlink(path.join(dir, name)).catch(() => undefined)),
    );
  }
}

/**
 * Vytvoří jednobarevný webp obrázek + náhled pod názvem `seed-<slug>.webp`.
 * Vrací veřejnou cestu `/uploads/seed-<slug>.webp` (stejný formát jako galerie a cover fotka).
 */
export async function writeSeedImage(uploadsPath: string, slug: string, color: SeedColor): Promise<string> {
  const fileName = `${SEED_FILE_PREFIX}${slug}.webp`;
  const thumbsPath = path.join(uploadsPath, "thumbs");
  await fs.promises.mkdir(thumbsPath, { recursive: true }); // vytvoří i uploadsPath
  const background = { ...color, alpha: 1 };
  await Promise.all([
    sharp({ create: { width: 1200, height: 800, channels: 4, background } })
      .webp({ quality: 80 })
      .toFile(path.join(uploadsPath, fileName)),
    sharp({ create: { width: 400, height: 300, channels: 4, background } })
      .webp({ quality: 70 })
      .toFile(path.join(thumbsPath, fileName)),
  ]);
  return `/uploads/${fileName}`;
}

/**
 * Vyrobí titulní fotku demo chaty ze skutečné fotky ve stejných variantách jako upload
 * (`cabinCoverPhoto.ts`) pod jménem z `coverUrl` (`createSeedCoverUrl`): `seed-cover-<id>.webp`
 * (široká) a `seed-cover-<id>-sm.webp` (mobil), k oběma náhled.
 */
export async function writeSeedCoverPhoto(uploadsPath: string, coverUrl: string): Promise<void> {
  const match = SEED_COVER_URL_PATTERN.exec(coverUrl);
  if (!match) throw new Error(`Not a seed cover URL: ${coverUrl}`);
  const name = match[1];
  const thumbsPath = path.join(uploadsPath, "thumbs");
  await fs.promises.mkdir(thumbsPath, { recursive: true }); // vytvoří i uploadsPath
  const source = await fs.promises.readFile(SEED_COVER_SOURCE);
  const thumb = await sharp(source).resize(400, 300, { fit: "cover", position: "centre" }).webp({ quality: 70 }).toBuffer();
  const variants = [
    { fileName: `${name}.webp`, size: COVER_PHOTO_SIZES.wide },
    { fileName: `${name}${COVER_PHOTO_NARROW_SUFFIX}.webp`, size: COVER_PHOTO_SIZES.narrow },
  ];
  await Promise.all(
    variants.map(async ({ fileName, size }) => {
      await fs.promises.writeFile(path.join(uploadsPath, fileName), await encodeWithinBudget(source, size));
      await fs.promises.writeFile(path.join(thumbsPath, fileName), thumb);
    }),
  );
}
