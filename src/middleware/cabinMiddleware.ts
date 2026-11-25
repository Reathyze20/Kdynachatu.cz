// src/middleware/cabinMiddleware.ts
import { Request, Response, NextFunction } from "express";

const NO_CABIN = { message: "Nemáš přiřazenou žádnou chatu. Kontaktuj administrátora." };

/**
 * Pustí dál jen člena chaty (`admin`, `user`). Host (`guest`) je zakázaný ve výchozím stavu (#484)
 * a dostane 403; routy z jeho whitelistu (PRODUCT.md, „Role na chatě“) mají `requireCabinAllowGuest`.
 * Patří za `protect` (nastaví req.user). Uživatel bez chaty dostane 403.
 */
export const requireCabin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user?.cabinId) return res.status(403).json(NO_CABIN);
  if (req.user.role === "guest") return res.status(403).json({ message: "Host do této části chaty nemá přístup." });
  next();
};

/**
 * Jako `requireCabin`, ale pustí i hosta. Jen pro whitelist hosta v registru
 * `src/testing/routeSecurityRegistry.ts` (`MEMBERS`); handler hostovi ukáže jen jeho vlastní data.
 */
export const requireCabinAllowGuest = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user?.cabinId) return res.status(403).json(NO_CABIN);
  next();
};

/** Filtr Prisma dotazu na rezervace: host vidí jen své (#484), ostatní celou chatu. */
export const ownReservationsForGuest = (req: Request): { userId?: string } =>
  req.user?.role === "guest" ? { userId: req.user.userId } : {};

/**
 * Helper to extract cabinId from the authenticated user.
 * Returns the cabinId string or null.
 */
export const getCabinId = (req: Request): string | null => {
  return req.user?.cabinId ?? null;
};
