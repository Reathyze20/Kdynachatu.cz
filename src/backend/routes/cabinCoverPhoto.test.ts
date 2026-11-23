import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  COVER_PHOTO_SIZES,
  coverPhotoFileNames,
  createCoverPhotoVariants,
  removeCoverPhotoFiles,
} from "./cabinCoverPhoto";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("coverPhotoFileNames: jen vlastní titulní fotky, nikdy cesta zvenku", () => {
  test("široká varianta v URL, úzká má stejné jméno s příponou -sm", () => {
    assert.deepEqual(coverPhotoFileNames(`/uploads/covers/${ID}.webp`), { wide: `${ID}.webp`, narrow: `${ID}-sm.webp` });
  });

  for (const url of [
    null,
    "",
    "/uploads/seed-chata.webp", // staging seed plní sloupec přímo
    `/uploads/covers/../${ID}.webp`,
    `/uploads/covers/${ID}-sm.webp`,
    `https://example.test/uploads/covers/${ID}.webp`,
    "/uploads/covers/../../etc/passwd",
  ]) {
    test(`nepozná ${JSON.stringify(url)}`, () => {
      assert.equal(coverPhotoFileNames(url), null);
    });
  }
});

describe("createCoverPhotoVariants a removeCoverPhotoFiles", () => {
  let dir: string;
  let source: string;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cover-photo-unit-"));
    source = path.join(dir, "zdroj.webp");
    await sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 90, g: 120, b: 80 } } })
      .webp()
      .toFile(source);
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("vyrobí úzkou a širokou WebP variantu v poměru pruhu pod novým jménem", async () => {
    const coversDir = path.join(dir, "covers");
    const url = await createCoverPhotoVariants(source, coversDir);
    const names = coverPhotoFileNames(url);
    assert.ok(names, `neznámá URL ${url}`);

    const wide = await sharp(fs.readFileSync(path.join(coversDir, names.wide))).metadata();
    const narrow = await sharp(fs.readFileSync(path.join(coversDir, names.narrow))).metadata();
    assert.equal(wide.format, "webp");
    assert.equal(narrow.format, "webp");
    assert.deepEqual([wide.width, wide.height], [COVER_PHOTO_SIZES.wide.width, COVER_PHOTO_SIZES.wide.height]);
    assert.deepEqual([narrow.width, narrow.height], [COVER_PHOTO_SIZES.narrow.width, COVER_PHOTO_SIZES.narrow.height]);

    assert.notEqual(await createCoverPhotoVariants(source, coversDir), url, "každé nastavení má nové jméno");
  });

  test("odebrání smaže obě varianty, cizí URL nesmaže nic", async () => {
    const coversDir = path.join(dir, "covers-remove");
    const url = await createCoverPhotoVariants(source, coversDir);
    const names = coverPhotoFileNames(url)!;

    await removeCoverPhotoFiles("/uploads/zdroj.webp", dir);
    assert.ok(fs.existsSync(source));

    await removeCoverPhotoFiles(url, coversDir);
    assert.equal(fs.existsSync(path.join(coversDir, names.wide)), false);
    assert.equal(fs.existsSync(path.join(coversDir, names.narrow)), false);
    await removeCoverPhotoFiles(url, coversDir); // podruhé (soubory už nejsou) bez chyby
  });

  test("když zdroj nejde přečíst, nezůstane po něm napůl hotová varianta", async () => {
    const coversDir = path.join(dir, "covers-broken");
    await assert.rejects(createCoverPhotoVariants(path.join(dir, "neexistuje.webp"), coversDir));
    assert.deepEqual(fs.readdirSync(coversDir), []);
  });
});
