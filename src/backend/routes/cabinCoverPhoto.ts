/**
 * Titulní fotka chaty (#321): dvě malé WebP varianty v poměru pruhu na Přehledu, ořez na střed.
 * Do `Cabin.coverPhotoUrl` jde cesta široké varianty (`/uploads/covers/<uuid>.webp`),
 * úzká pro mobil má stejné jméno s příponou `-sm` (`<uuid>-sm.webp`).
 * Bez importu configu: adresáře dodává volající, unit testy tak běží v dočasném adresáři.
 */
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";

export const COVER_PHOTO_URL_PREFIX = "/uploads/covers/";
export const COVER_PHOTO_NARROW_SUFFIX = "-sm";

/** Pruh je asi 140 px vysoký na mobilu a 200 px na desktopu; varianty jsou pro 2× hustotu. */
export const COVER_PHOTO_SIZES = {
  wide: { width: 1000, height: 360, quality: 64 },
  narrow: { width: 750, height: 280, quality: 68 },
} as const;

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
      (["wide", "narrow"] as const).map((variant) => {
        const { width, height, quality } = COVER_PHOTO_SIZES[variant];
        return sharp(source)
          .resize(width, height, { fit: "cover", position: "centre" })
          .webp({ quality })
          .toFile(path.join(coversDir, names[variant]));
      }),
    );
  } catch (error) {
    await removeCoverPhotoFiles(url, coversDir);
    throw error;
  }
  return url;
}

/** Smaže obě varianty titulní fotky; neznámou URL a chybějící soubory tiše přeskočí. */
export async function removeCoverPhotoFiles(url: string | null | undefined, coversDir: string): Promise<void> {
  const names = coverPhotoFileNames(url);
  if (!names) return;
  await Promise.all(
    [names.wide, names.narrow].map((name) => fs.unlink(path.join(coversDir, name)).catch(() => undefined)),
  );
}
