/**
 * Servírování uploadů jen členům chaty, které soubor patří (#487). Nahrazuje veřejné
 * `express.static`. Token přichází v httpOnly cookie (`utils/uploadsCookie.ts`), ověří se
 * stejně jako v `protect`. Vlastnictví se hledá v DB podle cesty, kterou ukládají routy:
 * galerie (i deník a náhledy `thumbs/`), tapety a titulní fotka chaty (i úzká varianta `-sm`).
 * Bez cookie nebo s neplatnou 401, cizí či neznámý soubor 404.
 */
import type { RequestHandler } from "express";
import prisma from "../utils/prisma";
import logger from "../utils/logger";
import { verifyAuthToken } from "../middleware/authMiddleware";
import { readUploadsCookie } from "../utils/uploadsCookie";
import { COVER_PHOTO_NARROW_SUFFIX } from "./routes/cabinCoverPhoto";

/** Bezpečná relativní cesta: nejvýš jeden podadresář, jen běžné znaky, žádné `..` ani skryté soubory. */
const SAFE_PATH = /^(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)?[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/**
 * URL záznamu v DB, kterému soubor patří: náhled galerie patří originálu, úzká varianta titulní
 * fotky široké. Vrací null pro cestu, která nemůže být upload.
 */
export function ownerUrlFor(relativePath: string): string | null {
  if (!SAFE_PATH.test(relativePath) || relativePath.includes("..")) return null;
  const [dir, name] = relativePath.includes("/") ? relativePath.split("/") : ["", relativePath];
  if (dir === "thumbs") return `/uploads/${name}`;
  if (dir === "covers" && name.endsWith(`${COVER_PHOTO_NARROW_SUFFIX}.webp`)) {
    return `/uploads/covers/${name.slice(0, -`${COVER_PHOTO_NARROW_SUFFIX}.webp`.length)}.webp`;
  }
  return `/uploads/${relativePath}`;
}

async function belongsToCabin(url: string, cabinId: string): Promise<boolean> {
  const [photo, wallpaper, cabin] = await Promise.all([
    prisma.galleryPhoto.findFirst({ where: { src: url, folder: { cabinId } }, select: { id: true } }),
    prisma.wallpaper.findFirst({ where: { url, cabinId }, select: { id: true } }),
    prisma.cabin.findFirst({ where: { id: cabinId, coverPhotoUrl: url }, select: { id: true } }),
  ]);
  return Boolean(photo || wallpaper || cabin);
}

export function createUploadsHandler(uploadsPath: string): RequestHandler {
  return async (req, res) => {
    const notFound = () => res.status(404).json({ message: "Soubor nenalezen." });
    if (req.method !== "GET" && req.method !== "HEAD") return notFound();

    const token = readUploadsCookie(req);
    const user = token ? await verifyAuthToken(token).catch((error: unknown) => {
      logger.error("UPLOADS", "Failed to verify uploads cookie", { error: String(error) });
      return null;
    }) : null;
    if (!user) return res.status(401).json({ message: "Nepřihlášeno." });

    let relativePath: string;
    try {
      relativePath = decodeURIComponent(req.path.replace(/^\//, ""));
    } catch {
      return notFound();
    }
    const ownerUrl = ownerUrlFor(relativePath);
    if (!ownerUrl || !user.cabinId) return notFound();

    try {
      if (!(await belongsToCabin(ownerUrl, user.cabinId))) return notFound();
    } catch (error) {
      logger.prismaError("Uploads ownership lookup failed", error);
      return res.status(500).json({ message: "Chyba serveru." });
    }

    // `private, no-cache`: sdílené cache nic neuloží a prohlížeč se před každým použitím zeptá
    // (304 přes ETag), takže odhlášení nebo ban platí i pro už stažené fotky.
    res.sendFile(relativePath, {
      root: uploadsPath,
      dotfiles: "deny",
      cacheControl: false,
      headers: { "Cache-Control": "private, no-cache" },
    }, (error) => {
      if (error && !res.headersSent) notFound();
    });
  };
}
