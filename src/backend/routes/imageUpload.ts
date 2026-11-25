/**
 * Bezpečné nahrávání obrázků (#480) pro galerii a tapety. Přípona ani MIME od klienta nerozhodují:
 * formát pozná sharp z obsahu a projde jen rastrový formát z allowlistu (SVG, HTML ani podvrh ne).
 * Strop pixelů zastaví pixel bomb dřív, než se obrázek rozbalí. Výstup je vždy nově zakódovaný WebP
 * bez metadat (EXIF, GPS, XMP), na disk se nedostane nic z původního souboru. Odmítnutí = 4xx, ne 500.
 */
import type { RequestHandler } from "express";
import multer from "multer";
import sharp, { type ResizeOptions } from "sharp";

/** 100 MP: reálná fotka do limitu velikosti souboru je menší; výchozí strop sharp (~268 MP) by pixel bomb ještě rozbalil. */
export const MAX_INPUT_PIXELS = 100_000_000;

/** Formáty z `sharp().metadata().format`; `heif` je AVIF (HEIC prebuilt sharp stejně neumí). */
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif", "heif"]);

const NOT_AN_IMAGE = "Soubor není podporovaný obrázek. Nahraj fotku ve formátu JPEG, PNG, WebP, GIF nebo AVIF.";

/** Nahraný soubor server nepřijme; `message` je česká hláška pro uživatele. */
export class RejectedImageError extends Error {}

const openImage = (input: Buffer) => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS });

/** Ověří obrázek a zakóduje ho do WebP bez metadat. Podvržený, poškozený nebo obří soubor = `RejectedImageError`. */
export async function encodeUploadedImage(input: Buffer, resize: ResizeOptions, quality: number): Promise<Buffer> {
  try {
    const { format } = await openImage(input).metadata();
    if (!format || !ALLOWED_FORMATS.has(format)) throw new RejectedImageError(NOT_AN_IMAGE);
    return await openImage(input).resize(resize).webp({ quality }).toBuffer();
  } catch (error) {
    if (error instanceof RejectedImageError) throw error;
    const pixelLimit = error instanceof Error && error.message.includes("pixel limit");
    throw new RejectedImageError(pixelLimit ? "Obrázek má příliš velké rozměry." : NOT_AN_IMAGE);
  }
}

/** Multer do paměti pro pole `field` (1 soubor = `req.file`, víc = `req.files`); chyba uploadu = 4xx místo 500. */
export function acceptImages(field: string, maxCount: number, maxFileSize: number): RequestHandler {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxFileSize } });
  const parse = maxCount === 1 ? upload.single(field) : upload.array(field, maxCount);
  return (req, res, next) =>
    parse(req, res, (error?: unknown) => {
      if (!(error instanceof multer.MulterError)) return next(error);
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      res.status(tooLarge ? 413 : 400).json({ message: tooLarge ? "Soubor je příliš velký." : "Neplatný upload souboru." });
    });
}
