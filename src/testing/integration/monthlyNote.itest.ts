import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { as, setupIntegrationFile, teardownIntegrationFile, type TestWorld } from "./harness";

/**
 * Tenant-izolace měsíční poznámky (MonthlyNote). Jiný vzor než ostatní domény:
 * MonthlyNote NEMÁ `:id` endpointy — je jednoznačná přes `(cabinId, year, month)` a adresuje
 * se přes query (`GET /monthly-note?year=&month=`) / tělo (`PUT /monthly-note`). `cabinId` bere
 * endpoint výhradně z tokenu (requireCabin), nikdy z query ani těla. Izolace se proto tvrdí jako
 * "čtení i zápis pro stejný rok/měsíc zůstanou uvnitř vlastní chaty", ne jako "cizí ID → 404".
 */

const YEAR = 2027;
const NOTE_B_TEXT = "Soukromá měsíční poznámka chaty B";

let app: Express;
let world: TestWorld;

const noteFor = (cabinId: string, month: number) =>
  prisma.monthlyNote.findUnique({ where: { cabinId_year_month: { cabinId, year: YEAR, month } } });

const seedBNote = (month: number, text: string) =>
  prisma.monthlyNote.create({
    data: { cabinId: world.cabinB.id, year: YEAR, month, text, updatedById: world.memberB.id },
  });

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  // Měsíc 3 patří jen chatě B — chata A pro něj nemá žádnou poznámku.
  await seedBNote(3, NOTE_B_TEXT);
});

after(teardownIntegrationFile);

describe("monthly-note: GET je scoped na chatu volajícího", () => {
  for (const actor of ["memberA", "adminA"] as const) {
    test(`${actor} nevidí poznámku chaty B pro stejný rok/měsíc (vrátí null)`, async () => {
      const res = await as(app, world[actor]).get(`/api/reservations/monthly-note?year=${YEAR}&month=3`);
      assert.equal(res.status, 200);
      assert.equal(res.body, null);
      assert.equal(JSON.stringify(res.body ?? "").includes(NOTE_B_TEXT), false, "unikl text poznámky B");
    });
  }

  test("cabinId v query se ignoruje — bere se z tokenu, poznámka B neunikne", async () => {
    const res = await as(app, world.memberA)
      .get(`/api/reservations/monthly-note?year=${YEAR}&month=3&cabinId=${world.cabinB.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body, null);
    assert.equal(JSON.stringify(res.body ?? "").includes(NOTE_B_TEXT), false, "unikl text poznámky B");
  });
});

describe("monthly-note: PUT zapisuje jen do chaty volajícího", () => {
  test("PUT chaty A pro stejný rok/měsíc nesáhne na řádek chaty B", async () => {
    const month = 4;
    await seedBNote(month, "Poznámka B – duben");
    const beforeB = await noteFor(world.cabinB.id, month);

    const res = await as(app, world.memberA)
      .put("/api/reservations/monthly-note")
      .send({ year: YEAR, month, text: "Poznámka A – duben" });
    assert.equal(res.status, 200);
    assert.equal(res.body.text, "Poznámka A – duben");

    assert.deepEqual(await noteFor(world.cabinB.id, month), beforeB, "řádek chaty B se změnil");
    const aRow = await noteFor(world.cabinA.id, month);
    assert.equal(aRow?.text, "Poznámka A – duben");
    assert.notEqual(aRow?.id, beforeB?.id, "A a B sdílí jeden řádek");
  });

  test("cabinId v těle se ignoruje — zápis A necílí na chatu B", async () => {
    const month = 5;
    await seedBNote(month, "Poznámka B – květen");
    const beforeB = await noteFor(world.cabinB.id, month);

    const res = await as(app, world.memberA)
      .put("/api/reservations/monthly-note")
      .send({ year: YEAR, month, text: "Pokus přepsat B", cabinId: world.cabinB.id });
    assert.equal(res.status, 200);

    assert.deepEqual(await noteFor(world.cabinB.id, month), beforeB, "zápis se protlačil do chaty B");
    assert.equal((await noteFor(world.cabinA.id, month))?.text, "Pokus přepsat B");
  });

  test("prázdný text maže jen poznámku chaty A; řádek chaty B zůstává", async () => {
    const month = 6;
    await seedBNote(month, "Poznámka B – červen");
    const beforeB = await noteFor(world.cabinB.id, month);
    await as(app, world.memberA).put("/api/reservations/monthly-note").send({ year: YEAR, month, text: "A smazatelná" });

    const res = await as(app, world.memberA).put("/api/reservations/monthly-note").send({ year: YEAR, month, text: "   " });
    assert.equal(res.status, 200);

    assert.equal(await noteFor(world.cabinA.id, month), null, "poznámka A se nesmazala");
    assert.deepEqual(await noteFor(world.cabinB.id, month), beforeB, "smazala se i poznámka B");
  });
});

describe("monthly-note: vlastní chata funguje (pozitivní kontrola)", () => {
  test("PUT a následný GET v rámci chaty A vrací vlastní obsah (2xx)", async () => {
    const month = 7;
    const put = await as(app, world.adminA)
      .put("/api/reservations/monthly-note")
      .send({ year: YEAR, month, text: "Plán chaty A na červenec" });
    assert.equal(put.status, 200);
    assert.equal(put.body.text, "Plán chaty A na červenec");

    const get = await as(app, world.memberA).get(`/api/reservations/monthly-note?year=${YEAR}&month=${month}`);
    assert.equal(get.status, 200);
    assert.equal(get.body.text, "Plán chaty A na červenec");
    assert.equal(JSON.stringify(get.body).includes(NOTE_B_TEXT), false, "unikl text poznámky B");
  });
});
