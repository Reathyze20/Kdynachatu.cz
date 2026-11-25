/**
 * utils/socket.ts — Socket.io server initialization
 * JWT-authenticated WebSocket with cabin-based rooms for multi-tenant isolation.
 */
import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { CORS_ALLOWED_ORIGINS, JWT_SECRET } from "../config/config";
import { hydrateAuthenticatedUser, isValidJwtPayload } from "../middleware/authMiddleware";
import type { CabinRole } from "../middleware/roleMiddleware";
import type { JwtPayload } from "../types";
import logger from "./logger";

let io: Server | null = null;

/** Socket user as loaded from the DB at handshake time (#486), not as claimed by the token. */
type SocketUser = JwtPayload;

/** Roles allowed to read cabin data and therefore receive cabin events. Guests are not (#486). */
const CABIN_READER_ROLES: readonly string[] = ["admin", "user"] satisfies CabinRole[];

const userRoom = (userId: string) => `user:${userId}`;

/**
 * Initialize Socket.io server on the existing HTTP server.
 * Call this once in server.new.ts after creating the HTTP server.
 */
export function initSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: CORS_ALLOWED_ORIGINS,
      methods: ["GET", "POST"],
    },
    path: "/ws",
  });

  // ── JWT authentication middleware ──────────────────────────────────────
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error("Chybí autentizační token"));
    }

    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch {
      return next(new Error("Neplatný token"));
    }

    // Same DB check as HTTP `protect`: missing, banned and stale-tokenVersion users are rejected.
    try {
      const hydrated = isValidJwtPayload(decoded) ? await hydrateAuthenticatedUser(decoded) : null;
      if (hydrated?.status !== "ok") return next(new Error("Neplatný token"));
      (socket as Socket & { user: SocketUser }).user = hydrated.user;
      next();
    } catch (error) {
      logger.error("SOCKET", "Handshake user hydration failed", { error: String(error) });
      next(new Error("Chyba serveru při ověřování uživatele"));
    }
  });

  // ── Connection handler ────────────────────────────────────────────────
  io.on("connection", (socket: Socket & { user?: SocketUser }) => {
    const user = socket.user;
    if (!user) {
      socket.disconnect();
      return;
    }

    // User room: revoking sessions disconnects every connection of the user through it.
    socket.join(userRoom(user.userId));
    // Join cabin-specific room for tenant isolation, only for roles that may read the cabin
    if (user.cabinId && CABIN_READER_ROLES.includes(user.role)) {
      socket.join(`cabin:${user.cabinId}`);
    }
    // A revocation committed between the handshake read and the join above missed this socket: re-check.
    hydrateAuthenticatedUser(user)
      .then((current) => { if (current.status !== "ok") socket.disconnect(true); })
      .catch(() => socket.disconnect(true));

    logger.info("SOCKET", "Client connected", {
      userId: user.userId,
      username: user.username,
      cabinId: user.cabinId,
    });

    socket.on("disconnect", () => {
      logger.info("SOCKET", "Client disconnected", {
        userId: user.userId,
      });
    });
  });

  logger.info("SOCKET", "Socket.io server initialized");
  return io;
}

/**
 * Get the Socket.io server instance.
 * Returns null if not yet initialized.
 */
export function getIO(): Server | null {
  return io;
}

/**
 * Emit an event to all clients in a specific cabin room.
 */
export function emitToCabin(cabinId: string, event: string, data: unknown): void {
  if (!io) return;
  io.to(`cabin:${cabinId}`).emit(event, data);
}

/** Disconnects every live connection of the user (#486). Called by session revocation after the commit. */
export function disconnectUserSockets(userId: string): void {
  if (!io) return;
  io.in(userRoom(userId)).disconnectSockets(true);
}
