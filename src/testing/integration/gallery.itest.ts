import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { as, recordRealtimeEmits, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";

let app: Express;
let world: TestWorld;
let folderA: string;
let photoA: string;
let folderB: string;
let photoB: string;
let photoBSrc: string;
/** Every cabin B fixture name/description starts with this, so any leak shows up in a body search. */
const CABIN_B_PREFIX = "Tajn";

type Call = (user: TestUser) => Promise<{ status: number }>;

async function createFolder(author: TestUser, name: string): Promise<string> {
  const folder = await prisma.galleryFolder.create({
    data: { name, createdById: author.id, cabinId: author.cabinId },
  });
  return folder.id;
}

async function createPhoto(uploader: TestUser, folderId: string, description: string): Promise<{ id: string; src: string }> {
  const src = `/uploads/${randomUUID()}.webp`;
  const photo = await prisma.galleryPhoto.create({
    data: { folderId, src, uploadedById: uploader.id, description },
  });
  return { id: photo.id, src };
}

const folderSnapshot = (id: string) => prisma.galleryFolder.findUnique({ where: { id } });
const photoSnapshot = (id: string) => prisma.galleryPhoto.findUnique({ where: { id } });

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  // Cabin A: folder created by the admin, photo uploaded by the admin — so member A is
  // neither author nor uploader and can exercise the in-cabin 403 permission checks.
  folderA = await createFolder(world.adminA, "Fotky A");
  photoA = (await createPhoto(world.adminA, folderA, "Popis A")).id;
  folderB = await createFolder(world.memberB, "Tajná složka B");
  const bPhoto = await createPhoto(world.memberB, folderB, "Tajný popis B");
  photoB = bPhoto.id;
  photoBSrc = bPhoto.src;
});

after(teardownIntegrationFile);

for (const actor of ["memberA", "adminA"] as const) {
  describe(`gallery folders: ${actor} on a cabin B folder gets 404 and the folder is unchanged`, () => {
    const cases: [string, Call][] = [
      ["PATCH /gallery/folders/:id (rename)", (u) => as(app, u).patch(`/api/gallery/folders/${folderB}`).send({ name: "Přejmenováno" })],
      ["DELETE /gallery/folders/:id", (u) => as(app, u).delete(`/api/gallery/folders/${folderB}`)],
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

  describe(`gallery photos: ${actor} on a cabin B photo gets 404 and the photo is unchanged`, () => {
    const cases: [string, Call][] = [
      ["PATCH /gallery/photos/:id (description)", (u) => as(app, u).patch(`/api/gallery/photos/${photoB}`).send({ description: "Podstrčený popis" })],
      ["DELETE /gallery/photos/:id", (u) => as(app, u).delete(`/api/gallery/photos/${photoB}`)],
    ];

    for (const [name, call] of cases) {
      test(name, async () => {
        const before = await photoSnapshot(photoB);
        const res = await call(world[actor]);
        assert.equal(res.status, 404);
        assert.deepEqual(await photoSnapshot(photoB), before);
      });
    }
  });
}

describe("gallery: bulk deleting cabin B photos leaves them untouched and reveals nothing", () => {
  for (const actor of ["memberA", "adminA"] as const) {
    test(`DELETE /gallery/photos (bulk) as ${actor} with a cabin B photo id`, async () => {
      const before = await photoSnapshot(photoB);
      const res = await as(app, world[actor]).delete("/api/gallery/photos").send({ photoIds: [photoB] });
      assert.equal(res.status, 200);
      // Count-only message: nothing deleted, existence of the cabin B photo not revealed.
      assert.equal(res.body.message, "Smazáno 0 fotek.");
      assert.deepEqual(await photoSnapshot(photoB), before);
    });
  }
});

describe("gallery: lists for cabin A contain nothing from cabin B", () => {
  const leaks = () => [
    folderB, photoB, photoBSrc, world.memberB.id, world.adminB.id,
    world.memberB.username, world.adminB.username, CABIN_B_PREFIX,
  ];

  for (const path of ["/api/gallery/folders", "/api/gallery/photos", `/api/gallery/photos?ids=${photoB}`]) {
    test(`GET ${path}`, async () => {
      const res = await as(app, world.memberA).get(path);
      assert.equal(res.status, 200);
      const body = JSON.stringify(res.body);
      for (const leak of leaks()) assert.equal(body.includes(leak), false, `leaked ${leak}`);
    });
  }

  test("GET /api/gallery/photos?folderId=<B folder> → 404", async () => {
    const res = await as(app, world.memberA).get(`/api/gallery/photos?folderId=${folderB}`);
    assert.equal(res.status, 404);
  });

  test("GET /api/gallery/photos?ids=<B photo> returns an empty list for cabin A", async () => {
    const res = await as(app, world.memberA).get(`/api/gallery/photos?ids=${photoB}`);
    assert.deepEqual(res.body, []);
  });

  test("GET /api/gallery/folders returns cabin A's own folder", async () => {
    const res = await as(app, world.memberA).get("/api/gallery/folders");
    assert.deepEqual(res.body.map((f: { id: string }) => f.id), [folderA]);
  });
});

describe("gallery: creating against a cabin B target is rejected", () => {
  test("POST /gallery/photos with a cabin B folderId → 404, no photo created", async () => {
    const before = await prisma.galleryPhoto.count();
    const res = await as(app, world.memberA).post("/api/gallery/photos").send({ folderId: folderB });
    assert.equal(res.status, 404);
    assert.equal(await prisma.galleryPhoto.count(), before);
  });

  // Gallery folders have no parent/target field — a folder is always created in the caller's
  // own cabin (cabinId from the token). The only cross-cabin surface is the name-uniqueness
  // check, which must stay cabin-scoped: reusing cabin B's folder name must not leak (no 409).
  test("POST /gallery/folders with a name identical to a cabin B folder → 201, not 409 (no leak)", async () => {
    const before = await prisma.galleryFolder.count();
    const res = await as(app, world.memberA).post("/api/gallery/folders").send({ name: "Tajná složka B" });
    assert.equal(res.status, 201);
    assert.equal(await prisma.galleryFolder.count(), before + 1);
    // The new folder lives in cabin A, the cabin B folder is untouched.
    const created = await folderSnapshot(res.body.id);
    assert.equal(created?.cabinId, world.cabinA.id);
    assert.equal((await folderSnapshot(folderB))?.cabinId, world.cabinB.id);
  });
});

describe("gallery: same-cabin flows still work (positive control)", () => {
  test("POST /gallery/folders in A → 201 and realtime goes only to cabin A's room", async () => {
    const recorder = recordRealtimeEmits();
    try {
      const res = await as(app, world.memberA).post("/api/gallery/folders").send({ name: `Nová složka ${randomUUID()}` });
      assert.equal(res.status, 201);
      assert.ok(recorder.emits.some((e) => e.event === "gallery:changed"));
      assert.deepEqual([...new Set(recorder.emits.map((e) => e.room))], [`cabin:${world.cabinA.id}`]);
    } finally {
      recorder.restore();
    }
  });

  test("member A can rename and describe cabin A content (no author restriction inside the cabin)", async () => {
    const rename = await as(app, world.memberA).patch(`/api/gallery/folders/${folderA}`).send({ name: "Fotky A přejmenováno" });
    assert.equal(rename.status, 200);
    assert.equal((await folderSnapshot(folderA))?.name, "Fotky A přejmenováno");
    const describe = await as(app, world.memberA).patch(`/api/gallery/photos/${photoA}`).send({ description: "Nový popis A" });
    assert.equal(describe.status, 200);
    assert.equal((await photoSnapshot(photoA))?.description, "Nový popis A");
  });

  test("member A cannot delete an admin A folder with photos nor an admin A photo (403 stays inside the cabin)", async () => {
    const folderDelete = await as(app, world.memberA).delete(`/api/gallery/folders/${folderA}`);
    assert.equal(folderDelete.status, 403);
    assert.notEqual(await folderSnapshot(folderA), null);
    const photoDelete = await as(app, world.memberA).delete(`/api/gallery/photos/${photoA}`);
    assert.equal(photoDelete.status, 403);
    assert.notEqual(await photoSnapshot(photoA), null);
  });

  test("admin A can delete their own cabin A photo", async () => {
    const { id } = await createPhoto(world.adminA, folderA, "Ke smazání A");
    const res = await as(app, world.adminA).delete(`/api/gallery/photos/${id}`);
    assert.equal(res.status, 200);
    assert.equal(await photoSnapshot(id), null);
  });
});

// #113 (confirmed live, out of scope here): the raw file served by `app.use("/uploads",
// express.static(...))` has NO auth/cabin check, so a cabin B upload is downloadable by direct
// URL without a token. The intended secure contract is documented below but skipped — do NOT
// assert that reaching a foreign file is correct. Lifting this needs a product decision in #113.
describe("gallery uploads: raw file access across cabins (#113)", () => {
  test(
    "a cabin A user cannot download a cabin B raw upload by direct URL",
    { skip: "#113: /uploads is served by express.static without auth; product decision pending" },
    async () => {
      const res = await as(app, world.memberA).get(photoBSrc);
      assert.notEqual(res.status, 200);
    },
  );
});
