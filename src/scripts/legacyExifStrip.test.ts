import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { stripLegacyExif } from "./legacyExifStrip";

// Fiktivní fixtures v dočasném adresáři – nikdy reálné uploady.
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "exif-strip-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const RED = { r: 220, g: 20, b: 20 };
const BLUE = { r: 20, g: 20, b: 220 };

/** 40×20 JPEG: levá polovina červená, pravá modrá. */
async function twoToneJpeg(): Promise<sharp.Sharp> {
  const left = await sharp({ create: { width: 20, height: 20, channels: 3, background: RED } }).png().toBuffer();
  return sharp({ create: { width: 40, height: 20, channels: 3, background: BLUE } }).composite([
    { input: left, left: 0, top: 0 },
  ]);
}

/** JPEG s EXIF orientací 6 (zobrazit otočené o 90° doprava), modelem telefonu a GPS. */
async function writeJpegWithExif(file: string): Promise<void> {
  const base = await (await twoToneJpeg()).jpeg({ quality: 95 }).toBuffer();
  await sharp(base)
    .withExif({
      IFD0: { Make: "FakePhone", Model: "FakePhone 12" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "49/1 12/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "16/1 36/1 0/1" },
    })
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 95 })
    .toFile(file);
}

async function writeJpegWithoutExif(file: string): Promise<void> {
  await (await twoToneJpeg()).jpeg({ quality: 90 }).toFile(file);
}

async function pixel(file: string, x: number, y: number) {
  const { data, info } = await sharp(fs.readFileSync(file)).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

/** EXIF z sharp je little-endian; tag 0x8825 = ukazatel na GPS IFD. */
const hasGpsIfd = (exif: Buffer | undefined) => !!exif && exif.includes(Buffer.from([0x25, 0x88]));

const isRed = (p: { r: number; g: number; b: number }) => p.r > 150 && p.b < 100;
const isBlue = (p: { r: number; g: number; b: number }) => p.b > 150 && p.r < 100;
const silent = () => {};

describe("stripLegacyExif", () => {
  test("fixture opravdu nese EXIF, GPS a orientaci", async () => {
    const file = path.join(dir, "photo.jpg");
    await writeJpegWithExif(file);
    const meta = await sharp(file).metadata();
    assert.ok(meta.exif, "fixture má EXIF");
    assert.ok(hasGpsIfd(meta.exif), "fixture má GPS");
    assert.equal(meta.orientation, 6);
    assert.ok(fs.readFileSync(file).includes("FakePhone"));
  });

  test("JPEG s EXIF: po běhu nemá EXIF ani GPS, je otočený podle orientace a rozměry sedí", async () => {
    const nested = path.join(dir, "diary", "2025");
    fs.mkdirSync(nested, { recursive: true });
    const top = path.join(dir, "photo.jpg");
    const deep = path.join(nested, "IMG_0001.JPEG");
    await writeJpegWithExif(top);
    await writeJpegWithExif(deep);

    const report = await stripLegacyExif(dir, { dryRun: false, log: silent });

    assert.equal(report.processed, 2);
    assert.equal(report.failed, 0);
    for (const file of [top, deep]) {
      const meta = await sharp(file).metadata();
      assert.equal(meta.format, "jpeg");
      assert.equal(meta.exif, undefined, "bez EXIF");
      assert.equal(meta.xmp, undefined, "bez XMP");
      assert.equal(meta.orientation, undefined, "bez orientačního tagu");
      // Orientace 6 = otočit o 90° doprava: 40×20 → 20×40, levá (červená) půlka nahoře.
      assert.equal(meta.width, 20);
      assert.equal(meta.height, 40);
      assert.ok(isRed(await pixel(file, 10, 5)), "nahoře červená");
      assert.ok(isBlue(await pixel(file, 10, 35)), "dole modrá");
      const bytes = fs.readFileSync(file);
      assert.ok(!bytes.includes("FakePhone"), "model telefonu zmizel");
      assert.ok(!bytes.includes(Buffer.from("Exif\0\0", "latin1")), "žádný EXIF segment");
    }
    // Po sobě nenechá dočasné soubory.
    assert.deepEqual(fs.readdirSync(dir).sort(), ["diary", "photo.jpg"]);
    assert.deepEqual(fs.readdirSync(nested), ["IMG_0001.JPEG"]);
  });

  test("druhý běh už nic nezpracuje (idempotence)", async () => {
    await writeJpegWithExif(path.join(dir, "photo.jpg"));
    await stripLegacyExif(dir, { dryRun: false, log: silent });

    const second = await stripLegacyExif(dir, { dryRun: false, log: silent });

    assert.equal(second.processed, 0);
    assert.equal(second.skipped, 1);
  });

  test("--dry-run nic nezmění, jen spočítá, co by zpracoval", async () => {
    const file = path.join(dir, "photo.jpg");
    await writeJpegWithExif(file);
    const before = fs.readFileSync(file);
    const mtimeBefore = fs.statSync(file).mtimeMs;

    const report = await stripLegacyExif(dir, { dryRun: true, log: silent });

    assert.equal(report.processed, 1);
    assert.equal(report.dryRun, true);
    assert.ok(fs.readFileSync(file).equals(before), "obsah beze změny");
    assert.equal(fs.statSync(file).mtimeMs, mtimeBefore);
    assert.deepEqual(fs.readdirSync(dir), ["photo.jpg"]);
  });

  test("soubory, které nejsou JPEG, a JPEGy bez EXIF zůstanou beze změny", async () => {
    const plain = path.join(dir, "plain.jpg");
    await writeJpegWithoutExif(plain);
    const webp = path.join(dir, "photo.webp");
    await (await twoToneJpeg()).webp().toFile(webp);
    const png = path.join(dir, "photo.png");
    await (await twoToneJpeg()).withExif({ IFD0: { Make: "FakePhone" } }).png().toFile(png);
    const text = path.join(dir, "feedback.json");
    fs.writeFileSync(text, '{"a":1}');
    const fakeJpg = path.join(dir, "not-really.jpg");
    fs.writeFileSync(fakeJpg, "this is not an image");

    const files = [plain, webp, png, text, fakeJpg];
    const before = new Map(files.map((f) => [f, fs.readFileSync(f)]));

    const report = await stripLegacyExif(dir, { dryRun: false, log: silent });

    assert.equal(report.processed, 0);
    assert.equal(report.failed, 0);
    assert.equal(report.skipped, files.length);
    for (const f of files) {
      assert.ok(fs.readFileSync(f).equals(before.get(f)!), `${path.basename(f)} beze změny`);
    }
  });

  test("poškozený JPEG s EXIF se započítá jako selhání a originál zůstane", async () => {
    const good = path.join(dir, "good.jpg");
    await writeJpegWithExif(good);
    const broken = path.join(dir, "broken.jpg");
    const full = fs.readFileSync(good);
    fs.writeFileSync(broken, full.subarray(0, Math.floor(full.length / 2)));
    const brokenBefore = fs.readFileSync(broken);

    const report = await stripLegacyExif(dir, { dryRun: false, log: silent });

    assert.equal(report.processed, 1);
    assert.equal(report.failed, 1);
    assert.deepEqual(report.failures.map((f) => path.basename(f.file)), ["broken.jpg"]);
    assert.ok(fs.readFileSync(broken).equals(brokenBefore));
    assert.deepEqual(fs.readdirSync(dir).sort(), ["broken.jpg", "good.jpg"]);
  });

  test("neexistující adresář vyhodí chybu", async () => {
    await assert.rejects(stripLegacyExif(path.join(dir, "missing"), { dryRun: true, log: silent }));
  });
});
