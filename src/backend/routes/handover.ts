import { Router, Request, Response } from "express";
import { protect } from "../../middleware/authMiddleware";
import { requireCabinAllowGuest } from "../../middleware/cabinMiddleware";
import prisma from "../../utils/prisma";
import logger from "../../utils/logger";
import type { HandoverOverview } from "../../types";
import { addDaysIso, calendarTodayIso, guestStayScope, pickMyStay, sanitizeCheckoutState } from "./reservationHelpers";

const router = Router();

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// GET /api/handover — tab Předávka: můj pobyt k předání a poslední předávka v chatě (spec #173)
router.get("/", protect, requireCabinAllowGuest, async (req: Request, res: Response) => {
  try {
    // protect + requireCabinAllowGuest zaručí přihlášeného uživatele s chatou
    const cabinId = req.user!.cabinId!;
    const userId = req.user!.userId;
    const today = calendarTodayIso(new Date());
    const mine = await prisma.reservation.findMany({
      where: {
        cabinId,
        status: "primary",
        dateTo: { gte: new Date(addDaysIso(today, -1)) },
        OR: [{ userId }, { participants: { some: { userId } } }],
      },
      select: { id: true, dateFrom: true, dateTo: true, isCheckoutCompleted: true },
    });
    const myStay = pickMyStay(
      mine.map((r) => ({ reservationId: r.id, from: isoDay(r.dateFrom), to: isoDay(r.dateTo), isCheckoutCompleted: r.isCheckoutCompleted })),
      today,
    );

    // Host vidí jen vlastní pobyty (#484), ani poslední předávku ostatních
    const last = await prisma.reservation.findFirst({
      where: {
        cabinId,
        ...guestStayScope(req.user),
        isCheckoutCompleted: true,
        dateTo: { lte: new Date(today) },
        ...(myStay ? { id: { not: myStay.reservationId } } : {}),
      },
      orderBy: [{ dateTo: "desc" }, { checkoutCompletedAt: { sort: "desc", nulls: "last" } }],
      select: {
        id: true, dateFrom: true, dateTo: true, checkoutState: true, checkoutCompletedAt: true, checkoutCompletedBy: true,
        user: { select: { username: true, color: true, animalIcon: true } },
      },
    });
    // Předávku mohl dokončit spolucestující; jméno jen od člena této chaty
    const author = last?.checkoutCompletedBy
      ? await prisma.user.findFirst({ where: { id: last.checkoutCompletedBy, cabinId }, select: { username: true } })
      : null;

    const body: HandoverOverview = {
      myStay,
      lastHandover: last && {
        reservationId: last.id,
        from: isoDay(last.dateFrom),
        to: isoDay(last.dateTo),
        organizer: { username: last.user.username, userColor: last.user.color, userAnimalIcon: last.user.animalIcon },
        completedByUsername: author?.username ?? null,
        completedAt: last.checkoutCompletedAt?.toISOString() ?? null,
        checkoutState: sanitizeCheckoutState(last.checkoutState) ?? {},
      },
    };
    return res.json(body);
  } catch (error) {
    logger.error("HANDOVER", "Handover overview error", { error: String(error) });
    return res.status(500).json({ message: "Předávku se nepodařilo načíst. Zkus to znovu." });
  }
});

export default router;
