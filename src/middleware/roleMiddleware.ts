// src/middleware/roleMiddleware.ts
import type { RequestHandler } from "express";

export type CabinRole = "admin" | "user" | "guest";

/**
 * Pustí dál jen uživatele s jednou z povolených rolí v chatě, ostatním vrátí 403 se zprávou routy.
 * Patří za `protect` (a `requireCabin`). Nové routy ho dávají před `validate`, ať zakázaná role nedostane
 * ani validační chybu; u převzatých ručních kontrol stojí tam, kde stála kontrola, aby se chování nezměnilo.
 * Které role smí na kterou routu, eviduje registr `src/testing/routeSecurityRegistry.ts`.
 */
export function requireRole(allowed: readonly CabinRole[], message = "Nemáš oprávnění."): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ message: "Neautorizováno" });
      return;
    }
    if (!(allowed as readonly string[]).includes(req.user.role)) {
      res.status(403).json({ message });
      return;
    }
    next();
  };
}
