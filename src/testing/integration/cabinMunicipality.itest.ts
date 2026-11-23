import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import request from "supertest";
import prisma from "../../utils/prisma";
import { as, setupIntegrationFile, teardownIntegrationFile, type TestWorld } from "./harness";

let app: Express;
let world: TestWorld;

const location = (cabinId: string) =>
  prisma.cabin.findUnique({
    where: { id: cabinId },
    select: {
      weatherLocation: true, municipalityCode: true, municipalityName: true, municipalityDistrict: true,
      municipalityRegion: true, latitude: true, longitude: true,
    },
  });

before(async () => {
  ({ app, world } = await setupIntegrationFile());
});

after(teardownIntegrationFile);

describe("POST /api/register – nearest municipality (#279)", () => {
  const signup = { cabinName: "Chata Nová", username: "novak-obec", email: "novak-obec@example.com", password: "Heslo-123456" };

  test("rejects an unknown municipality code without creating the cabin", async () => {
    const res = await request(app).post("/api/register").send({ ...signup, municipalityCode: 1 });

    assert.equal(res.status, 400);
    assert.equal(await prisma.cabin.count({ where: { name: signup.cabinName } }), 0);
  });

  test("stores the picked municipality on the new cabin", async () => {
    const res = await request(app).post("/api/register").send({ ...signup, municipalityCode: 565768 });

    assert.equal(res.status, 201);
    const cabin = await prisma.cabin.findFirst({ where: { name: signup.cabinName } });
    assert.equal(cabin?.municipalityCode, 565768);
    assert.equal(cabin?.municipalityDistrict, "Litoměřice");
    assert.ok(Math.abs((cabin?.longitude ?? 0) - 13.99) < 0.05);
  });
});

describe("PATCH /api/cabin – nearest municipality (#279)", () => {
  test("stores name, district, region and centre of the picked municipality only for the own cabin", async () => {
    const cabinBBefore = await location(world.cabinB.id);
    // Souřadnice a text od klienta server ignoruje, bere je z číselníku podle kódu.
    const res = await as(app, world.adminA).patch("/api/cabin").send({ municipalityCode: 591866, latitude: 1, weatherLocation: "Lhota" });

    assert.equal(res.status, 200);
    const stored = await location(world.cabinA.id);
    assert.equal(stored?.municipalityCode, 591866);
    assert.equal(stored?.municipalityName, "Třebenice");
    assert.equal(stored?.municipalityDistrict, "Třebíč");
    assert.equal(stored?.municipalityRegion, "Kraj Vysočina");
    assert.equal(stored?.weatherLocation, "Třebenice");
    assert.ok(Math.abs((stored?.latitude ?? 0) - 49.16) < 0.05);
    assert.equal(res.body.municipalityCode, 591866);
    assert.deepEqual(await location(world.cabinB.id), cabinBBefore);
  });

  test("rejects an unknown code and keeps the stored municipality", async () => {
    const before = await location(world.cabinA.id);
    const res = await as(app, world.adminA).patch("/api/cabin").send({ municipalityCode: 1 });

    assert.equal(res.status, 400);
    assert.deepEqual(await location(world.cabinA.id), before);
  });

  test("null clears the municipality and its coordinates", async () => {
    const res = await as(app, world.adminA).patch("/api/cabin").send({ municipalityCode: null });

    assert.equal(res.status, 200);
    assert.deepEqual(await location(world.cabinA.id), {
      weatherLocation: null, municipalityCode: null, municipalityName: null, municipalityDistrict: null,
      municipalityRegion: null, latitude: null, longitude: null,
    });
  });
});
