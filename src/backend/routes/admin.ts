import { Router, Request, Response } from "express";
import prisma from "../../utils/prisma";
import { protect } from "../../middleware/authMiddleware";
import { requireCabin } from "../../middleware/cabinMiddleware";
import { requireRole } from "../../middleware/roleMiddleware";
import logger from "../../utils/logger";

const router = Router();

router.get("/system", protect, requireCabin, requireRole(["admin"], "Přístup pouze pro administrátora."), async (req: Request, res: Response) => {
  try {
    const cabinId = req.user!.cabinId!;
    const [userCount, reservationCount, photoCount, noteCount] = await Promise.all([
      prisma.user.count({ where: { cabinId } }),
      prisma.reservation.count({ where: { cabinId } }),
      prisma.galleryPhoto.count({ where: { folder: { cabinId } } }),
      prisma.note.count({ where: { cabinId } }),
    ]);

    res.json({
      userCount,
      reservationCount,
      photoCount,
      noteCount,
    });
  } catch (error) {
    logger.error("ADMIN", "Failed to fetch system info", error);
    res.status(500).json({ message: "Nepodařilo se načíst systémové informace" });
  }
});

export default router;
