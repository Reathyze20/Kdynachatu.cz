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
type CabinFiles = { gallery: string; thumb: string; wallpaper: string; cover: string; coverNarrow: string };
let filesA: CabinFiles;
let filesB: CabinFiles;

const cookieFor = (user: TestUser) => `${UPLOADS_COOKIE}=${tokenFor(user)}`;
const fetchUpload = (file: string, cookie?: string) => {
  const req = request(app).get(`/uploads/${file}`);
  return cookie ? req.set("Cookie", cookie) : req;
};

async function writeUpload(...files: string[]): Promise<void> {
  for (const file of files) {
    await fs.mkdir(path.dirname(path.join(UPLOADS_PATH, file)), { recursive: true });
    await fs.writeFile(path.join(UPLOADS_PATH, file), `obsah ${file}`);
  }
}

async function seedCabinFiles(user: TestUser): Promise<CabinFiles> {
  const name = randomUUID();
  const files = {
    gallery: `${name}.webp`, thumb: `thumbs/${name}.webp`, wallpaper: `wallpapers/${name}.webp`,
    cover: `covers/${name}.webp`, coverNarrow: `covers/${name}-sm.webp`,
  };
  await writeUpload(...Object.values(files));
  const folder = await prisma.galleryFolder.create({ data: { name: `Album ${name}`, cabinId: user.cabinId, createdById: user.id } });
  await prisma.galleryPhoto.create({ data: { folderId: folder.id, src: `/uploads/${files.gallery}`, uploadedById: user.id } });
  await prisma.wallpaper.create({ data: { url: `/uploads/${files.wallpaper}`, cabinId: user.cabinId } });
  await prisma.cabin.update({ where: { id: user.cabinId }, data: { coverPhotoUrl: `/uploads/${files.cover}` } });
  return files;
}

async function createVictim(): Promise<TestUser> {
  const username = `foto-obet-${randomUUID().slice(0, 8)}`;
  const user = await prisma.user.create({
    data: { username, passwordHash: await hashPassword(TEST_PASSWORD), color: "#5d9b62", isVerified: true, role: "user", cabinId: world.cabinA.id },
  });
  return { id: user.id, username, role: user.role, cabinId: world.cabinA.id, tokenVersion: user.tokenVersion };
}

/** Hodnota Set-Cookie pro cookie uploadů (supertest vrací pole hlaviček). */
function uploadsSetCookie(res: request.Response): string {
  const cookie = (res.headers["set-cookie"] as unknown as string[] | undefined)?.find((c) => c.startsWith(`${UPLOADS_COOKIE}=`));
  assert.ok(cookie, `odpověď nenastavila cookie ${UPLOADS_COOKIE}`);
  return cookie;
}

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  filesA = await seedCabinFiles(world.memberA);
  filesB = await seedCabinFiles(world.memberB);
});

after(teardownIntegrationFile);

describe("GET /uploads/* without a valid cookie → 401", () => {
  test("no cookie, or a forged one", async () => {
    assert.equal((await fetchUpload(filesA.gallery)).status, 401);
    assert.equal((await fetchUpload(filesA.gallery, `${UPLOADS_COOKIE}=nesmysl.nesmysl.nesmysl`)).status, 401);
  });

  test("a Bearer header alone (img requests carry only the cookie)", async () => {
    const res = await fetchUpload(filesA.gallery).set("Authorization", `Bearer ${tokenFor(world.memberA)}`);
    assert.equal(res.status, 401);
  });
});

describe("GET /uploads/* checks the cabin of the file", () => {
  const kinds = ["gallery", "thumb", "wallpaper", "cover", "coverNarrow"] as const;
  for (const kind of kinds) {
    test(`member A gets own ${kind}, but not cabin B's (404)`, async () => {
      const own = await fetchUpload(filesA[kind], cookieFor(world.memberA));
      assert.equal(own.status, 200);
      assert.equal(own.body.toString(), `obsah ${filesA[kind]}`);
      assert.equal((await fetchUpload(filesB[kind], cookieFor(world.memberA))).status, 404);
    });
  }

  test("positive control: member B gets cabin B's photo", async () => {
    assert.equal((await fetchUpload(filesB.gallery, cookieFor(world.memberB))).status, 200);
  });

  test("a file on disk without a DB record → 404", async () => {
    await writeUpload("sirotek.webp");
    assert.equal((await fetchUpload("sirotek.webp", cookieFor(world.memberA))).status, 404);
  });

  test("path traversal → 404", async () => {
    assert.equal((await fetchUpload("..%2F..%2Fpackage.json", cookieFor(world.memberA))).status, 404);
  });

  test("the response is private and never immutable", async () => {
    const cacheControl = String((await fetchUpload(filesA.gallery, cookieFor(world.memberA))).headers["cache-control"]);
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
    assert.equal((await fetchUpload(filesA.gallery, cookie.split(";")[0])).status, 200);
  });

  test("POST /api/session-cookie sets the cookie from the Bearer token of an existing session", async () => {
    const res = await as(app, world.memberA).post("/api/session-cookie");
    assert.equal(res.status, 204);
    const cookie = uploadsSetCookie(res);
    assert.equal(cookie.split(";")[0], cookieFor(world.memberA));
    assert.match(cookie, /; Path=\/uploads(;|$)/);
    assert.equal((await request(app).post("/api/session-cookie")).status, 401);
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
    assert.equal((await fetchUpload(filesA.gallery, cookieFor(victim))).status, 200);
    await prisma.user.update({ where: { id: victim.id }, data: { isBanned: true } });
    assert.equal((await fetchUpload(filesA.gallery, cookieFor(victim))).status, 401);
  });

  test("after „Odhlásit všude“ the cookie stops working (401)", async () => {
    const victim = await createVictim();
    const cookie = cookieFor(victim);
    assert.equal((await fetchUpload(filesA.gallery, cookie)).status, 200);
    assert.equal((await as(app, victim).post("/api/users/me/logout-all")).status, 200);
    assert.equal((await fetchUpload(filesA.gallery, cookie)).status, 401);
  });
});
