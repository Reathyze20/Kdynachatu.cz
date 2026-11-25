/**
 * Jednorázové překódování starých JPEG uploadů bez metadat (#477, spec #470).
 *
 * Projde adresář uploadů rekurzivně a každý JPEG s EXIF, XMP nebo IPTC překóduje přes sharp:
 * nejdřív ho otočí podle EXIF orientace, pak metadata (GPS, model telefonu…) zahodí. Barevný
 * profil (ICC) zůstává, aby se fotky barevně nezměnily. Zápis je atomický: výsledek jde do
 * dočasného souboru ve stejném adresáři a teprve pak se přejmenuje přes originál, takže přerušený
 * běh nic nepoškodí. Soubory, které nejsou JPEG, a JPEGy bez metadat zůstanou beze změny.
 *
 * CLI: `src/scripts/stripLegacyExif.ts`. Spouští ho jen provozovatel na serveru.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export interface StripOptions {
  /** Jen spočítá, co by zpracoval; nic nezapíše. */
  dryRun: boolean;
  /** Výpis průběhu; výchozí `console.log`. */
  log?: (line: string) => void;
}

export interface StripReport {
  dryRun: boolean;
  /** JPEGy s metadaty, které byly překódované (v dry-run: které by byly). */
  processed: number;
  /** Soubory, které nejsou JPEG, nebo JPEGy bez metadat. */
  skipped: number;
  failed: number;
  failures: { file: string; error: string }[];
}

const TEMP_MARKER = ".exif-strip-";
const JPEG_QUALITY = 90;

async function isJpeg(file: string): Promise<boolean> {
  const handle = await fs.open(file, "r");
  try {
    const magic = Buffer.alloc(3);
    const { bytesRead } = await handle.read(magic, 0, 3, 0);
    return bytesRead === 3 && magic[0] === 0xff && magic[1] === 0xd8 && magic[2] === 0xff;
  } finally {
    await handle.close();
  }
}

async function* walkFiles(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    // Symlinky se nenásledují: skript smí přepsat jen soubory, které v adresáři uploadů opravdu leží.
    if (entry.isDirectory()) yield* walkFiles(full);
    else if (entry.isFile()) yield full;
  }
}

async function writeAtomically(file: string, data: Buffer): Promise<void> {
  const { mode } = await fs.stat(file);
  const temp = path.join(path.dirname(file), `.${path.basename(file)}${TEMP_MARKER}${process.pid}.tmp`);
  try {
    const handle = await fs.open(temp, "wx", mode);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temp, file);
  } catch (err) {
    await fs.rm(temp, { force: true });
    throw err;
  }
}

export async function stripLegacyExif(root: string, options: StripOptions): Promise<StripReport> {
  const log = options.log ?? ((line: string) => console.log(line));
  const report: StripReport = { dryRun: options.dryRun, processed: 0, skipped: 0, failed: 0, failures: [] };

  const rootStat = await fs.stat(root);
  if (!rootStat.isDirectory()) throw new Error(`${root} není adresář`);

  for await (const file of walkFiles(root)) {
    const relative = path.relative(root, file);
    try {
      // Pozůstatek přerušeného běhu se nezpracovává.
      if (path.basename(file).includes(TEMP_MARKER) || !(await isJpeg(file))) {
        report.skipped++;
        continue;
      }
      const input = await fs.readFile(file);
      const meta = await sharp(input).metadata();
      if (!meta.exif && !meta.xmp && !meta.iptc) {
        report.skipped++;
        continue;
      }
      if (options.dryRun) {
        report.processed++;
        log(`  ~ ${relative} (dry-run)`);
        continue;
      }
      // rotate() bez argumentu otočí podle EXIF orientace; výstup sharp metadata nepřenáší.
      const output = await sharp(input).rotate().keepIccProfile().jpeg({ quality: JPEG_QUALITY }).toBuffer();
      await writeAtomically(file, output);
      report.processed++;
      log(`  ✓ ${relative}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      report.failed++;
      report.failures.push({ file, error });
      log(`  ✗ ${relative}: ${error}`);
    }
  }

  return report;
}
