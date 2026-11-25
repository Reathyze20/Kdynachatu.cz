import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { as, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";

let app: Express;
let world: TestWorld;
let folderA: string;
let folderB: string;
let entryA: string;
let entryB: string;
/** Every cabin B fixture name/content starts with this, so any leak shows up in a body search. */
const CABIN_B_PREFIX = "Tajn";

type Call = (user: TestUser) => Promise<{ status: number }>;

async function createFolder(author: TestUser, name: string): Promise<string> {
  const folder = await prisma.diaryFolder.create({
    data: {
      name,
      createdById: author.id,
      cabinId: author.cabinId,
      startDate: new Date("2027-01-10"),
      endDate: new Date("2027-01-12"),
      activityTag: "turistika",
    },
  });
  return folder.id;
}

async function createEntry(author: TestUser, folderId: string, content: string): Promise<string> {
  const entry = await prisma.diaryEntry.create({
    data: { folderId, authorId: author.id, entryDate: new Date("2027-01-11"), content },
  });
  return entry.id;
}

const folderSnapshot = (id: string) => prisma.diaryFolder.findUnique({ where: { id } });
const entrySnapshot = (id: string) => prisma.diaryEntry.findUnique({ where: { id } });

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  folderA = await createFolder(world.memberA, "Deník A");
  folderB = await createFolder(world.memberB, "Tajná složka B");
  entryA = await createEntry(world.memberA, folderA, "Záznam A");
  entryB = await createEntry(world.memberB, folderB, "Tajný záznam B");
});

after(teardownIntegrationFile);

for (const actor of ["memberA", "adminA"] as const) {
  describe(`diary folders: ${actor} on a cabin B folder gets 404 and the folder is unchanged`, () => {
    const cases: [string, Call][] = [
      ["PATCH /diary/folders/:id (rename)", (u) => as(app, u).patch(`/api/diary/folders/${folderB}`).send({ name: "Přepsáno" })],
      ["DELETE /diary/folders/:id", (u) => as(app, u).delete(`/api/diary/folders/${folderB}`)],
    ];

    for (const [name, call] of cases) {
      test(name, async () => {
        const before = await folderSnapshot(folderB);
        const res = await call(world[actor]);
        assert.equal(res.status, 404);
        assert.deepEqual(await folderSnapshot(folderB), before);
      });
    }
  });

  describe(`diary entries: ${actor} on a cabin B entry gets 404 and the entry is unchanged`, () => {
    const cases: [string, Call][] = [
      ["PUT /diary/entries/:id", (u) => as(app, u).put(`/api/diary/entries/${entryB}`).send({ content: "Přepsáno" })],
      ["DELETE /diary/entries/:id", (u) => as(app, u).delete(`/api/diary/entries/${entryB}`)],
    ];

    for (const [name, call] of cases) {
      test(name, async () => {
        const before = await entrySnapshot(entryB);
        const res = await call(world[actor]);
        assert.equal(res.status, 404);
        assert.deepEqual(await entrySnapshot(entryB), before);
      });
    }
  });
}

describe("diary entries: creating in a cabin B folder from cabin A is rejected", () => {
  test("POST /diary/entries with a cabin B folderId → 404, nothing created", async () => {
    const countBefore = await prisma.diaryEntry.count();
    const res = await as(app, world.memberA)
      .post("/api/diary/entries")
      .send({ folderId: folderB, date: "2027-01-11", content: "Podstrčený záznam" });
    assert.equal(res.status, 404);
    assert.equal(await prisma.diaryEntry.count(), countBefore);
  });
});

describe("diary entries: gallery photos from cabin B are rejected (#483)", () => {
  async function galleryPhoto(owner: TestUser, name: string): Promise<string> {
    const folder = await prisma.galleryFolder.create({ data: { name, createdById: owner.id, cabinId: owner.cabinId } });
    const photo = await prisma.galleryPhoto.create({ data: { folderId: folder.id, src: `/uploads/${folder.id}.webp`, uploadedById: owner.id } });
    return photo.id;
  }
  const entryPhotos = (entryId: string) => prisma.diaryEntryPhoto.findMany({ where: { entryId }, orderBy: { photoId: "asc" } });
  let photoA: string;
  let photoB: string;

  before(async () => {
    photoA = await galleryPhoto(world.memberA, "Galerie A");
    photoB = await galleryPhoto(world.memberB, "Tajná galerie B");
  });

  test("POST /diary/entries with a cabin B galleryPhotoId → 404, nothing created", async () => {
    const [entries, links] = [await prisma.diaryEntry.count(), await prisma.diaryEntryPhoto.count()];
    const res = await as(app, world.memberA)
      .post("/api/diary/entries")
      .send({ folderId: folderA, date: "2027-01-11", content: "S cizí fotkou", galleryPhotoIds: [photoA, photoB] });
    assert.equal(res.status, 404);
    assert.deepEqual([await prisma.diaryEntry.count(), await prisma.diaryEntryPhoto.count()], [entries, links]);
  });

  test("PUT /diary/entries/:id with a cabin B galleryPhotoId → 404, entry unchanged", async () => {
    await prisma.diaryEntryPhoto.create({ data: { entryId: entryA, photoId: photoA } });
    try {
      const [entryBefore, photosBefore] = [await entrySnapshot(entryA), await entryPhotos(entryA)];
      const res = await as(app, world.memberA)
        .put(`/api/diary/entries/${entryA}`)
        .send({ content: "Přepsáno s cizí fotkou", galleryPhotoIds: [photoB] });
      assert.equal(res.status, 404);
      assert.deepEqual([await entrySnapshot(entryA), await entryPhotos(entryA)], [entryBefore, photosBefore]);
    } finally {
      await prisma.diaryEntryPhoto.deleteMany({ where: { entryId: entryA } });
    }
  });

  test("own cabin photos still attach on create and update (positive control)", async () => {
    const created = await as(app, world.memberA)
      .post("/api/diary/entries")
      .send({ folderId: folderA, date: "2027-01-11", content: "S vlastní fotkou", galleryPhotoIds: [photoA] });
    try {
      assert.equal(created.status, 201);
      assert.deepEqual(created.body.galleryPhotoIds, [photoA]);
      const updated = await as(app, world.memberA).put(`/api/diary/entries/${created.body.id}`).send({ content: "Bez fotky", galleryPhotoIds: [] });
      assert.equal(updated.status, 200);
      assert.deepEqual(updated.body.galleryPhotoIds, []);
    } finally {
      await prisma.diaryEntry.deleteMany({ where: { id: created.body.id } });
    }
  });
});

describe("diary: lists for cabin A contain nothing from cabin B", () => {
  const leaks = () => [
    folderB, entryB, world.memberB.id, world.adminB.id,
    world.memberB.username, world.adminB.username, CABIN_B_PREFIX,
  ];

  // Paths are built lazily (folderB is only known after `before`); a function keeps them off the module-load path.
  for (const [label, buildPath] of [
    ["GET /api/diary/folders", () => "/api/diary/folders"],
    ["GET /api/diary/entries", () => "/api/diary/entries"],
    ["GET /api/diary/entries?folderId=<B folder>", () => `/api/diary/entries?folderId=${folderB}`],
  ] as const) {
    test(label, async () => {
      const res = await as(app, world.memberA).get(buildPath());
      // A foreign folderId must 404 rather than leak entries; the plain lists return 200.
      assert.ok(res.status === 200 || res.status === 404, `unexpected status ${res.status}`);
      const body = JSON.stringify(res.body);
      for (const leak of leaks()) assert.equal(body.includes(leak), false, `leaked ${leak}`);
    });
  }

  test("GET /api/diary/entries?folderId=<B folder> is rejected with 404", async () => {
    const res = await as(app, world.memberA).get(`/api/diary/entries?folderId=${folderB}`);
    assert.equal(res.status, 404);
  });

  test("GET /api/diary/folders returns cabin A's own folder", async () => {
    const res = await as(app, world.memberA).get("/api/diary/folders");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.map((f: { id: string }) => f.id), [folderA]);
  });

  test("GET /api/diary/entries returns only cabin A's own entry", async () => {
    const res = await as(app, world.memberA).get("/api/diary/entries");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.map((e: { id: string }) => e.id), [entryA]);
  });
});

describe("diary: same-cabin flows still work (positive control)", () => {
  test("member A creates, renames and deletes a folder in cabin A (2xx)", async () => {
    const create = await as(app, world.memberA)
      .post("/api/diary/folders")
      .send({ name: "Nová složka A", startDate: "2027-02-01", endDate: "2027-02-03" });
    assert.equal(create.status, 201);
    const id: string = create.body.id;

    const rename = await as(app, world.memberA).patch(`/api/diary/folders/${id}`).send({ name: "Přejmenovaná složka A" });
    assert.equal(rename.status, 200);
    assert.equal((await folderSnapshot(id))?.name, "Přejmenovaná složka A");

    const remove = await as(app, world.memberA).delete(`/api/diary/folders/${id}`);
    assert.equal(remove.status, 200);
    assert.equal(await folderSnapshot(id), null);
  });

  test("member A creates, updates and deletes an entry in a cabin A folder (2xx)", async () => {
    const create = await as(app, world.memberA)
      .post("/api/diary/entries")
      .send({ folderId: folderA, date: "2027-01-13", content: "Nový záznam A" });
    assert.equal(create.status, 201);
    const id: string = create.body.id;

    const update = await as(app, world.memberA).put(`/api/diary/entries/${id}`).send({ content: "Upravený záznam A" });
    assert.equal(update.status, 200);
    assert.equal((await entrySnapshot(id))?.content, "Upravený záznam A");

    const remove = await as(app, world.memberA).delete(`/api/diary/entries/${id}`);
    assert.equal(remove.status, 200);
    assert.equal(await entrySnapshot(id), null);
  });
});
