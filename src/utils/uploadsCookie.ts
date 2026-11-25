/**
 * Cookie s přihlašovacím JWT pro fotky (#487). `<img src="/uploads/…">` neposílá hlavičku
 * Authorization, proto server při vydání tokenu nastaví stejný JWT i do httpOnly cookie s path
 * `/uploads`; na API ani do JavaScriptu se nedostane. Ověřuje ji `backend/uploadsAccess.ts`.
 */
import type { CookieOptions, Request, Response } from "express";
import jwt from "jsonwebtoken";

export const UPLOADS_COOKIE = "kdynachatu_uploads";

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  path: "/uploads",
});

/** Nastaví cookie se stejným tokenem a stejnou platností (do `exp` tokenu). */
export function setUploadsCookie(res: Response, token: string): void {
  const exp = (jwt.decode(token) as { exp?: number } | null)?.exp;
  const maxAge = exp ? exp * 1000 - Date.now() : 0;
  if (maxAge > 0) res.cookie(UPLOADS_COOKIE, token, { ...cookieOptions(), maxAge });
}

export function clearUploadsCookie(res: Response): void {
  res.clearCookie(UPLOADS_COOKIE, cookieOptions());
}

/** Hodnota cookie z hlavičky Cookie (bez cookie-parseru; JWT obsahuje jen znaky base64url a tečky). */
export function readUploadsCookie(req: Request): string | null {
  const prefix = `${UPLOADS_COOKIE}=`;
  const part = (req.headers.cookie ?? "").split(";").map((p) => p.trim()).find((p) => p.startsWith(prefix));
  return part ? part.slice(prefix.length) || null : null;
}
