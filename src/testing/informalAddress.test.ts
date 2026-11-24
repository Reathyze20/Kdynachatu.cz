import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PROJECT_ROOT,
  extractStringLiterals,
  findFormalAddress,
  listScannedFiles,
  scanSource,
} from "./informalAddress";

describe("findFormalAddress: pozná vykání", () => {
  test("imperativ a přítomný čas na -te", () => {
    assert.deepEqual(findFormalAddress("Zkuste to znovu."), ["Zkuste"]);
    assert.deepEqual(findFormalAddress("Kontaktujte administrátora."), ["Kontaktujte"]);
    assert.deepEqual(findFormalAddress("Nyní se můžete přihlásit."), ["můžete"]);
    assert.deepEqual(findFormalAddress("Nemáte oprávnění."), ["Nemáte"]);
  });

  test("formální zájmena v kterémkoli pádě a velikosti písmen, i bez diakritiky", () => {
    assert.deepEqual(findFormalAddress("Vaše e-mailová adresa"), ["Vaše"]);
    assert.deepEqual(findFormalAddress("Poslali jsme vám e-mail"), ["vám"]);
    assert.deepEqual(findFormalAddress("Váš účet"), ["Váš"]);
    assert.deepEqual(findFormalAddress("Otevři vaši schránku"), ["vaši"]);
    assert.deepEqual(findFormalAddress("Prihlaste se, vas ucet vyprsel"), ["vas", "Prihlaste"]);
  });

  test("tykání a neutrální texty projdou", () => {
    assert.deepEqual(findFormalAddress("Nepodařilo se uložit. Zkus to znovu."), []);
    assert.deepEqual(findFormalAddress("Nemáš oprávnění k této akci."), []);
    assert.deepEqual(findFormalAddress("Tvoje e-mailová adresa ještě nebyla ověřena."), []);
    assert.deepEqual(findFormalAddress("Rezervace v chatě nebyla nalezena"), []);
    assert.deepEqual(findFormalAddress("canvas, vase.png"), []);
  });

  test("anglická slova na -te a identifikátory nejsou vykání", () => {
    assert.deepEqual(findFormalAddress("Failed to delete note, update state"), []);
    assert.deepEqual(findFormalAddress("Chybí startDate nebo endDate."), []);
    assert.deepEqual(findFormalAddress("no-cache, must-revalidate"), []);
  });
});

const texts = (src: string) => extractStringLiterals(src).map(({ line, text }) => ({ line, text }));

describe("extractStringLiterals: komentáře a regexy nejsou hlášky", () => {
  test("přeskočí řádkové i blokové komentáře", () => {
    const src = [
      "// Zkuste to znovu (komentář)",
      "/* Kontaktujte",
      "   administrátora */",
      'const a = "Zkus to znovu.";',
    ].join("\n");
    assert.deepEqual(texts(src), [{ line: 4, text: "Zkus to znovu." }]);
  });

  test("regex literál s uvozovkou nerozbije čtení dalších řetězců", () => {
    const src = ['const re = /["\']/g;', 'const b = "Zkuste";'].join("\n");
    assert.deepEqual(texts(src), [{ line: 2, text: "Zkuste" }]);
  });

  test("template literál: statické části i řetězce ve výrazu", () => {
    const src = "const t = `Ahoj ${name ? \"Vám\" : x}, vítej`;";
    assert.deepEqual(
      texts(src).map((l) => l.text).sort(),
      ["Ahoj  , vítej", "Vám"].sort(),
    );
  });

  test("escapované uvozovky zůstanou uvnitř literálu", () => {
    assert.deepEqual(texts('x("Řekni \\"Zkus\\" znovu")'), [{ line: 1, text: 'Řekni "Zkus" znovu' }]);
  });

  test("\\n a \\t oddělí slova, \\u escapy se dekódují", () => {
    assert.deepEqual(texts('x("Chyba.\\nZkuste\\tznovu")'), [{ line: 1, text: "Chyba. Zkuste znovu" }]);
    assert.deepEqual(texts('x("Nem\\u00e1te \\u{161}anci")'), [{ line: 1, text: "Nemáte šanci" }]);
  });
});

describe("scanSource: argumenty interních logů jsou vyjmuté", () => {
  test("logger.* a console.* se nehlídají, odpověď API ano", () => {
    const src = [
      'logger.warn("AUTH", "Zkuste znovu");',
      'console.log("Kontaktujte admina");',
      'res.status(403).json({ message: "Nemáte oprávnění." });',
    ].join("\n");
    const hits = scanSource("x.ts", src);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].line, 3);
    assert.deepEqual(hits[0].words, ["Nemáte"]);
  });

  test("log a odpověď na stejném řádku: odpověď se hlídá", () => {
    const src = 'logger.warn("A", { error: String(e) }); res.status(403).json({ message: "Nemáte přístup." });';
    assert.deepEqual(scanSource("x.ts", src).map((h) => h.words), [["Nemáte"]]);
  });

  test("víceřádkové volání logu se nehlídá ani na dalších řádcích", () => {
    const src = ['logger.warn(', '  "AUTH",', '  `Zkuste znovu ${id}`,', ");"].join("\n");
    assert.deepEqual(scanSource("x.ts", src), []);
  });
});

describe("backend tyká ve všech uživatelských hláškách", () => {
  const files = listScannedFiles();

  test("sken najde backendové zdrojáky (nemíří do prázdna)", () => {
    for (const expected of [
      "src/backend/routes/auth.ts",
      "src/middleware/cabinMiddleware.ts",
      "src/validators/schemas.ts",
      "src/utils/email.ts",
    ]) {
      assert.ok(files.includes(expected), `chybí ${expected}`);
    }
    assert.ok(!files.some((f) => f.endsWith(".test.ts")), "testy se neskenují");
  });

  test("žádné vykání (imperativ na -te, Váš/Vám/Vás, Nemáte …)", () => {
    const hits = files.flatMap((file) =>
      scanSource(file, fs.readFileSync(path.join(PROJECT_ROOT, file), "utf8")),
    );
    const report = hits.map((h) => `  ${h.file}:${h.line}  [${h.words.join(", ")}]  "${h.text.trim()}"`);
    assert.equal(
      hits.length,
      0,
      `Backend vyká v ${hits.length} hláškách. Aplikace tyká všude (DESIGN.md, CODING_STANDARDS.md), ` +
        `chyba ve tvaru „co se stalo. Zkus to znovu.“:\n${report.join("\n")}`,
    );
  });
});
