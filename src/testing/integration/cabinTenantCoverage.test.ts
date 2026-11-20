import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CABIN_MODEL_COVERAGE,
  coverageGaps,
  itestPath,
  modelsWithCabinId,
  parsePrismaModels,
  readSchema,
  reconcileCoverage,
} from "./cabinTenantCoverage";

const schema = readSchema();

describe("parsePrismaModels: robustní parser schématu", () => {
  test("najde model s cabinId bez ohledu na formátování řádku", () => {
    const models = parsePrismaModels(`
      model  Spaced   {
        id       String  @id
        cabinId  String? @map("cabin_id")
      }
    `);
    assert.deepEqual(modelsWithCabinId(
      `model Spaced {\n  id String @id\n  cabinId String?\n}`,
    ), ["Spaced"]);
    assert.equal(models[0].fieldNames.includes("cabinId"), true);
  });

  test("relaci `cabin Cabin @relation(fields: [cabinId])` nezamění za pole cabinId", () => {
    const onlyRelation = `
      model NoDirectCabin {
        id    String @id
        other String
        // cabinId se tu objevuje jen uvnitř relace, ne jako vlastní pole:
        cabin Cabin @relation(fields: [otherId], references: [id])
      }
    `;
    assert.deepEqual(modelsWithCabinId(onlyRelation), []);
  });

  test("ignoruje enum bloky a blokové atributy (@@map/@@index)", () => {
    const withEnum = `
      enum Status { pending cabinId purchased }
      model Thing {
        id      String @id
        cabinId String
        @@index([cabinId])
        @@map("things")
      }
    `;
    assert.deepEqual(modelsWithCabinId(withEnum), ["Thing"]);
  });
});

describe("reconcileCoverage: logika guardu (bez reálné změny schématu)", () => {
  test("shodné množiny → ok", () => {
    const report = reconcileCoverage(["A", "B"], ["B", "A"]);
    assert.equal(report.ok, true);
    assert.deepEqual(report.missingFromRegistry, []);
    assert.deepEqual(report.staleRegistryKeys, []);
  });

  test("nový model s cabinId chybí v registru → fail a jmenuje ho", () => {
    const report = reconcileCoverage(["Reservation", "BrandNewModel"], ["Reservation"]);
    assert.equal(report.ok, false);
    assert.deepEqual(report.missingFromRegistry, ["BrandNewModel"]);
  });

  test("zbytečný klíč v registru (model už nemá cabinId) → fail a jmenuje ho", () => {
    const report = reconcileCoverage(["Reservation"], ["Reservation", "RemovedModel"]);
    assert.equal(report.ok, false);
    assert.deepEqual(report.staleRegistryKeys, ["RemovedModel"]);
  });
});

describe("tenant pokrytí: každý model s cabinId má záznam v registru", () => {
  test("množina modelů s cabinId == klíče CABIN_MODEL_COVERAGE", () => {
    const schemaModels = modelsWithCabinId(schema);
    const report = reconcileCoverage(schemaModels, Object.keys(CABIN_MODEL_COVERAGE));

    const message = report.missingFromRegistry.length
      ? `Modely s cabinId bez záznamu v CABIN_MODEL_COVERAGE: ${report.missingFromRegistry.join(", ")}. `
        + `Přidej je do registru (coveredBy / coveredIndirectly / coverageGap s důvodem).`
      : `Zbytečné klíče v CABIN_MODEL_COVERAGE (model s cabinId už neexistuje): ${report.staleRegistryKeys.join(", ")}.`;
    assert.ok(report.ok, message);
  });

  test("parser najde známé doménové modely (sanity, aby guard nebyl prázdný)", () => {
    const schemaModels = modelsWithCabinId(schema);
    for (const expected of ["User", "Reservation", "ShoppingList", "Note", "NoteThread", "GalleryFolder", "ThreadReadStatus"]) {
      assert.ok(schemaModels.includes(expected), `parser nenašel model s cabinId: ${expected}`);
    }
    assert.ok(schemaModels.length >= 12, `čekal jsem aspoň 12 modelů s cabinId, našel ${schemaModels.length}`);
  });
});

describe("tenant pokrytí: odkazy a dluhy odpovídají realitě", () => {
  test("každý `direct` záznam odkazuje na existující *.itest.ts soubor", () => {
    for (const [model, coverage] of Object.entries(CABIN_MODEL_COVERAGE)) {
      if (coverage.status !== "direct") continue;
      assert.ok(
        coverage.itestFile.endsWith(".itest.ts"),
        `${model}: coveredBy musí odkazovat na *.itest.ts, ne "${coverage.itestFile}"`,
      );
      assert.ok(
        fs.existsSync(itestPath(coverage.itestFile)),
        `${model}: odkazovaný tenant itest "${coverage.itestFile}" neexistuje`,
      );
    }
  });

  test("seznam přiznaných dluhů (status gap) je explicitní a aktuální", () => {
    // Když gap získá dedikovaný itest (přepni na coveredBy), nebo přibude nový gap,
    // tenhle seznam se musí vědomě upravit — ať se dluh neplíží bez povšimnutí.
    assert.deepEqual(coverageGaps(), [
      "DiaryFolder",
      "InventoryItem",
      "MonthlyNote",
      "ReconstructionItem",
    ]);
  });
});
