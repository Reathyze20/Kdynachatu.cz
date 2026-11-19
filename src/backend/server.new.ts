import cron from "node-cron";
import { PORT } from "../config/config";
import prisma from "../utils/prisma";
import logger from "../utils/logger";
import { checkFrostAlerts } from "./jobs/weatherAlerts";
import { createApp } from "./app";

// Sestavení aplikace (middleware, routy, Socket.IO) je v app.ts; tady jen produkční start.
const { server } = createApp();

// ============================================================================
//                          ERROR HANDLING
// ============================================================================

let isShuttingDown = false;

async function shutdownServer(reason: string, exitCode: number, error?: unknown): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  if (error) {
    logger.error("PROCESS", `Fatal process event: ${reason}`, {
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  } else {
    logger.info("PROCESS", `Gracefully shutting down (${reason})...`);
  }

  try {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((closeError) => {
          if (closeError) {
            reject(closeError);
            return;
          }
          resolve();
        });
      });
    }
  } catch (closeError) {
    logger.error("PROCESS", "Failed to close HTTP server cleanly", { error: String(closeError) });
  }

  try {
    await prisma.$disconnect();
  } catch (disconnectError) {
    logger.error("PROCESS", "Failed to disconnect Prisma during shutdown", { error: String(disconnectError) });
  }

  process.exit(exitCode);
}

process.on("SIGINT", () => {
  void shutdownServer("SIGINT", 0);
});

process.on("SIGTERM", () => {
  void shutdownServer("SIGTERM", 0);
});

process.on("unhandledRejection", (reason) => {
  logger.error("PROCESS", "Unhandled promise rejection", {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on("uncaughtException", (error) => {
  void shutdownServer("UNCAUGHT_EXCEPTION", 1, error);
});

// ============================================================================
//                            START SERVER
// ============================================================================

server.listen(PORT, () => {
  logger.info("SERVER", "Backend server naslouchá", {
    port: PORT,
    healthUrl: `http://localhost:${PORT}/api/health`,
  });

  // ── Cron Jobs ──────────────────────────────────────────────────────────
  // Frost alert check — every day at 12:00 (noon)
  cron.schedule("0 12 * * *", () => {
    logger.info("CRON", "Running scheduled frost alert check");
    checkFrostAlerts();
  });
  logger.info("CRON", "Frost alert cron scheduled (daily at 12:00)");
});
