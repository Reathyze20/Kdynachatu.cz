/**
 * Jádro jednorázového skriptu `stripLegacyExif.ts` (#477): projde adresář uploadů (rekurzivně),
 * najde JPEGy s metadaty (EXIF, XMP, IPTC – GPS, model telefonu…) a překóduje je přes sharp bez nich.
 * Obrázek nejdřív otočí podle EXIF orientace, aby se po zahození metadat nezobrazil naležato.
 *
 * - JPEG se pozná podle hlavičky (FF D8 FF), ne podle přípony.
 * - Soubory, které nejsou JPEG, a JPEGy bez metadat zůstanou beze změny (počítají se jako přeskočené).
 * - Zápis je atomický: dočasný soubor ve stejném adresáři + přejmenování, takže přerušený běh
 *   nechá originál celý. Skript je idempotentní, druhý běh už nic nenajde.
 * - Rozbitý JPEG se zapíše do reportu jako selhání a běh pokračuje dál.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const TEMP_SUFFIX = ".strip-exif.tmp";
const JPEG_QUALITY = 90;

export interface StripExifOptions {
  dryRun: boolean;
}

export interface StripExifReport {
  dryRun: boolean;
  /** Relativní cesty JPEGů, které se překódovaly (v dry-run: které by se překódovaly). */
  processed: string[];
  skipped: number;
  failed: { file: string; error: string }[];
}

export function parseStripExifArgs(argv: string[]): StripExifOptions {
  const unknown = argv.filter((arg) => arg !== "--dry-run");
  if (unknown.length > 0) {
    throw new Error(`Neznámý argument: ${unknown.join(" ")}. Povolený je jen --dry-run.`);
  }
  return { dryRun: argv.includes("--dry-run") };
}

async function* walkFiles(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath);
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}

async function startsWithJpegMagic(file: string): Promise<boolean> {
  const handle = await fs.open(file, "r");
  try {
    const header = Buffer.alloc(JPEG_MAGIC.length);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return bytesRead === header.length && header.equals(JPEG_MAGIC);
  } finally {
    await handle.close();
  }
}

/** Otočí podle EXIF orientace a překóduje bez metadat (sharp je ve výchozím stavu nezapisuje). */
function encodeWithoutMetadata(original: Buffer): Promise<Buffer> {
  return sharp(original).rotate().jpeg({ quality: JPEG_QUALITY }).toBuffer();
}

/**
 * Atomicky nahradí originál: dočasný soubor ve stejném adresáři, fsync, rename.
 * Zachová práva i vlastníka (když skript omylem běží jako root, aplikace soubory dál přečte).
 */
async function replaceAtomically(file: string, contents: Buffer): Promise<void> {
  const { mode, uid, gid } = await fs.stat(file);
  const tempFile = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}${TEMP_SUFFIX}`);
  try {
    const handle = await fs.open(tempFile, "wx");
    try {
      await handle.writeFile(contents);
      await handle.chmod(mode & 0o7777);
      if (process.getuid?.() === 0) await handle.chown(uid, gid);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tempFile, file);
  } catch (error) {
    await fs.rm(tempFile, { force: true });
    throw error;
  }
}

export async function stripExifFromUploads(rootDir: string, options: StripExifOptions): Promise<StripExifReport> {
  const report: StripExifReport = { dryRun: options.dryRun, processed: [], skipped: 0, failed: [] };

  for await (const file of walkFiles(rootDir)) {
    const relative = path.relative(rootDir, file);
    try {
      if (file.endsWith(TEMP_SUFFIX) || !(await startsWithJpegMagic(file))) {
        report.skipped++;
        continue;
      }
      const original = await fs.readFile(file);
      const meta = await sharp(original).metadata();
      if (!meta.exif && !meta.xmp && !meta.iptc) {
        report.skipped++;
        continue;
      }
      // Dekóduje i v dry-run, aby report odhalil rozbité soubory dřív než ostrý běh.
      const stripped = await encodeWithoutMetadata(original);
      if (!options.dryRun) {
        await replaceAtomically(file, stripped);
      }
      report.processed.push(relative);
    } catch (error) {
      report.failed.push({ file: relative, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return report;
}

export function formatStripExifReport(report: StripExifReport): string {
  const lines = [
    report.dryRun ? "DRY RUN – nic se nezměnilo." : "Hotovo.",
    `${report.dryRun ? "Ke zpracování" : "Zpracováno"}: ${report.processed.length}`,
    `Přeskočeno (není JPEG nebo nemá metadata): ${report.skipped}`,
    `Selhalo: ${report.failed.length}`,
  ];
  if (report.dryRun && report.processed.length > 0) {
    lines.push("", "Soubory ke zpracování:", ...report.processed.map((file) => `  ${file}`));
  }
  if (report.failed.length > 0) {
    lines.push("", "Selhání (soubory zůstaly beze změny):", ...report.failed.map((f) => `  ${f.file}: ${f.error}`));
  }
  return lines.join("\n");
}
