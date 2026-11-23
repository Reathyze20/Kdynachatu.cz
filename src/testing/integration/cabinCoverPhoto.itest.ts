import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { UPLOADS_PATH } from "../../config/config";
import { coverPhotoFileNames } from "../../backend/routes/cabinCoverPhoto";
import { as, recordRealtimeEmits, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";

let app: Express;
let world: TestWorld;
let photoA: string;
let photoB: string;

const coversDir = path.join(UPLOADS_PATH, "covers");

/** Fotka v Galerii se skutečným souborem v (dočasných) uploadech, jako po nahrání. */
async function createGalleryPhoto(uploader: TestUser): Promise<string> {
  const fileName = `${randomUUID()}.webp`;
  fs.mkdirSync(UPLOADS_PATH, { recursive: true });
  await sharp({ create: { width: 1600, height: 1000, channels: 3, background: { r: 120, g: 90, b: 60 } } })
    .webp()
    .toFile(path.join(UPLOADS_PATH, fileName));
  const folder = await prisma.galleryFolder.create({
    data: { name: `Album ${randomUUID()}`, createdById: uploader.id, cabinId: uploader.cabinId },
  });
  const photo = await prisma.galleryPhoto.create({
    data: { folderId: folder.id, src: `/uploads/${fileName}`, uploadedById: uploader.id, description: "" },
  });
  return photo.id;
}

const coverOf = async (cabinId: string) =>
  (await prisma.cabin.findUniqueOrThrow({ where: { id: cabinId }, select: { coverPhotoUrl: true } })).coverPhotoUrl;

function coverFiles(url: string | null) {
  const names = coverPhotoFileNames(url);
  assert.ok(names, `coverPhotoUrl není titulní fotka: ${url}`);
  return [path.join(coversDir, names.wide), path.join(coversDir, names.narrow)];
}

const setCover = (user: TestUser, photoId: string) => as(app, user).put("/api/cabin/cover-photo").send({ photoId });

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  photoA = await createGalleryPhoto(world.memberA);
  photoB = await createGalleryPhoto(world.memberB);
});

after(teardownIntegrationFile);

describe("PUT /api/cabin/cover-photo – titulní fotka z Galerie (#321)", () => {
  test("člen, který není správce, dostane 403 a titulní fotka se nezmění", async () => {
    const res = await setCover(world.memberA, photoA);
    assert.equal(res.status, 403);
    assert.equal(await coverOf(world.cabinA.id), null);
  });

  test("fotka z Galerie jiné chaty → 404, žádná chata nic nedostane", async () => {
    const res = await setCover(world.adminA, photoB);
    assert.equal(res.status, 404);
    assert.equal(await coverOf(world.cabinA.id), null);
    assert.equal(await coverOf(world.cabinB.id), null);
  });

  test("neexistující fotka → 404, neplatné ID → 400", async () => {
    assert.equal((await setCover(world.adminA, randomUUID())).status, 404);
    assert.equal((await setCover(world.adminA, "neni-uuid")).status, 400);
  });

  test("správce nastaví fotku: dvě WebP varianty, cesta v nastavení chaty, realtime jen chatě A", async () => {
    const recorder = recordRealtimeEmits();
    let res;
    try {
      res = await setCover(world.adminA, photoA);
    } finally {
      recorder.restore();
    }
    assert.equal(res.status, 200);
    const url = await coverOf(world.cabinA.id);
    assert.equal(res.body.coverPhotoUrl, url);
    for (const file of coverFiles(url)) assert.equal((await sharp(fs.readFileSync(file)).metadata()).format, "webp");
    assert.deepEqual(recorder.emits.map((e) => [e.room, e.event]), [[`cabin:${world.cabinA.id}`, "cabin:changed"]]);

    const settings = await as(app, world.memberA).get("/api/cabin");
    assert.equal(settings.body.coverPhotoUrl, url);
  });

  test("výměna smaže soubory předchozí titulní fotky", async () => {
    const previous = await coverOf(world.cabinA.id);
    const res = await setCover(world.adminA, await createGalleryPhoto(world.adminA));
    assert.equal(res.status, 200);
    assert.notEqual(res.body.coverPhotoUrl, previous);
    for (const file of coverFiles(previous)) assert.equal(fs.existsSync(file), false, `zůstal ${file}`);
    for (const file of coverFiles(res.body.coverPhotoUrl)) assert.ok(fs.existsSync(file));
  });

  test("smazání zdrojové fotky v Galerii titulní fotku nezruší", async () => {
    const source = await createGalleryPhoto(world.adminA);
    const url = (await setCover(world.adminA, source)).body.coverPhotoUrl;

    const del = await as(app, world.adminA).delete(`/api/gallery/photos/${source}`);
    assert.equal(del.status, 200);
    assert.equal(await coverOf(world.cabinA.id), url);
    for (const file of coverFiles(url)) assert.ok(fs.existsSync(file));
  });
});

describe("PATCH /api/cabin – coverPhotoUrl jako volný text se ignoruje (#321)", () => {
  test("hodnota z těla requestu titulní fotku nezmění", async () => {
    const before = await coverOf(world.cabinA.id);
    const res = await as(app, world.adminA).patch("/api/cabin").send({ coverPhotoUrl: "https://example.test/cizi.jpg", isWinterized: true });
    assert.equal(res.status, 200);
    assert.equal(await coverOf(world.cabinA.id), before);
    assert.equal(res.body.isWinterized, true);
  });
});

describe("DELETE /api/cabin/cover-photo (#321)", () => {
  test("člen, který není správce, dostane 403 a fotka zůstane", async () => {
    const before = await coverOf(world.cabinA.id);
    const res = await as(app, world.memberA).delete("/api/cabin/cover-photo");
    assert.equal(res.status, 403);
    assert.equal(await coverOf(world.cabinA.id), before);
  });

  test("správce chaty B nesáhne na titulní fotku chaty A", async () => {
    const before = await coverOf(world.cabinA.id);
    const res = await as(app, world.adminB).delete("/api/cabin/cover-photo");
    assert.equal(res.status, 200);
    assert.equal(await coverOf(world.cabinA.id), before);
    for (const file of coverFiles(before)) assert.ok(fs.existsSync(file));
  });

  test("správce odebere titulní fotku: coverPhotoUrl je null a soubory jsou pryč", async () => {
    const before = await coverOf(world.cabinA.id);
    const recorder = recordRealtimeEmits();
    let res;
    try {
      res = await as(app, world.adminA).delete("/api/cabin/cover-photo");
    } finally {
      recorder.restore();
    }
    assert.equal(res.status, 200);
    assert.equal(res.body.coverPhotoUrl, null);
    assert.equal(await coverOf(world.cabinA.id), null);
    for (const file of coverFiles(before)) assert.equal(fs.existsSync(file), false);
    assert.deepEqual(recorder.emits.map((e) => [e.room, e.event]), [[`cabin:${world.cabinA.id}`, "cabin:changed"]]);
  });
});
