/**
 * Jednorázově odstraní EXIF (GPS, model telefonu…) ze starých JPEG uploadů (#477).
 * Spouští ho člověk na serveru, ne agent. Cesta k uploadům se bere z konfigurace aplikace
 * (`UPLOADS_PATH` v `.env`, jinak `data/uploads`), stejně jako u běžící aplikace.
 *
 * Postup: nejdřív záloha uploadů (`npm run backup:uploads`), pak dry run, pak ostrý běh.
 *   npm run uploads:strip-exif -- --dry-run   # jen vypíše, co by udělal
 *   npm run uploads:strip-exif                # překóduje JPEGy s metadaty
 *
 * Exit kód 1, když některý soubor selhal (ten zůstane beze změny).
 */
import { UPLOADS_PATH } from "../config/config";
import { formatStripExifReport, parseStripExifArgs, stripExifFromUploads } from "./stripExif";

async function main() {
  const options = parseStripExifArgs(process.argv.slice(2));
  console.log(`Uploads: ${UPLOADS_PATH}${options.dryRun ? " (dry run)" : ""}`);
  const report = await stripExifFromUploads(UPLOADS_PATH, options);
  console.log(formatStripExifReport(report));
  if (report.failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Strip EXIF failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
