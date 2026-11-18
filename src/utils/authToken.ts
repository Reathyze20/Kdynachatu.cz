import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/config";
import type { JwtPayload } from "../types";

/** Platnost přihlašovacího JWT. Jediné místo, kde se TTL tokenu nastavuje. */
export const JWT_TTL = "7d";

export interface AuthTokenSubject {
  id: string;
  username: string;
  role: string;
  cabinId: string | null;
  isSuperAdmin: boolean;
}

/** Vydá přihlašovací JWT s aktuálními údaji uživatele a sdíleným TTL. */
export function signAuthToken(user: AuthTokenSubject): string {
  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    cabinId: user.cabinId,
    isSuperAdmin: user.isSuperAdmin,
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_TTL });
}
