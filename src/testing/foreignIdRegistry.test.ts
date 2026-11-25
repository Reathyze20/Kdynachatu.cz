import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import * as schemas from "../validators/schemas";
import { FOREIGN_ID_REFERENCES, findIdFields, readIntegrationFile, reconcileForeignIds } from "./foreignIdRegistry";

describe("findIdFields: pole s ID ze schémat", () => {
  test("najde id, …Id, …Ids a UUID pole v objektech i se .refine a ignoruje ostatní", () => {
    const module = {
      a: z.object({
        id: z.string(), folderId: z.string(), photoIds: z.array(z.string()), idea: z.string(), valid: z.boolean(),
        splitWith: z.array(z.string().uuid()).optional(), owner: z.string().uuid().nullable(), email: z.string().email(),
      }),
      b: z.object({ ownerId: z.string() }).refine(() => true),
      notASchema: ["x"],
      enumSchema: z.enum(["x"]),
    };
    assert.deepEqual(findIdFields(module), ["a.folderId", "a.id", "a.owner", "a.photoIds", "a.splitWith", "b.ownerId"]);
  });
});

describe("reconcileForeignIds: logika guardu", () => {
  const files: Record<string, string> = { "x.itest.ts": `test("cizí složka → 404", …)` };
  const read = (file: string) => files[file] ?? null;

  test("pole bez záznamu → fail a jmenuje ho", () => {
    const report = reconcileForeignIds(["s.folderId", "s.newId"], { "s.folderId": { itest: "x.itest.ts", test: "cizí složka" } }, read);
    assert.equal(report.ok, false);
    assert.deepEqual(report.missingFromRegistry, ["s.newId"]);
  });

  test("záznam bez pole, chybějící itest i chybějící test → fail", () => {
    const report = reconcileForeignIds(["s.a", "s.b"], {
      "s.a": { itest: "missing.itest.ts", test: "cokoli" },
      "s.b": { itest: "x.itest.ts", test: "jiný test" },
      "s.gone": { notAReference: "důvod" },
    }, read);
    assert.deepEqual(report.staleRegistryKeys, ["s.gone"]);
    assert.deepEqual(report.brokenLinks, ["s.a", "s.b"]);
  });

  test("notAReference bez důvodu → fail; s důvodem a platný odkaz → ok", () => {
    assert.deepEqual(reconcileForeignIds(["s.a"], { "s.a": { notAReference: " " } }, read).brokenLinks, ["s.a"]);
    assert.equal(reconcileForeignIds(["s.a", "s.b"], {
      "s.a": { notAReference: "výčet" },
      "s.b": { itest: "x.itest.ts", test: "cizí složka" },
    }, read).ok, true);
  });
});

describe("registr referencí na cizí ID pokrývá všechna pole s ID ve schématech", () => {
  const fields = findIdFields(schemas);

  test("každé pole s ID má záznam s odkazem na existující itest a naopak", () => {
    const report = reconcileForeignIds(fields, FOREIGN_ID_REFERENCES, readIntegrationFile);
    assert.ok(report.ok, [
      report.missingFromRegistry.length && `Pole s ID bez záznamu v FOREIGN_ID_REFERENCES (src/testing/foreignIdRegistry.ts): ${report.missingFromRegistry.join(", ")}. Načti ID s filtrem cabinId (cizí → 404) a přidej itest s ID z chaty B.`,
      report.staleRegistryKeys.length && `Záznamy bez pole ve schématech (ukliď je): ${report.staleRegistryKeys.join(", ")}.`,
      report.brokenLinks.length && `Záznamy s neplatným odkazem na itest (soubor nebo úryvek názvu testu nenalezen): ${report.brokenLinks.join(", ")}.`,
    ].filter(Boolean).join(" "));
  });

  test("introspekce najde známá pole (sanity, aby guard nebyl prázdný)", () => {
    for (const expected of ["createNoteSchema.threadId", "createDiaryEntrySchema.galleryPhotoIds", "updateDiaryEntrySchema.galleryPhotoIds"]) {
      assert.ok(fields.includes(expected), `introspekce nenašla ${expected}`);
    }
  });
});
