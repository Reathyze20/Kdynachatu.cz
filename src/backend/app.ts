/**
 * Sestavení Express aplikace + HTTP serveru se Socket.IO, bez naslouchání na portu a bez cronu.
 * Produkční start (port, cron, graceful shutdown) je v server.new.ts; integrační testy volají createApp() přímo.
 */
import express, { type RequestHandler } from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit, { ipKeyGenerator, type Options as RateLimitOptions } from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { CORS_ALLOWED_ORIGINS, ENABLE_API_DOCS, UPLOADS_PATH } from "../config/config";
import prisma from "../utils/prisma";
import logger from "../utils/logger";
import { requestContext } from "../utils/asyncContext";
import { httpLogger } from "../middleware/httpLogger";
import { initSocketServer } from "../utils/socket";
import { openApiSpec } from "./openapi";

// Import routes
import authRoutes from "./routes/auth";
import logsRoutes from "./routes/logs";
import usersRoutes from "./routes/users";
import reservationsRoutes from "./routes/reservations";
import shoppingListRoutes from "./routes/shoppingList";
import notesRoutes from "./routes/notes";
import channelsRoutes from "./routes/channels";
import messagesRoutes from "./routes/messages";
import galleryRoutes from "./routes/gallery";
import diaryRoutes from "./routes/diary";
import reconstructionRoutes from "./routes/reconstruction";
import dashboardRoutes from "./routes/dashboard";
// noteThreadsRoutes kept for backward-compat; superseded by channelsRoutes
import noteThreadsRoutes from "./routes/noteThreads";
import shoppingListsRoutes from "./routes/shoppingLists";
import adminRoutes from "./routes/admin";
import superadminRoutes from "./routes/superadmin";
import inventoryRoutes from "./routes/inventory";
import workspaceRoutes from "./routes/workspace";
import invitesRoutes from "./routes/invites";
import cabinRoutes from "./routes/cabin";
import wallpapersRoutes from "./routes/wallpapers";
import { municipalitySearchHandler } from "./routes/municipalities";
import { validate } from "../validators/validate";
import { municipalitySearchSchema } from "../validators/schemas";
import { demoAccountsHandler, resolveDemoAccounts } from "./routes/demoAccounts";
import { createStagingFeedbackRouter } from "./routes/stagingFeedback";
import { isStagingFeedbackEnabled, stagingFeedbackFilePath } from "./routes/stagingFeedbackStore";

export interface CreateAppOptions {
  /** Rate limitery; vypíná je jen testovací harness (jeden klient by narážel na limity). */
  enableRateLimits?: boolean;
}

const passThrough: RequestHandler = (_req, _res, next) => next();

export function createApp({ enableRateLimits = true }: CreateAppOptions = {}) {
  const limiter = (options: Partial<RateLimitOptions>): RequestHandler =>
    enableRateLimits ? rateLimit(options) : passThrough;

  const app = express();
  const server = http.createServer(app);
  const isProd = process.env.NODE_ENV === "production";

  // Initialize Socket.io
  initSocketServer(server);

  // ============================================================================
  //                              MIDDLEWARE
  // ============================================================================

  // Gzip/Brotli compression
  app.use(compression());

  // Security headers
  // CSP runs in report-only mode first so violations show up in the browser console
  // without breaking the SPA; switch reportOnly off once no violations are reported.
  app.use(
    helmet({
      contentSecurityPolicy: {
        reportOnly: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", "ws:", "wss:", "https://api.open-meteo.com", "https://geocoding-api.open-meteo.com"],
          workerSrc: ["'self'", "blob:"],
          manifestSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    })
  );

  // General API rate limit — prevents abuse on all endpoints
  const apiLimiter = limiter({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: "Příliš mnoho požadavků. Zkus to za chvíli.",
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === "/api/health",
  });

  // Strict limit for auth/recovery endpoints
  const authLimiter = limiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: "Příliš mnoho pokusů o přihlášení. Zkus to později.",
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Brute-force protection for login: failed attempts per IP + username.
  // Successful logins do not count, so a legitimate user is not locked out.
  const loginLimiter = limiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: "Příliš mnoho neúspěšných pokusů o přihlášení. Zkus to za 15 minut." },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
      return `${ipKeyGenerator(req.ip ?? "")}:${username}`;
    },
  });

  // Body parser (10mb for photo uploads via multer, reduced from 50mb)
  app.use(express.json({ limit: "10mb" }));

  // Trust proxy (for Docker / reverse proxy — correct IP in rate limiter & logs)
  app.set("trust proxy", 1);

  // CORS — only the configured frontend origin(s) are allowed (FRONTEND_URL + optional
  // CORS_ORIGINS). In dev FRONTEND_URL defaults to the Vite dev server, which also proxies /api.
  app.use(cors({
    origin: CORS_ALLOWED_ORIGINS,
    credentials: true,
  }));

  // Request ID & Context middleware
  app.use((req, res, next) => {
    const requestId = req.headers['x-request-id']?.toString() || uuidv4().split('-')[0];
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);

    // Override res.json to automatically inject errorId on 500 errors
    const originalJson = res.json;
    res.json = function (body) {
      if (res.statusCode >= 500 && typeof body === 'object' && body !== null) {
        body.errorId = requestId;
      }
      return originalJson.call(this, body);
    };

    requestContext.run({ requestId }, () => {
      next();
    });
  });

  // Strukturované HTTP request/response logování (httpLogger nahrazuje starý inline blok)
  app.use(httpLogger);

  // Static files
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.join(__dirname, "../../dist/frontend");
  const uploadsPath = UPLOADS_PATH;

  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }

  // Uploads are served by both dev and prod
  app.use("/uploads", express.static(uploadsPath, {
    maxAge: "7d",
    etag: true,
    immutable: true, // Upload filenames contain UUIDs — never change
  }));

  // In production, serve Vite-built static assets from dist/frontend
  // In dev, Vite dev server handles frontend (proxied via vite.config.ts)
  if (isProd) {
    app.use(express.static(distPath, {
      maxAge: "1d",
      etag: true,
      lastModified: true,
      setHeaders(res, filePath) {
        // index.html must never be cached — SPA shell references hashed bundles
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        }
      },
    }));
  }

  // ============================================================================
  //                                ROUTES
  // ============================================================================

  // Health check (with real DB ping)
  app.get("/api/health", async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        database: "connected",
      });
    } catch (err) {
      logger.prismaError("Database health check failed", err);
      res.status(503).json({
        status: "error",
        timestamp: new Date().toISOString(),
        database: "disconnected",
      });
    }
  });

  if (ENABLE_API_DOCS) {
    app.get("/api/openapi.json", (_req, res) => {
      res.json(openApiSpec);
    });

    app.use(
      "/api/docs",
      swaggerUi.serve,
      swaggerUi.setup(openApiSpec, {
        explorer: true,
        customSiteTitle: "Chata API Docs",
        swaggerOptions: {
          persistAuthorization: true,
          tryItOutEnabled: true,
        },
      })
    );
  }

  // Apply general API rate limit to all /api routes
  app.use("/api", apiLimiter);

  // Auth routes (strict rate limiter on public auth/recovery endpoints)
  app.use("/api/login", authLimiter, loginLimiter);
  app.use("/api/register", authLimiter);
  app.use("/api/forgot-password", authLimiter);
  app.use("/api/reset-password", authLimiter);
  app.use("/api/reset-password-token", authLimiter);
  app.use("/api", authRoutes);

  // Rychlé přihlášení demo účty – neprázdné jen na stagingu (viz routes/demoAccounts.ts)
  app.get("/api/demo-accounts", demoAccountsHandler(resolveDemoAccounts(process.env)));

  // Veřejné našeptávání obcí (číselník RÚIAN) pro registraci nové chaty (viz routes/municipalities.ts)
  app.get("/api/municipalities", validate(municipalitySearchSchema, "query"), municipalitySearchHandler);

  // API routes
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/workspace", workspaceRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/reservations", reservationsRoutes);
  app.use("/api/shopping-lists", shoppingListsRoutes);
  app.use("/api/shopping-list", shoppingListRoutes);
  app.use("/api/inventory", inventoryRoutes);
  app.use("/api/notes", notesRoutes);
  app.use("/api/note-threads", noteThreadsRoutes);
  app.use("/api/channels", channelsRoutes);
  app.use("/api/messages", messagesRoutes);
  app.use("/api/gallery", galleryRoutes);
  app.use("/api/diary", diaryRoutes);
  app.use("/api/reconstruction", reconstructionRoutes);
  app.use("/api/logs", logsRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/superadmin", superadminRoutes);
  app.use("/api/cabin", cabinRoutes);
  app.use("/api/wallpapers", wallpapersRoutes);
  app.use("/api/invites/accept", authLimiter); // Rate limit invite accept (public)
  app.use("/api/invites", invitesRoutes);
  // Zpětná vazba testerů – jen na stagingu (stejná brána jako demo účty), jinde obecná 404 níže
  if (isStagingFeedbackEnabled(process.env)) {
    app.use("/api/staging-feedback", createStagingFeedbackRouter(stagingFeedbackFilePath(UPLOADS_PATH)));
  }

  // Keep unknown API routes out of the SPA fallback so clients get a real API error.
  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "API endpoint nenalezen" });
  });

  // ============================================================================
  //                            SPA FALLBACK
  // ============================================================================

  // In production, serve index.html for all non-API routes (SPA routing)
  if (isProd) {
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  return { app, server };
}
