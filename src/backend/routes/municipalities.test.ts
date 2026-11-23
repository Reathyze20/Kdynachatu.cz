import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { cabinMunicipalityFields, findMunicipality, municipalitySearchHandler, searchMunicipalities } from "./municipalities";
import { validate } from "../../validators/validate";
import { municipalitySearchSchema } from "../../validators/schemas";

describe("searchMunicipalities", () => {
  test("offers every namesake municipality with its own district", () => {
    const results = searchMunicipalities("Třebenice");
    assert.deepEqual(
      results.map((m) => `${m.name} (${m.district})`),
      ["Třebenice (Litoměřice)", "Třebenice (Třebíč)"],
    );
  });

  test("ignores diacritics and letter case", () => {
    const [first] = searchMunicipalities("plzen");
    assert.equal(first.name, "Plzeň");
    assert.equal(first.district, "Plzeň-město");
    assert.equal(first.region, "Plzeňský kraj");
  });

  test("ranks exact names before prefixes and prefixes before inner words", () => {
    const names = searchMunicipalities("lhota", 50).map((m) => m.name);
    assert.equal(names[0], "Lhota");
    const firstPrefix = names.findIndex((n) => n !== "Lhota");
    assert.match(names[firstPrefix], /^Lhota /);
    const firstInnerWord = names.findIndex((n) => !n.startsWith("Lhota"));
    assert.ok(firstInnerWord > firstPrefix);
    assert.match(names[firstInnerWord], / Lhota/);
  });

  test("offers every municipality of an exact name even above the limit", () => {
    const novaVes = searchMunicipalities("Nová Ves");
    assert.equal(novaVes.filter((m) => m.name === "Nová Ves").length, 14);
    assert.equal(new Set(novaVes.map((m) => m.code)).size, novaVes.length);
  });

  test("narrows namesakes by the district typed after the name", () => {
    assert.deepEqual(
      searchMunicipalities("nova ves zdar").map((m) => `${m.name} (${m.district})`),
      ["Nová Ves (Žďár nad Sázavou)"],
    );
  });

  test("matches a word inside a hyphenated name", () => {
    assert.ok(searchMunicipalities("mistek").some((m) => m.name === "Frýdek-Místek"));
  });

  test("returns at most the requested number of results", () => {
    assert.equal(searchMunicipalities("lhot").length, 10);
    assert.equal(searchMunicipalities("lhot", 3).length, 3);
  });

  test("needs at least two characters", () => {
    assert.deepEqual(searchMunicipalities("l"), []);
    assert.deepEqual(searchMunicipalities("  "), []);
  });
});

describe("findMunicipality", () => {
  test("returns the municipality with its district and centre coordinates", () => {
    const prague = findMunicipality(554782);
    assert.ok(prague);
    assert.equal(prague.name, "Praha");
    assert.equal(prague.district, "Hlavní město Praha");
    assert.ok(Math.abs(prague.latitude - 50.08) < 0.05);
    assert.ok(Math.abs(prague.longitude - 14.42) < 0.05);
  });

  test("returns undefined for an unknown code", () => {
    assert.equal(findMunicipality(1), undefined);
  });
});

describe("cabinMunicipalityFields", () => {
  test("stores name, district, region and the centre of the picked municipality", () => {
    const fields = cabinMunicipalityFields(591866);
    assert.ok(fields);
    assert.equal(fields.municipalityName, "Třebenice");
    assert.equal(fields.municipalityDistrict, "Třebíč");
    assert.equal(fields.municipalityRegion, "Kraj Vysočina");
    assert.equal(fields.weatherLocation, "Třebenice");
    assert.ok(Math.abs(fields.latitude - 49.16) < 0.05 && Math.abs(fields.longitude - 16.02) < 0.05);
  });

  test("rejects an unknown code", () => {
    assert.equal(cabinMunicipalityFields(1), null);
  });
});

describe("GET /api/municipalities", () => {
  async function get(query: string) {
    const app = express();
    app.get("/api/municipalities", validate(municipalitySearchSchema, "query"), municipalitySearchHandler);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    try {
      const { port } = server.address() as AddressInfo;
      return await fetch(`http://127.0.0.1:${port}/api/municipalities${query}`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  test("answers matching municipalities with district, without coordinates", async () => {
    const res = await get("?q=trebenice");
    assert.equal(res.status, 200);
    const body = (await res.json()) as { municipalities: Record<string, unknown>[] };
    assert.deepEqual(body.municipalities[0], {
      code: 565768,
      name: "Třebenice",
      district: "Litoměřice",
      region: "Ústecký kraj",
    });
  });

  test("rejects a missing or too short query", async () => {
    assert.equal((await get("")).status, 400);
    assert.equal((await get("?q=x")).status, 400);
  });
});
