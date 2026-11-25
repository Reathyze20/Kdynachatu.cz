import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { formatStripExifReport, parseStripExifArgs, stripExifFromUploads } from "./stripExif";

const WIDTH = 40;
const HEIGHT = 20;
/** Little-endian tag 0x8825 (GPS IFD pointer) – přítomný jen v EXIF s GPS. */
const GPS_IFD_TAG = Buffer.from([0x25, 0x88]);

/** Levá polovina červená, pravá modrá – podle barev nahoře/dole poznáme, jestli se obrázek otočil. */
function halfRedHalfBlue(): Buffer {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 3;
      if (x < WIDTH / 2) pixels[i] = 255;
      else pixels[i + 2] = 255;
    }
  }
  return pixels;
}

/** JPEG jako z telefonu: EXIF s modelem, GPS a orientací 6 (zobrazit otočený o 90° doprava). */
async function phoneJpeg(): Promise<Buffer> {
  return sharp(halfRedHalfBlue(), { raw: { width: WIDTH, height: HEIGHT, channels: 3 } })
    .jpeg({ quality: 95 })
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Make: "SecretMake", Model: "SecretPhone" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "50/1 5/1 0/1" },
    })
    .toBuffer();
}

async function plainJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: "#336699" } }).jpeg().toBuffer();
}

async function pixelAt(file: string, x: number, y: number): Promise<{ r: number; g: number; b: number }> {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

describe("stripExifFromUploads", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "strip-exif-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* temp adresář uklidí OS */
    }
  });

  test("fixture really carries EXIF, GPS and orientation", async () => {
    const meta = await sharp(await phoneJpeg()).metadata();
    assert.equal(meta.orientation, 6);
    assert.ok(meta.exif?.includes("SecretPhone"));
    assert.ok(meta.exif?.includes(GPS_IFD_TAG));
  });

  test("re-encodes a JPEG with EXIF: no EXIF/GPS left, rotated per orientation, dimensions swapped", async () => {
    const file = path.join(dir, "photo.jpeg");
    fs.writeFileSync(file, await phoneJpeg());

    const report = await stripExifFromUploads(dir, { dryRun: false });

    assert.deepEqual(report.processed, ["photo.jpeg"]);
    assert.equal(report.skipped, 0);
    assert.deepEqual(report.failed, []);

    const meta = await sharp(file).metadata();
    assert.equal(meta.format, "jpeg");
    assert.equal(meta.exif, undefined, "no EXIF block at all, so no GPS or phone model");
    assert.equal(meta.orientation, undefined);
    assert.equal(meta.width, HEIGHT);
    assert.equal(meta.height, WIDTH);
    assert.ok(!fs.readFileSync(file).includes("SecretPhone"));

    // Orientace 6 = otočit o 90° doprava: levý (červený) okraj se dostane nahoru.
    const top = await pixelAt(file, HEIGHT / 2, 2);
    const bottom = await pixelAt(file, HEIGHT / 2, WIDTH - 3);
    assert.ok(top.r > 200 && top.b < 60, `top should be red, got ${JSON.stringify(top)}`);
    assert.ok(bottom.b > 200 && bottom.r < 60, `bottom should be blue, got ${JSON.stringify(bottom)}`);
  });

  test("walks subdirectories and leaves no temporary files behind", async () => {
    fs.mkdirSync(path.join(dir, "thumbs"));
    fs.writeFileSync(path.join(dir, "a.jpg"), await phoneJpeg());
    fs.writeFileSync(path.join(dir, "thumbs", "b.JPG"), await phoneJpeg());

    const report = await stripExifFromUploads(dir, { dryRun: false });

    assert.deepEqual([...report.processed].sort(), ["a.jpg", path.join("thumbs", "b.JPG")]);
    assert.deepEqual(fs.readdirSync(dir).sort(), ["a.jpg", "thumbs"]);
    assert.deepEqual(fs.readdirSync(path.join(dir, "thumbs")), ["b.JPG"]);
    assert.equal((await sharp(path.join(dir, "thumbs", "b.JPG")).metadata()).exif, undefined);
  });

  test("--dry-run reports what it would do and changes nothing", async () => {
    const file = path.join(dir, "photo.jpeg");
    const original = await phoneJpeg();
    fs.writeFileSync(file, original);

    const report = await stripExifFromUploads(dir, { dryRun: true });

    assert.equal(report.dryRun, true);
    assert.deepEqual(report.processed, ["photo.jpeg"]);
    assert.ok(fs.readFileSync(file).equals(original), "file bytes unchanged");
    assert.deepEqual(fs.readdirSync(dir), ["photo.jpeg"]);
  });

  test("leaves non-JPEG files and JPEGs without EXIF byte-for-byte unchanged", async () => {
    const files: Record<string, Buffer> = {
      "clean.jpeg": await plainJpeg(),
      "photo.webp": await sharp(await phoneJpeg()).keepMetadata().webp().toBuffer(),
      "photo.png": await sharp(await phoneJpeg()).keepMetadata().png().toBuffer(),
      "notes.txt": Buffer.from("ahoj"),
      "fake.jpg": Buffer.from("not really a jpeg"),
    };
    for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), bytes);

    const report = await stripExifFromUploads(dir, { dryRun: false });

    assert.deepEqual(report.processed, []);
    assert.deepEqual(report.failed, []);
    assert.equal(report.skipped, Object.keys(files).length);
    for (const [name, bytes] of Object.entries(files)) {
      assert.ok(fs.readFileSync(path.join(dir, name)).equals(bytes), `${name} unchanged`);
    }
  });

  test("a broken JPEG is reported as failed, left untouched, and does not stop the run", async () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), Buffer.from("garbage")]);
    fs.writeFileSync(path.join(dir, "broken.jpg"), broken);
    fs.writeFileSync(path.join(dir, "photo.jpg"), await phoneJpeg());

    const report = await stripExifFromUploads(dir, { dryRun: false });

    assert.deepEqual(report.processed, ["photo.jpg"]);
    assert.equal(report.failed.length, 1);
    assert.equal(report.failed[0].file, "broken.jpg");
    assert.ok(fs.readFileSync(path.join(dir, "broken.jpg")).equals(broken));
    assert.deepEqual(fs.readdirSync(dir).sort(), ["broken.jpg", "photo.jpg"]);
  });

  test("--dry-run already reports a JPEG that cannot be decoded", async () => {
    const original = await phoneJpeg();
    const truncated = original.subarray(0, original.length - 200);
    fs.writeFileSync(path.join(dir, "truncated.jpg"), truncated);

    const report = await stripExifFromUploads(dir, { dryRun: true });

    assert.deepEqual(report.processed, []);
    assert.deepEqual(report.failed.map((f) => f.file), ["truncated.jpg"]);
    assert.ok(fs.readFileSync(path.join(dir, "truncated.jpg")).equals(truncated));
  });

  test("a second run finds nothing to do", async () => {
    fs.writeFileSync(path.join(dir, "photo.jpg"), await phoneJpeg());
    await stripExifFromUploads(dir, { dryRun: false });
    const after = fs.readFileSync(path.join(dir, "photo.jpg"));

    const report = await stripExifFromUploads(dir, { dryRun: false });

    assert.deepEqual(report.processed, []);
    assert.equal(report.skipped, 1);
    assert.ok(fs.readFileSync(path.join(dir, "photo.jpg")).equals(after));
  });

  test("throws when the uploads directory does not exist", async () => {
    await assert.rejects(stripExifFromUploads(path.join(dir, "missing"), { dryRun: true }));
  });
});

describe("parseStripExifArgs", () => {
  test("no flags = real run, --dry-run = dry run", () => {
    assert.deepEqual(parseStripExifArgs([]), { dryRun: false });
    assert.deepEqual(parseStripExifArgs(["--dry-run"]), { dryRun: true });
  });

  test("rejects unknown flags so a typo never turns into a real run", () => {
    assert.throws(() => parseStripExifArgs(["--dryrun"]), /--dryrun/);
  });
});

describe("formatStripExifReport", () => {
  test("summarises counts and lists failures", () => {
    const text = formatStripExifReport({
      dryRun: true,
      processed: ["a.jpg"],
      skipped: 2,
      failed: [{ file: "b.jpg", error: "boom" }],
    });
    assert.match(text, /DRY RUN/);
    assert.match(text, /Ke zpracování: 1/);
    assert.match(text, /Přeskočeno.*: 2/);
    assert.match(text, /Selhalo: 1/);
    assert.match(text, /b\.jpg: boom/);
  });
});
