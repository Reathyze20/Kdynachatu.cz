import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { as, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";

let app: Express;
let world: TestWorld;

// Tenant kontrakt počtů v `/api/admin/system` (#413): chata B má od každého druhu záznamu jiný
// počet než chata A, takže chybějící filtr `cabinId` u kteréhokoli počtu změní výsledek pro A.
const seedReservations = async (owner: TestUser, count: number) => {
  for (let i = 0; i < count; i += 1) {
    await prisma.reservation.create({
      data: {
        userId: owner.id,
        cabinId: owner.cabinId,
        dateFrom: new Date(Date.UTC(2030, 0, 1 + i * 7)),
        dateTo: new Date(Date.UTC(2030, 0, 3 + i * 7)),
        purpose: `Pobyt ${owner.username} ${i}`,
        status: "primary",
      },
    });
  }
};

const seedPhotos = async (owner: TestUser, count: number) => {
  const folder = await prisma.galleryFolder.create({
    data: { name: `Album ${owner.username}`, createdById: owner.id, cabinId: owner.cabinId },
  });
  for (let i = 0; i < count; i += 1) {
    await prisma.galleryPhoto.create({
      data: { folderId: folder.id, src: `/uploads/${owner.username}-${i}.jpg`, uploadedById: owner.id },
    });
  }
};

const seedNotes = async (owner: TestUser, count: number) => {
  for (let i = 0; i < count; i += 1) {
    await prisma.note.create({ data: { userId: owner.id, cabinId: owner.cabinId, message: `Vzkaz ${owner.username} ${i}` } });
  }
};

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  await seedReservations(world.memberA, 1);
  await seedPhotos(world.memberA, 1);
  await seedNotes(world.memberA, 1);
  await seedReservations(world.memberB, 2);
  await seedPhotos(world.memberB, 3);
  await seedNotes(world.memberB, 2);
});

after(teardownIntegrationFile);

describe("admin: system info", () => {
  test("a member gets 403 with a readable Czech message", async () => {
    const res = await as(app, world.memberA).get("/api/admin/system");
    assert.equal(res.status, 403);
    assert.equal(res.body.message, "Přístup pouze pro administrátora.");
  });

  test("an admin gets the counts of their own cabin", async () => {
    const res = await as(app, world.adminA).get("/api/admin/system");
    assert.equal(res.status, 200);
    assert.equal(res.body.userCount, 2); // správce A + člen A, uživatelé chaty B se nepočítají
  });

  test("reservation, photo and note counts for cabin A leave out cabin B's records", async () => {
    const res = await as(app, world.adminA).get("/api/admin/system");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { userCount: 2, reservationCount: 1, photoCount: 1, noteCount: 1 });
  });

  test("control: cabin B's admin sees cabin B's counts", async () => {
    const res = await as(app, world.adminB).get("/api/admin/system");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { userCount: 2, reservationCount: 2, photoCount: 3, noteCount: 2 });
  });
});
