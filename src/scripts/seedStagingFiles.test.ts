import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { COVER_PHOTO_SIZES, encodeWithinBudget } from "../backend/routes/cabinCoverPhoto";
import { cleanSeedFiles, writeSeedCoverPhoto, writeSeedImage, SEED_COVER_SOURCE, SEED_COVER_URL, SEED_FILE_PREFIX } from "./seedStagingFiles";

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

  // Titulní fotka má vlastní adresář: jméno `seed-cover` používá i test writeSeedImage výše
  // a sharp na Windows drží přečtený soubor otevřený. Soubory se proto čtou přes buffer.
  describe("writeSeedCoverPhoto", () => {
    let coverUploads: string;
    let coverThumbs: string;

    before(() => {
      coverUploads = fs.mkdtempSync(path.join(os.tmpdir(), "seed-cover-"));
      coverThumbs = path.join(coverUploads, "thumbs");
    });

    after(() => {
      try {
        fs.rmSync(coverUploads, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        /* temp adresář uklidí OS */
      }
    });

    test("makes the Koštálov photo the cover: wide + mobile -sm variant big enough for the app background", async () => {
      const src = await writeSeedCoverPhoto(coverUploads);
      const source = fs.readFileSync(SEED_COVER_SOURCE);

      assert.equal(src, SEED_COVER_URL);
      assert.equal(src, `/uploads/${SEED_FILE_PREFIX}cover.webp`, "coverPhotoUrl se nemění");
      const variants = [
        { file: `${SEED_FILE_PREFIX}cover.webp`, size: COVER_PHOTO_SIZES.wide },
        { file: `${SEED_FILE_PREFIX}cover-sm.webp`, size: COVER_PHOTO_SIZES.narrow },
      ];
      for (const { file, size } of variants) {
        const bytes = fs.readFileSync(path.join(coverUploads, file));
        const meta = await sharp(bytes).metadata();
        assert.equal(meta.format, "webp", file);
        assert.deepEqual([meta.width, meta.height], [size.width, size.height], file);
        // AppBackdrop (frontend) ukáže fotku jen při delší straně ≥ 1500 px.
        assert.ok(Math.max(meta.width ?? 0, meta.height ?? 0) >= 1500, `${file}: delší strana ≥ 1500 px`);
        // Stejné kódování jako upload titulní fotky v appce (rozpočet je měkký strop, viz cabinCoverPhoto.ts).
        assert.ok(bytes.equals(await encodeWithinBudget(source, size)), `${file}: kódování z cabinCoverPhoto.ts`);
        assert.ok(fs.existsSync(path.join(coverThumbs, file)), `${file}: náhled`);
      }
      // Skutečná fotka, ne jednobarevný zástupný obrázek.
      const { channels } = await sharp(fs.readFileSync(path.join(coverUploads, variants[0].file))).stats();
      assert.ok(channels[0].stdev > 10, `fotka má detaily (stdev ${channels[0].stdev})`);
    });

    test("cleanSeedFiles removes both cover variants", async () => {
      await writeSeedCoverPhoto(coverUploads);

      await cleanSeedFiles(coverUploads);

      for (const file of [`${SEED_FILE_PREFIX}cover.webp`, `${SEED_FILE_PREFIX}cover-sm.webp`]) {
        assert.ok(!fs.existsSync(path.join(coverUploads, file)), `${file} deleted`);
        assert.ok(!fs.existsSync(path.join(coverThumbs, file)), `${file} thumb deleted`);
      }
    });
  });

  test("cleanSeedFiles tolerates a missing uploads directory", async () => {
    await cleanSeedFiles(path.join(uploadsPath, "does-not-exist"));
  });
});
