import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { as, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";

let app: Express;
let world: TestWorld;
let wallpaperA: string;
let wallpaperB: string;
let wallpaperBUrl: string;
let guestA: TestUser;

type Call = (user: TestUser) => Promise<{ status: number }>;

/** Malý platný PNG, aby ho multer přijal a sharp zvládl převést na webp (POST pozitivní kontrola). */
async function pngBuffer(): Promise<Buffer> {
  return sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 12, g: 34, b: 56 } } })
    .png()
    .toBuffer();
}

async function createWallpaper(owner: TestUser, url: string): Promise<string> {
  const wallpaper = await prisma.wallpaper.create({ data: { url, cabinId: owner.cabinId } });
  return wallpaper.id;
}

const wallpaperSnapshot = (id: string) => prisma.wallpaper.findUnique({ where: { id } });

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  wallpaperA = await createWallpaper(world.memberA, `/uploads/wallpapers/${randomUUID()}.webp`);
  // Cabin B fixture URL nese nápadný marker, aby jakýkoli únik do odpovědi chaty A šel najít v těle.
  wallpaperBUrl = `/uploads/wallpapers/tajna-tapeta-B-${randomUUID()}.webp`;
  wallpaperB = await createWallpaper(world.memberB, wallpaperBUrl);
  const guest = await prisma.user.create({
    data: { username: "host-a", passwordHash: "x", color: "#123456", role: "guest", cabinId: world.cabinA.id },
  });
  guestA = { id: guest.id, username: guest.username, role: "guest", cabinId: world.cabinA.id };
});

after(teardownIntegrationFile);

for (const actor of ["memberA", "adminA"] as const) {
  describe(`wallpapers: ${actor} on a cabin B wallpaper gets 404 and the wallpaper is unchanged`, () => {
    const cases: [string, Call][] = [
      ["DELETE /wallpapers/:id", (u) => as(app, u).delete(`/api/wallpapers/${wallpaperB}`)],
    ];

    for (const [name, call] of cases) {
      test(name, async () => {
        const before = await wallpaperSnapshot(wallpaperB);
        const res = await call(world[actor]);
        assert.equal(res.status, 404);
        assert.deepEqual(await wallpaperSnapshot(wallpaperB), before);
      });
    }
  });
}

describe("wallpapers: lists for cabin A contain nothing from cabin B", () => {
  const leaks = () => [
    wallpaperB, wallpaperBUrl, world.memberB.id, world.adminB.id,
    world.memberB.username, world.adminB.username, "tajna-tapeta-B",
  ];

  test("GET /api/wallpapers", async () => {
    const res = await as(app, world.memberA).get("/api/wallpapers");
    assert.equal(res.status, 200);
    const body = JSON.stringify(res.body);
    for (const leak of leaks()) assert.equal(body.includes(leak), false, `leaked ${leak}`);
  });

  test("GET /api/wallpapers returns only cabin A's own wallpaper", async () => {
    const res = await as(app, world.memberA).get("/api/wallpapers");
    assert.deepEqual(res.body.map((w: { id: string }) => w.id), [wallpaperA]);
  });
});

describe("wallpapers: same-cabin flows still work (positive control)", () => {
  test("GET /api/wallpapers as cabin A member → 200 with cabin A's wallpaper", async () => {
    const res = await as(app, world.memberA).get("/api/wallpapers");
    assert.equal(res.status, 200);
    assert.ok(res.body.some((w: { id: string }) => w.id === wallpaperA));
  });

  test("POST then DELETE a cabin A wallpaper works (2xx) and stays inside cabin A", async () => {
    const buffer = await pngBuffer();
    const created = await as(app, world.memberA).post("/api/wallpapers").attach("image", buffer, "wp.png");
    assert.equal(created.status, 201);
    const id: string = created.body.id;
    assert.equal((await wallpaperSnapshot(id))?.cabinId, world.cabinA.id);

    const removed = await as(app, world.memberA).delete(`/api/wallpapers/${id}`);
    assert.equal(removed.status, 200);
    assert.equal(await wallpaperSnapshot(id), null);
  });

  test("guest A cannot upload or delete a cabin A wallpaper (403 stays inside the cabin)", async () => {
    const buffer = await pngBuffer();
    const upload = await as(app, guestA).post("/api/wallpapers").attach("image", buffer, "wp.png");
    assert.equal(upload.status, 403);
    const del = await as(app, guestA).delete(`/api/wallpapers/${wallpaperA}`);
    assert.equal(del.status, 403);
    assert.notEqual(await wallpaperSnapshot(wallpaperA), null);
  });
});
