import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { jtskToWgs84, MUNICIPALITIES_FILE, type MunicipalityDataset } from "./buildMunicipalities";

// Strážce vygenerovaného souboru: ověřuje data v repu, ne parser (ten se pouští jen při aktualizaci).
const dataset = JSON.parse(fs.readFileSync(MUNICIPALITIES_FILE, "utf8")) as MunicipalityDataset;
const all = dataset.districts.flatMap((d) => d.municipalities.map(([code, name, lat, lon]) => ({ code, name, lat, lon, district: d.name, region: d.region })));

describe("jtskToWgs84", () => {
  test("matches the ČÚZK transformation service within about 15 m", () => {
    // Definiční bod obce Plzeň z RÚIAN (ST_UZSZ k 2026-10-31: -822400.00 -1069700.00);
    // referenční WGS84 z GeometryServer/project na ags.cuzk.cz.
    const [lat, lon] = jtskToWgs84(-822400, -1069700);
    assert.ok(Math.abs(lat - 49.74758) < 0.00015, `lat ${lat}`);
    assert.ok(Math.abs(lon - 13.37764) < 0.00015, `lon ${lon}`);
  });
});

describe("municipality dataset", () => {
  test("covers every Czech municipality once, inside the country", () => {
    const codes = new Set(all.map((m) => m.code));
    assert.equal(codes.size, all.length, "duplicate municipality code");
    assert.ok(all.length > 6200, `${all.length} municipalities`);
    for (const m of all) {
      assert.ok(m.name && m.district && m.region, `names of ${m.code}`);
      assert.ok(m.lat > 48.5 && m.lat < 51.1 && m.lon > 12 && m.lon < 18.9, `${m.name} ${m.lat},${m.lon}`);
    }
    assert.equal(dataset.license, "CC BY 4.0");
  });

  test("tells namesake municipalities apart by district and region", () => {
    assert.deepEqual(
      all.filter((m) => m.name === "Třebenice").map((m) => `${m.district}, ${m.region}`),
      ["Litoměřice, Ústecký kraj", "Třebíč, Kraj Vysočina"],
    );
  });

  test("puts Prague, which has no district, under Hlavní město Praha", () => {
    const prague = all.find((m) => m.code === 554782);
    assert.equal(prague?.district, "Hlavní město Praha");
    assert.equal(prague?.region, "Hlavní město Praha");
  });
});
