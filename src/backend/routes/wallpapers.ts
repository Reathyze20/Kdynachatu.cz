import { Router, Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import { protect } from "../../middleware/authMiddleware";
import { requireRole } from "../../middleware/roleMiddleware";
import { GUEST_FORBIDDEN_MESSAGE } from "../../middleware/cabinMiddleware";
import prisma from "../../utils/prisma";
import logger from "../../utils/logger";
import { UPLOADS_PATH } from "../../config/config";
import { z } from "zod";
import expressAsyncHandler from "express-async-handler";

const router = Router();

// Multer in-memory storage for sharp processing
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Pouze obrázky jsou povoleny"));
    }
  },
});

router.get(
  "/",
  protect,
  requireRole(["admin", "user"], GUEST_FORBIDDEN_MESSAGE), // #484: host je zakázaný ve výchozím stavu
  expressAsyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.cabinId) {
      res.status(400).json({ message: "Uživatel nemá přiřazenou chatu" });
      return;
    }

    const wallpapers = await prisma.wallpaper.findMany({
      where: { cabinId: req.user.cabinId },
      orderBy: { createdAt: "desc" },
    });

    res.json(wallpapers);
  })
);

router.post(
  "/",
  protect,
  // Před uploadem: soubor od hosta se ani nenačte do paměti.
  requireRole(["admin", "user"], "Host nemůže nahrávat tapety"),
  upload.single("image"),
  expressAsyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.cabinId) {
      res.status(400).json({ message: "Uživatel nemá přiřazenou chatu" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ message: "Žádný soubor nebyl nahrán" });
      return;
    }

    // Ensure uploads directory exists
    const wpDir = path.join(UPLOADS_PATH, "wallpapers");
    await fs.mkdir(wpDir, { recursive: true });

    const filename = `${uuidv4()}.webp`;
    const filepath = path.join(wpDir, filename);

    // Process image with sharp: resize max 1920px width, convert to webp 80% quality
    await sharp(req.file.buffer)
      .resize({ width: 1920, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(filepath);

    const fileUrl = `/uploads/wallpapers/${filename}`;

    const wallpaper = await prisma.wallpaper.create({
      data: {
        url: fileUrl,
        cabinId: req.user.cabinId,
      },
    });

    res.status(201).json(wallpaper);
  })
);

router.delete(
  "/:id",
  protect,
  expressAsyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.cabinId) {
      res.status(400).json({ message: "Uživatel nemá přiřazenou chatu" });
      return;
    }

    const { id } = req.params;

    const wallpaper = await prisma.wallpaper.findUnique({
      where: { id },
    });

    // Cizí nebo neexistující tapeta je nerozlišitelná od "neexistuje" (tenant kontrakt #64):
    // cabinId mimo vlastní chatu vrací 404, ne 403, aby neprozradil, že id je reálná tapeta jinde.
    if (!wallpaper || wallpaper.cabinId !== req.user.cabinId) {
      res.status(404).json({ message: "Tapeta nenalezena" });
      return;
    }

    const isGuest = req.user.role === "guest";
    if (isGuest) {
      res.status(403).json({ message: "Host nemůže mazat tapety" });
      return;
    }

    await prisma.wallpaper.delete({ where: { id } });

    // Try to delete file from disk
    try {
      const filename = path.basename(wallpaper.url);
      const filepath = path.join(UPLOADS_PATH, "wallpapers", filename);
      await fs.unlink(filepath);
    } catch (err) {
      logger.warn("WALLPAPER", "Nepodařilo se smazat soubor tapety", { url: wallpaper.url, err });
    }

    res.json({ message: "Tapeta úspěšně smazána" });
  })
);

export default router;