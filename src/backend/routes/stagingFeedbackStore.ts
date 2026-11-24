/**
 * Úložiště zpětné vazby testerů na stagingu (#389) – bez DB, jeden soubor JSON Lines.
 *
 * Soubor leží ve sdíleném datovém adresáři vedle uploadů (`<data>/staging-feedback.jsonl`, na serveru
 * `APP_PATH/data` sdílený všemi releasy), takže přežije deploy. Seed stagingu maže jen `seed-*`
 * soubory v uploadech, tenhle soubor nezná. Záměrně ne *v* uploadech: ty servíruje `/uploads` veřejně.
 * Každý řádek nese `cabinId`, čtení pro správce (#390) filtruje podle něj.
 */
import fs from "node:fs";
import path from "node:path";
import type { StagingFeedbackRecord } from "../../types";
import { resolveSeedConfig } from "../../scripts/seedStagingConfig";

type Env = Record<string, string | undefined>;

/** Stejná brána jako testovací účty (routes/demoAccounts.ts): staging = platná konfigurace seedu. */
export function isStagingFeedbackEnabled(env: Env): boolean {
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

/** Připíše záznam jako jeden řádek. Jeden malý zápis s O_APPEND se souběžně nepromíchá. */
export async function appendStagingFeedback(filePath: string, record: StagingFeedbackRecord): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.appendFile(filePath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
}
