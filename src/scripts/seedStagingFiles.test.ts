import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { cleanSeedFiles, writeSeedImage, SEED_FILE_PREFIX } from "./seedStagingFiles";

describe("seedStagingFiles", () => {
  let uploadsPath: string;
  let thumbsPath: string;

  before(() => {
    uploadsPath = fs.mkdtempSync(path.join(os.tmpdir(), "seed-files-"));
    thumbsPath = path.join(uploadsPath, "thumbs");
    fs.mkdirSync(thumbsPath, { recursive: true });
  });

  after(() => {
    // Best-effort úklid: na Windows drží libvips/sharp adresář ještě chvíli po zápisu (EPERM).
    try {
      fs.rmSync(uploadsPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* temp adresář uklidí OS */
    }
  });

  test("writeSeedImage creates a webp original + thumbnail and returns the public /uploads path", async () => {
    const src = await writeSeedImage(uploadsPath, "cover", { r: 100, g: 150, b: 200 });

    assert.equal(src, `/uploads/${SEED_FILE_PREFIX}cover.webp`);
    const fileName = `${SEED_FILE_PREFIX}cover.webp`;
    assert.ok(fs.existsSync(path.join(uploadsPath, fileName)), "original exists");
    assert.ok(fs.existsSync(path.join(thumbsPath, fileName)), "thumbnail exists");
    assert.equal((await sharp(path.join(uploadsPath, fileName)).metadata()).format, "webp");
  });

  test("writeSeedImage is idempotent — a second call does not duplicate files", async () => {
    await writeSeedImage(uploadsPath, "repeat", { r: 10, g: 20, b: 30 });
    await writeSeedImage(uploadsPath, "repeat", { r: 10, g: 20, b: 30 });

    const seeds = fs.readdirSync(uploadsPath).filter((name) => name === `${SEED_FILE_PREFIX}repeat.webp`);
    assert.equal(seeds.length, 1);
  });

  test("cleanSeedFiles removes only seed-prefixed files, leaving other uploads untouched", async () => {
    fs.writeFileSync(path.join(uploadsPath, "family-photo.webp"), "keep");
    fs.writeFileSync(path.join(thumbsPath, "family-photo.webp"), "keep");
    await writeSeedImage(uploadsPath, "to-delete", { r: 1, g: 2, b: 3 });

    await cleanSeedFiles(uploadsPath);

    assert.ok(!fs.existsSync(path.join(uploadsPath, `${SEED_FILE_PREFIX}to-delete.webp`)), "seed original deleted");
    assert.ok(!fs.existsSync(path.join(thumbsPath, `${SEED_FILE_PREFIX}to-delete.webp`)), "seed thumb deleted");
    assert.ok(fs.existsSync(path.join(uploadsPath, "family-photo.webp")), "non-seed upload kept");
    assert.ok(fs.existsSync(path.join(thumbsPath, "family-photo.webp")), "non-seed thumb kept");
  });

  test("cleanSeedFiles tolerates a missing uploads directory", async () => {
    await cleanSeedFiles(path.join(uploadsPath, "does-not-exist"));
  });
});
