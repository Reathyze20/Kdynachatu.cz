/**
 * Jednorázově posune zápisy deníku uložené z frontend-v2 o +1 den (#185, logika v `diaryDateFix.ts`).
 * Spouští ho člověk na serveru, ne agent; DB bere z `.env` aplikace. Nejdřív `npm run backup:db`, pak:
 *   npm run diary:fix-dates -- --until 2026-11-28T09:30:00Z --dry-run   # jen vypíše, co by udělal
 *   npm run diary:fix-dates -- --until 2026-11-28T09:30:00Z             # posune v jedné transakci
 * `--until` = kdy na produkci naběhla verze s opravou; `--since` volitelné. Exit 1 při problémech v plánu (nic se nezapíše) nebo chybě.
 */
import "../config/config";
import prisma from "../utils/prisma";
import { formatDiaryDateFixReport, parseDiaryDateFixArgs, runDiaryDateFix } from "./diaryDateFix";

async function main() {
  const report = await runDiaryDateFix(prisma, parseDiaryDateFixArgs(process.argv.slice(2)));
  console.log(formatDiaryDateFixReport(report));
  if (report.plan.problems.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("Oprava dat deníku selhala, nic se nezapsalo:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
