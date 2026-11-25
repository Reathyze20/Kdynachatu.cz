import "./env"; // musí zůstat první import
/**
 * Bezpečnost uploadů (#480): galerie a tapety (deník fotky jen odkazuje z galerie, avatar se nenahrává).
 * Fixtures se generují v testu, žádné reálné fotky. Payload nese marker, aby šel únik původního
 * obsahu (skript, HTML, EXIF) najít v čemkoli, co server uložil na disk.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import sharp from "sharp";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { UPLOADS_PATH } from "../../config/config";
import { MAX_INPUT_PIXELS } from "../../backend/routes/imageUpload";
import { as, setupIntegrationFile, teardownIntegrationFile, type TestWorld } from "./harness";

let app: Express;
let world: TestWorld;
let folderId: string;

const MARKER = "XSS480";
const SCRIPT = `<script>alert("${MARKER}")</script>`;
const HTML = `<html><body>${SCRIPT}</body></html>`;
/** Výchozí strop sharp (0x3FFF²): pixel bomb musí být pod ním, jinak by test neověřil náš vlastní limit. */
const SHARP_DEFAULT_PIXEL_LIMIT = 0x3fff * 0x3fff;

const solid = (format: "jpeg" | "png") =>
  sharp({ create: { width: 16, height: 12, channels: 3, background: { r: 40, g: 90, b: 60 } } })[format]().toBuffer();

/** JPEG s EXIF (výrobce s markerem) a GPS polohou, jako fotka z telefonu. */
const jpegWithExifAndGps = () =>
  sharp({ create: { width: 16, height: 12, channels: 3, background: "#285a3c" } })
    .jpeg()
    .withExif({
      IFD0: { Make: `${MARKER}-Phone` },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "50/1 5/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "14/1 25/1 0/1" },
    })
    .toBuffer();

const svgWithScript = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12">${SCRIPT}</svg>`);

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  const frame = Buffer.alloc(8);
  frame.writeUInt32BE(data.length, 0);
  frame.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 4);
  return Buffer.concat([frame.subarray(0, 4), body, frame.subarray(4)]);
}

/** Platný 1bitový PNG 12 000 × 12 000 = 144 MP v ~18 kB: nad naším stropem, pod výchozím stropem sharp. */
function pixelBombPng(size = 12_000): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 1; // bit depth 1, color type 0 (grayscale)
  const scanlines = Buffer.alloc((1 + Math.ceil(size / 8)) * size);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

interface UploadTarget {
  name: string;
  upload: (file: Buffer, filename: string, contentType: string) => Promise<{ status: number; body: any }>;
  /** Absolutní cesty souborů, které server k úspěšnému uploadu uložil (originál i náhledy). */
  storedFiles: (body: any) => string[];
  count: () => Promise<number>;
}

const diskPath = (url: string) => path.join(UPLOADS_PATH, url.replace(/^\/uploads\//, ""));

const gallery: UploadTarget = {
  name: "gallery POST /api/gallery/photos",
  upload: (file, filename, contentType) =>
    as(app, world.memberA).post("/api/gallery/photos").field("folderId", folderId).attach("photos", file, { filename, contentType }),
  storedFiles: (body) => body.flatMap((photo: { src: string; thumb: string }) => [diskPath(photo.src), diskPath(photo.thumb)]),
  count: () => prisma.galleryPhoto.count(),
};

const wallpaper: UploadTarget = {
  name: "wallpaper POST /api/wallpapers",
  upload: (file, filename, contentType) =>
    as(app, world.memberA).post("/api/wallpapers").attach("image", file, { filename, contentType }),
  storedFiles: (body) => [diskPath(body.url)],
  count: () => prisma.wallpaper.count(),
};

/** Vše v uploadech (soubory i adresáře, rekurzivně) – snímek pro „odmítnutí nic nezapsalo“. */
const listUploads = () => fs.readdirSync(UPLOADS_PATH, { recursive: true }).map(String).sort();

/** Uložený soubor je nově zakódovaný WebP bez metadat a bez čehokoli z původního obsahu. */
async function assertSanitized(file: string): Promise<void> {
  const bytes = fs.readFileSync(file);
  const meta = await sharp(bytes).metadata();
  assert.equal(meta.format, "webp", `${file} is not re-encoded to webp`);
  assert.deepEqual([meta.exif, meta.xmp, meta.iptc], [undefined, undefined, undefined], `${file} keeps metadata`);
  for (const needle of [MARKER, "<script", "<html", "<svg", "Exif", "EXIF"]) {
    assert.equal(bytes.includes(needle), false, `${file} contains ${needle}`);
  }
}

/** Upload projde (201) a všechno, co server uložil, je sanitizované. */
async function assertStoredSanitized(target: UploadTarget, file: Buffer, filename: string, contentType: string): Promise<void> {
  const res = await target.upload(file, filename, contentType);
  assert.equal(res.status, 201);
  for (const stored of target.storedFiles(res.body)) await assertSanitized(stored);
}

/** Odmítnutý upload vrátí 4xx s hláškou a nenechá nic na disku ani v DB. */
async function assertRejected(send: () => Promise<{ status: number; body: any }>, count: () => Promise<number>): Promise<void> {
  const filesBefore = listUploads();
  const countBefore = await count();
  const res = await send();
  assert.ok(res.status >= 400 && res.status < 500, `expected 4xx, got ${res.status}`);
  assert.equal(typeof res.body.message, "string");
  assert.deepEqual(listUploads(), filesBefore, "rejected upload left files on disk");
  assert.equal(await count(), countBefore, "rejected upload created a DB row");
}

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  folderId = (await prisma.galleryFolder.create({
    data: { name: "Upload security", createdById: world.memberA.id, cabinId: world.cabinA.id },
  })).id;
});

after(teardownIntegrationFile);

for (const target of [gallery, wallpaper]) {
  describe(`upload security: ${target.name}`, () => {
    test("JPEG with EXIF and GPS is stored without any metadata", async () => {
      const original = await jpegWithExifAndGps();
      const exif = (await sharp(original).metadata()).exif;
      assert.ok(exif?.includes(`${MARKER}-Phone`), "fixture must carry EXIF");
      assert.ok([Buffer.from([0x88, 0x25]), Buffer.from([0x25, 0x88])].some((tag) => exif!.includes(tag)), "fixture must carry a GPS IFD");
      await assertStoredSanitized(target, original, "IMG_0001.jpg", "image/jpeg");
    });

    const rejected: [string, Buffer, string, string][] = [
      ["SVG with a script", svgWithScript, "kresba.svg", "image/svg+xml"],
      ["SVG disguised as PNG (fake extension and MIME)", svgWithScript, "fotka.png", "image/png"],
      ["HTML disguised as JPEG (fake extension and MIME)", Buffer.from(HTML), "fotka.jpg", "image/jpeg"],
      ["HTML declared as text/html", Buffer.from(HTML), "stranka.html", "text/html"],
      ["JPEG magic bytes followed by HTML", Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(HTML)]), "fotka.jpg", "image/jpeg"],
    ];
    for (const [name, file, filename, contentType] of rejected) {
      test(`${name} is rejected with 4xx and nothing is stored`, async () => {
        await assertRejected(() => target.upload(file, filename, contentType), target.count);
      });
    }

    test("polyglot JPEG with HTML and JS appended is re-encoded without the payload", async () => {
      await assertStoredSanitized(target, Buffer.concat([await solid("jpeg"), Buffer.from(HTML)]), "fotka.jpg", "image/jpeg");
    });

    test("polyglot PNG with a script appended is re-encoded without the payload", async () => {
      await assertStoredSanitized(target, Buffer.concat([await solid("png"), Buffer.from(SCRIPT)]), "fotka.png", "image/png");
    });

    test("pixel bomb is rejected with 4xx by limitInputPixels and the server keeps working", async () => {
      const bomb = pixelBombPng();
      const { width, height } = await sharp(bomb, { limitInputPixels: false }).metadata();
      const pixels = width! * height!;
      assert.ok(pixels > MAX_INPUT_PIXELS && pixels < SHARP_DEFAULT_PIXEL_LIMIT, "bomb must sit between our limit and sharp's default");

      await assertRejected(() => target.upload(bomb, "obrovska.png", "image/png"), target.count);
      assert.equal((await target.upload(await solid("png"), "mala.png", "image/png")).status, 201);
    });
  });
}

test("gallery batch with one valid photo and one SVG is rejected as a whole, nothing is stored", async () => {
  await assertRejected(
    async () =>
      as(app, world.memberA)
        .post("/api/gallery/photos")
        .field("folderId", folderId)
        .attach("photos", await solid("jpeg"), { filename: "ok.jpg", contentType: "image/jpeg" })
        .attach("photos", svgWithScript, { filename: "zla.svg", contentType: "image/svg+xml" }),
    gallery.count,
  );
});

describe("upload security: deleting removes files from disk", () => {
  async function upload(target: UploadTarget, photos = 1): Promise<{ body: any; files: string[] }> {
    let req = as(app, world.memberA).post(target === gallery ? "/api/gallery/photos" : "/api/wallpapers");
    if (target === gallery) req = req.field("folderId", folderId);
    for (let i = 0; i < photos; i += 1) req = req.attach(target === gallery ? "photos" : "image", await solid("png"), `${i}.png`);
    const res = await req;
    assert.equal(res.status, 201);
    const files = target.storedFiles(res.body);
    for (const file of files) assert.ok(fs.existsSync(file), `${file} should exist after upload`);
    return { body: res.body, files };
  }

  const assertGone = (files: string[]) => {
    for (const file of files) assert.equal(fs.existsSync(file), false, `${file} still on disk`);
  };

  test("DELETE /api/gallery/photos/:id removes the original and the thumbnail", async () => {
    const { body, files } = await upload(gallery);
    assert.equal((await as(app, world.memberA).delete(`/api/gallery/photos/${body[0].id}`)).status, 200);
    assertGone(files);
  });

  test("DELETE /api/gallery/photos (bulk) removes originals and thumbnails", async () => {
    const { body, files } = await upload(gallery, 2);
    const photoIds = body.map((photo: { id: string }) => photo.id);
    assert.equal((await as(app, world.memberA).delete("/api/gallery/photos").send({ photoIds })).status, 200);
    assertGone(files);
  });

  test("DELETE /api/gallery/folders/:id removes files of every photo in the folder", async () => {
    const { files } = await upload(gallery, 2);
    assert.equal(files.length, 4);
    assert.equal((await as(app, world.memberA).delete(`/api/gallery/folders/${folderId}`)).status, 200);
    assertGone(files);
  });

  test("DELETE /api/wallpapers/:id removes the file", async () => {
    const { body, files } = await upload(wallpaper);
    assert.equal((await as(app, world.memberA).delete(`/api/wallpapers/${body.id}`)).status, 200);
    assertGone(files);
  });
});
