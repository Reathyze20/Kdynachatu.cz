/**
 * Soubory (fotky) pro staging seed. Píšou se jen do `UPLOADS_PATH` s prefixem `seed-`,
 * aby je šlo při opakovaném běhu bezpečně smazat, aniž by se sáhlo na jiné (reálné) uploady.
 * Formát cesty i náhledů kopíruje galerii (`/uploads/<name>` + `/uploads/thumbs/<name>`).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export const SEED_FILE_PREFIX = "seed-";

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
