/**
 * POST /api/staging-feedback – tester na stagingu pošle z karty „Co vyzkoušet“, co mu nešlo (#389).
 * Router se připojí jen na stagingu (app.ts), jinde padá na obecnou 404 a nic se nezapíše.
 * cabinId a uživatel jsou z přihlášení (req.user), nikdy z těla requestu.
 */
import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { protect } from "../../middleware/authMiddleware";
import { requireCabin } from "../../middleware/cabinMiddleware";
import { validate } from "../../validators/validate";
import { stagingFeedbackSchema } from "../../validators/schemas";
import logger from "../../utils/logger";
import type { StagingFeedbackRecord, StagingFeedbackResponse } from "../../types";
import { appendStagingFeedback } from "./stagingFeedbackStore";

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
      await appendStagingFeedback(filePath, record);
    } catch (err) {
      logger.error("STAGING_FEEDBACK", "Zápis zpětné vazby selhal", { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ message: "Zpětnou vazbu se nepodařilo uložit. Zkus to znovu." });
    }
    logger.info("STAGING_FEEDBACK", "Uložena zpětná vazba", { taskId: record.taskId });
    const body: StagingFeedbackResponse = { id: record.id, createdAt: record.createdAt };
    return res.status(201).json(body);
  });

  return router;
}
