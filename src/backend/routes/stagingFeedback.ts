/**
 * POST /api/staging-feedback – tester na stagingu pošle z karty „Co vyzkoušet“, co mu nešlo (#389).
 * GET /api/staging-feedback – správce chaty si záznamy své chaty přečte ve Správě (#390).
 * Router se připojí jen na stagingu (app.ts, stejná brána jako demo účty), jinde obecná 404.
 * cabinId a uživatel jsou z přihlášení (req.user), nikdy z těla requestu.
 *
 * Úložiště bez DB: JSON Lines `<data>/staging-feedback.jsonl` vedle uploadů (na serveru `APP_PATH/data`,
 * sdílené všemi releasy → přežije deploy; seed maže jen `seed-*` v uploadech). Záměrně ne *v* uploadech,
 * ty servíruje `/uploads` veřejně. Každý řádek nese `cabinId` – čtení pro správce (#390) filtruje podle něj.
 */
import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { protect } from "../../middleware/authMiddleware";
import { requireCabin } from "../../middleware/cabinMiddleware";
import { validate } from "../../validators/validate";
import { stagingFeedbackSchema } from "../../validators/schemas";
import logger from "../../utils/logger";
import type { StagingFeedbackListResponse, StagingFeedbackRecord, StagingFeedbackResponse } from "../../types";
import { resolveSeedConfig } from "../../scripts/seedStagingConfig";

/** Staging = platná konfigurace seedu, shodně s routes/demoAccounts.ts. */
export function isStagingFeedbackEnabled(env: Record<string, string | undefined>): boolean {
  try {
    resolveSeedConfig(env);
    return true;
  } catch {
    return false;
  }
}

export function stagingFeedbackFilePath(uploadsPath: string): string {
  return path.join(path.dirname(path.resolve(uploadsPath)), "staging-feedback.jsonl");
}

/** Záznamy jedné chaty od nejnovějších; chybějící soubor = prázdno, poškozený řádek se přeskočí. */
async function readCabinFeedback(filePath: string, cabinId: string): Promise<StagingFeedbackRecord[]> {
  let content: string;
  try {
    content = await fs.promises.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const records = content.split("\n").flatMap((line): StagingFeedbackRecord[] => {
    if (!line.trim()) return [];
    try {
      const record = JSON.parse(line) as StagingFeedbackRecord;
      const complete = typeof record?.createdAt === "string" && typeof record.text === "string" && typeof record.viewportWidth === "number";
      return complete && record.cabinId === cabinId ? [record] : [];
    } catch {
      return [];
    }
  });
  // Soubor je v pořadí zápisu – otočit, stabilní řazení pak drží novější i při shodném čase
  return records.reverse().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createStagingFeedbackRouter(filePath: string): Router {
  const router = Router();
  router.use(protect, requireCabin);

  router.post("/", validate(stagingFeedbackSchema), async (req: Request, res: Response) => {
    const user = req.user!;
    const input = stagingFeedbackSchema.parse(req.body); // trim + zahození neznámých polí (cabinId…)
    const record: StagingFeedbackRecord = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      cabinId: user.cabinId as string,
      userId: user.userId,
      username: user.username,
    };
    try {
      // Jeden malý zápis s O_APPEND – souběžné záznamy se nepromíchají
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.appendFile(filePath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
    } catch (err) {
      logger.error("STAGING_FEEDBACK", "Zápis zpětné vazby selhal", { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ message: "Zpětnou vazbu se nepodařilo uložit. Zkus to znovu." });
    }
    logger.info("STAGING_FEEDBACK", "Uložena zpětná vazba", { taskId: record.taskId });
    const body: StagingFeedbackResponse = { id: record.id, createdAt: record.createdAt };
    return res.status(201).json(body);
  });

  router.get("/", async (req: Request, res: Response) => {
    const user = req.user!;
    // Člen dostane 404 jako cizí zdroj (#390) – neprozradit, že čtení existuje
    if (user.role !== "admin") return res.status(404).json({ message: "API endpoint nenalezen" });
    try {
      const body: StagingFeedbackListResponse = { feedback: await readCabinFeedback(filePath, user.cabinId as string) };
      return res.json(body);
    } catch (err) {
      logger.error("STAGING_FEEDBACK", "Čtení zpětné vazby selhalo", { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ message: "Zpětnou vazbu se nepodařilo načíst. Zkus to znovu." });
    }
  });

  return router;
}
