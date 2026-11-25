/**
 * Jednorázově odstraní EXIF (GPS, model telefonu…) ze starých JPEG uploadů (#477).
 * Logika a testy: `legacyExifStrip.ts`. Spouští ho jen provozovatel na serveru, po záloze uploadů.
 *
 * Usage:
 *   npm run uploads:strip-exif -- --dry-run            # jen report, nic nezmění
 *   npm run uploads:strip-exif                         # překóduje soubory v UPLOADS_PATH
 *   npm run uploads:strip-exif -- --dir /cesta/uploads # jiný adresář než UPLOADS_PATH
 *
 * Adresář: `--dir`, jinak `UPLOADS_PATH` z prostředí / `.env`, jinak `data/uploads`.
 * Exit code 1, když některý soubor selhal.
 */
import path from "node:path";
import "dotenv/config";
import { stripLegacyExif } from "./legacyExifStrip.js";

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const dirFlag = argv.indexOf("--dir");
  const dirArg = dirFlag >= 0 ? argv[dirFlag + 1] : undefined;
  if (dirFlag >= 0 && (!dirArg || dirArg.startsWith("--"))) throw new Error("--dir potřebuje cestu");
  const dir = path.resolve(dirArg || process.env.UPLOADS_PATH || path.join(process.cwd(), "data", "uploads"));
  return { dryRun, dir };
}

async function main() {
  const { dryRun, dir } = parseArgs(process.argv.slice(2));
  console.log(`${dryRun ? "[DRY RUN] " : ""}Odstraňuji EXIF z JPEGů v ${dir}`);

  const report = await stripLegacyExif(dir, { dryRun });

  const verb = dryRun ? "ke zpracování" : "zpracováno";
  console.log(`\nHotovo: ${report.processed} ${verb}, ${report.skipped} přeskočeno, ${report.failed} selhalo`);
  if (report.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Selhalo:", err instanceof Error ? err.message : err);
  process.exit(1);
});
