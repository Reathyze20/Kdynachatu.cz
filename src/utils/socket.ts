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

/** Uživatel socketu podle DB v okamžiku handshaku (#486), ne podle obsahu tokenu. */
interface SocketUser {
  userId: string;
  username: string;
  role: string;
  cabinId: string | null;
}

type AuthenticatedSocket = Socket & { user?: SocketUser };

/** Role, které smí číst data chaty, a tedy dostávat její události. Host ne (#486). */
const CABIN_READER_ROLES: readonly CabinRole[] = ["admin", "user"];

const userRoom = (userId: string) => `user:${userId}`;

/**
 * Ověří token a načte uživatele z DB stejně jako HTTP `protect`: smazaný, zabanovaný a uživatel
 * se zneplatněným tokenem (stará `tokenVersion`) se nepřipojí. Vrací null = odmítnout.
 */
async function authenticateHandshake(token: string): Promise<SocketUser | null> {
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
  if (!isValidJwtPayload(decoded)) return null;

  const hydrated = await hydrateAuthenticatedUser(decoded);
  if (hydrated.status !== "ok") return null;

  const { userId, username, role, cabinId } = hydrated.user;
  return { userId, username, role, cabinId };
}

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

  // ── Auth middleware: JWT + uživatel z DB ───────────────────────────────
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error("Chybí autentizační token"));
    }

    try {
      const user = await authenticateHandshake(token);
      if (!user) return next(new Error("Neplatný token"));
      (socket as AuthenticatedSocket).user = user;
      next();
    } catch (error) {
      logger.error("SOCKET", "Handshake user hydration failed", { error: String(error) });
      next(new Error("Chyba serveru při ověřování uživatele"));
    }
  });

  // ── Connection handler ────────────────────────────────────────────────
  io.on("connection", (socket: AuthenticatedSocket) => {
    const user = socket.user;
    if (!user) {
      socket.disconnect();
      return;
    }

    // Room uživatele: zneplatnění relací přes něj odpojí všechna jeho spojení.
    socket.join(userRoom(user.userId));
    // Room chaty (tenant isolation) jen pro role, které smí data chaty číst.
    if (user.cabinId && (CABIN_READER_ROLES as readonly string[]).includes(user.role)) {
      socket.join(`cabin:${user.cabinId}`);
    }

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

/**
 * Ukončí všechna živá spojení uživatele (#486). Volá se až po commitu zneplatnění relací,
 * aby se klient nestihl znovu připojit se starou verzí tokenu.
 */
export function disconnectUserSockets(userId: string): void {
  if (!io) return;
  io.in(userRoom(userId)).disconnectSockets(true);
}
