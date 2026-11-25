import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import request from "supertest";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { UPLOADS_PATH } from "../../config/config";
import { hashPassword } from "../../utils/password";
import { UPLOADS_COOKIE } from "../../utils/uploadsCookie";
import { as, setupIntegrationFile, teardownIntegrationFile, tokenFor, TEST_PASSWORD, type TestUser, type TestWorld } from "./harness";

// Fotky za httpOnly cookie (#487): `/uploads/*` vydá soubor jen přihlášenému členovi chaty, které patří.
// Soubory leží v dočasném UPLOADS_PATH testovacího běhu, cesty v DB jsou stejné jako z rout.

let app: Express;
let world: TestWorld;
const files = {} as Record<"galleryA" | "galleryB" | "wallpaperA" | "wallpaperB" | "coverA" | "coverB", string>;

const cookieFor = (user: TestUser) => `${UPLOADS_COOKIE}=${tokenFor(user)}`;
const getWithCookie = (url: string, cookie?: string) => {
  const req = request(app).get(url);
  return cookie ? req.set("Cookie", cookie) : req;
};

async function writeUpload(relativePath: string): Promise<void> {
  const full = path.join(UPLOADS_PATH, relativePath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, `obsah ${relativePath}`);
}

async function seedCabinFiles(user: TestUser, letter: string) {
  const gallery = `${letter}-${randomUUID()}.webp`;
  await writeUpload(gallery);
  await writeUpload(`thumbs/${gallery}`);
  const folder = await prisma.galleryFolder.create({ data: { name: `Album ${letter}`, cabinId: user.cabinId, createdById: user.id } });
  await prisma.galleryPhoto.create({ data: { folderId: folder.id, src: `/uploads/${gallery}`, uploadedById: user.id } });

  const wallpaper = `wallpapers/${randomUUID()}.webp`;
  await writeUpload(wallpaper);
  await prisma.wallpaper.create({ data: { url: `/uploads/${wallpaper}`, cabinId: user.cabinId } });

  const coverId = randomUUID();
  await writeUpload(`covers/${coverId}.webp`);
  await writeUpload(`covers/${coverId}-sm.webp`);
  await prisma.cabin.update({ where: { id: user.cabinId }, data: { coverPhotoUrl: `/uploads/covers/${coverId}.webp` } });

  return { gallery, wallpaper, cover: `covers/${coverId}.webp` };
}

let victimCounter = 0;
async function createVictim(): Promise<TestUser> {
  victimCounter += 1;
  const username = `foto-obet-${victimCounter}`;
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(TEST_PASSWORD),
      color: "#5d9b62",
      email: `${username}@example.test`,
      isEmailVerified: true,
      isVerified: true,
      role: "user",
      cabinId: world.cabinA.id,
    },
  });
  return { id: user.id, username, role: user.role, cabinId: world.cabinA.id, tokenVersion: user.tokenVersion };
}

/** Hodnota Set-Cookie pro cookie uploadů (supertest vrací pole hlaviček). */
function uploadsSetCookie(res: request.Response): string {
  const header = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith(`${UPLOADS_COOKIE}=`));
  assert.ok(cookie, `odpověď nenastavila cookie ${UPLOADS_COOKIE}`);
  return cookie;
}

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  const a = await seedCabinFiles(world.memberA, "a");
  const b = await seedCabinFiles(world.memberB, "b");
  Object.assign(files, {
    galleryA: a.gallery, galleryB: b.gallery,
    wallpaperA: a.wallpaper, wallpaperB: b.wallpaper,
    coverA: a.cover, coverB: b.cover,
  });
});

after(teardownIntegrationFile);

describe("GET /uploads/* without a valid cookie", () => {
  test("no cookie → 401", async () => {
    const res = await getWithCookie(`/uploads/${files.galleryA}`);
    assert.equal(res.status, 401);
  });

  test("a Bearer header alone is not enough (img requests carry only the cookie) → 401", async () => {
    const res = await request(app).get(`/uploads/${files.galleryA}`).set("Authorization", `Bearer ${tokenFor(world.memberA)}`);
    assert.equal(res.status, 401);
  });

  test("a forged cookie → 401", async () => {
    const res = await getWithCookie(`/uploads/${files.galleryA}`, `${UPLOADS_COOKIE}=nesmysl.nesmysl.nesmysl`);
    assert.equal(res.status, 401);
  });
});

describe("GET /uploads/* checks the cabin of the file", () => {
  const own = ["galleryA", "wallpaperA", "coverA"] as const;
  for (const key of own) {
    test(`member A gets own ${key}`, async () => {
      const res = await getWithCookie(`/uploads/${files[key]}`, cookieFor(world.memberA));
      assert.equal(res.status, 200);
      assert.equal(res.body.toString(), `obsah ${files[key]}`);
    });
  }

  test("member A gets the thumbnail and the narrow cover variant of own files", async () => {
    const thumb = await getWithCookie(`/uploads/thumbs/${files.galleryA}`, cookieFor(world.memberA));
    assert.equal(thumb.status, 200);
    const narrow = await getWithCookie(`/uploads/${files.coverA.replace(".webp", "-sm.webp")}`, cookieFor(world.memberA));
    assert.equal(narrow.status, 200);
  });

  const foreign = ["galleryB", "wallpaperB", "coverB"] as const;
  for (const key of foreign) {
    test(`member A does not get cabin B's ${key} (404)`, async () => {
      const res = await getWithCookie(`/uploads/${files[key]}`, cookieFor(world.memberA));
      assert.equal(res.status, 404);
    });
  }

  test("member A does not get cabin B's thumbnail or narrow cover (404)", async () => {
    assert.equal((await getWithCookie(`/uploads/thumbs/${files.galleryB}`, cookieFor(world.memberA))).status, 404);
    assert.equal((await getWithCookie(`/uploads/${files.coverB.replace(".webp", "-sm.webp")}`, cookieFor(world.memberA))).status, 404);
  });

  test("positive control: member B gets cabin B's photo", async () => {
    const res = await getWithCookie(`/uploads/${files.galleryB}`, cookieFor(world.memberB));
    assert.equal(res.status, 200);
  });

  test("a file on disk without a DB record → 404", async () => {
    await writeUpload("sirotek.webp");
    const res = await getWithCookie("/uploads/sirotek.webp", cookieFor(world.memberA));
    assert.equal(res.status, 404);
  });

  test("path traversal → 404", async () => {
    const res = await getWithCookie("/uploads/..%2F..%2Fpackage.json", cookieFor(world.memberA));
    assert.equal(res.status, 404);
  });

  test("the response is private and never immutable", async () => {
    const res = await getWithCookie(`/uploads/${files.galleryA}`, cookieFor(world.memberA));
    const cacheControl = String(res.headers["cache-control"]);
    assert.match(cacheControl, /private/);
    assert.doesNotMatch(cacheControl, /immutable/);
  });
});

describe("uploads cookie lifecycle", () => {
  test("login sets an HttpOnly, SameSite=Strict cookie on path /uploads that opens own photos", async () => {
    const victim = await createVictim();
    const res = await request(app).post("/api/login").send({ username: victim.username, password: TEST_PASSWORD });
    assert.equal(res.status, 200);
    const cookie = uploadsSetCookie(res);
    assert.match(cookie, /; HttpOnly/i);
    assert.match(cookie, /; SameSite=Strict/i);
    assert.match(cookie, /; Path=\/uploads(;|$)/);
    assert.match(cookie, /; Max-Age=\d+/);

    const photo = await getWithCookie(`/uploads/${files.galleryA}`, cookie.split(";")[0]);
    assert.equal(photo.status, 200);
  });

  test("POST /api/session-cookie sets the cookie for an existing session from its Bearer token", async () => {
    const res = await as(app, world.memberA).post("/api/session-cookie");
    assert.equal(res.status, 204);
    const cookie = uploadsSetCookie(res);
    assert.equal(cookie.split(";")[0], cookieFor(world.memberA));
    assert.match(cookie, /; Path=\/uploads(;|$)/);
  });

  test("POST /api/session-cookie without a token → 401", async () => {
    const res = await request(app).post("/api/session-cookie");
    assert.equal(res.status, 401);
  });

  test("POST /api/logout clears the cookie", async () => {
    const res = await request(app).post("/api/logout").set("Cookie", cookieFor(world.memberA));
    assert.equal(res.status, 204);
    const cookie = uploadsSetCookie(res);
    assert.match(cookie, new RegExp(`^${UPLOADS_COOKIE}=;`));
    assert.match(cookie, /; Path=\/uploads(;|$)/);
    assert.match(cookie, /Expires=Thu, 01 Jan 1970/);
  });

  test("after a ban the cookie stops working (401)", async () => {
    const victim = await createVictim();
    assert.equal((await getWithCookie(`/uploads/${files.galleryA}`, cookieFor(victim))).status, 200);
    await prisma.user.update({ where: { id: victim.id }, data: { isBanned: true } });
    assert.equal((await getWithCookie(`/uploads/${files.galleryA}`, cookieFor(victim))).status, 401);
  });

  test("after „Odhlásit všude“ the cookie stops working (401)", async () => {
    const victim = await createVictim();
    const cookie = cookieFor(victim);
    assert.equal((await getWithCookie(`/uploads/${files.galleryA}`, cookie)).status, 200);
    const res = await as(app, victim).post("/api/users/me/logout-all");
    assert.equal(res.status, 200);
    assert.equal((await getWithCookie(`/uploads/${files.galleryA}`, cookie)).status, 401);
  });
});
