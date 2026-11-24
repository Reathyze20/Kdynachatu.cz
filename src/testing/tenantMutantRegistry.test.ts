import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  checkMutantRegistries,
  exceptionFor,
  itestFileNames,
  ROUTE_ITEST_MAP,
  TENANT_MUTANT_EXCEPTIONS,
  type RegistryInput,
  type TenantMutantException,
} from "./tenantMutantRegistry";
import { findRouteFileMutants, routeFileNames, type TenantMutant } from "./tenantMutants";

function mutant(overrides: Partial<TenantMutant> = {}): TenantMutant {
  return {
    file: "src/backend/routes/notes.ts",
    line: 10,
    route: "GET /api/notes/:id",
    kind: "remove-where-cabinId",
    original: "cabinId: req.user!.cabinId",
    mutatedSource: "",
    ...overrides,
  };
}

const exception = (overrides: Partial<TenantMutantException> = {}): TenantMutantException => ({
  file: "notes.ts",
  route: "GET /api/notes/:id",
  original: "cabinId: req.user!.cabinId",
  reason: "Ekvivalentní: záznam se hned potom znovu hledá přes { id, cabinId }.",
  ...overrides,
});

/** Konzistentní stav registrů; každý test rozbije jednu věc. */
function input(overrides: Partial<RegistryInput> = {}): RegistryInput {
  return {
    mutants: [mutant()],
    routeFiles: ["notes.ts", "logs.ts"],
    itestFiles: ["notes.itest.ts"],
    map: { "notes.ts": ["notes.itest.ts"], "logs.ts": [] },
    exceptions: [exception()],
    ...overrides,
  };
}

describe("checkMutantRegistries: chyby registrů", () => {
  test("konzistentní registry a prázdný seznam itestů (bez testu) → žádná chyba", () => {
    assert.deepEqual(checkMutantRegistries(input()), []);
  });

  test("soubor rout s mutantem bez záznamu v mapě", () => {
    const errors = checkMutantRegistries(input({ mutants: [mutant(), mutant({ file: "src/backend/routes/users.ts" })] }));
    assert.deepEqual(errors.map((e) => e.kind), ["unmapped-route-file"]);
    assert.match(errors[0].message, /users\.ts/);
  });

  test("záznam mapy na neexistující soubor rout", () => {
    const errors = checkMutantRegistries(input({ map: { "notes.ts": ["notes.itest.ts"], "logs.ts": [], "old.ts": [] } }));
    assert.deepEqual(errors.map((e) => e.kind), ["stale-map-entry"]);
    assert.match(errors[0].message, /old\.ts/);
  });

  test("odkaz na neexistující itest soubor", () => {
    const errors = checkMutantRegistries(input({ map: { "notes.ts": ["notes.itest.ts", "gone.itest.ts"], "logs.ts": [] } }));
    assert.deepEqual(errors.map((e) => e.kind), ["missing-itest"]);
    assert.match(errors[0].message, /notes\.ts.*gone\.itest\.ts/);
  });

  test("výjimka bez důvodu (i jen z mezer)", () => {
    const errors = checkMutantRegistries(input({ exceptions: [exception({ reason: "  " })] }));
    assert.deepEqual(errors.map((e) => e.kind), ["exception-without-reason"]);
    assert.match(errors[0].message, /notes\.ts.*GET \/api\/notes\/:id.*cabinId: req\.user!\.cabinId/);
  });

  test("výjimka, které neodpovídá žádný nalezený mutant", () => {
    const errors = checkMutantRegistries(input({ exceptions: [exception(), exception({ route: "DELETE /api/notes/:id" })] }));
    assert.deepEqual(errors.map((e) => e.kind), ["unmatched-exception"]);
    assert.match(errors[0].message, /DELETE \/api\/notes\/:id/);
  });

  test("výjimka, které odpovídá víc mutantů, je nejednoznačná a vypíše je", () => {
    const mutants = [mutant({ line: 10 }), mutant({ line: 42, original: "cabinId:\n req.user!.cabinId" })];
    const errors = checkMutantRegistries(input({ mutants }));
    assert.deepEqual(errors.map((e) => e.kind), ["ambiguous-exception"]);
    assert.match(errors[0].message, /2 mutantům/);
    assert.match(errors[0].message, /notes\.ts:10/);
    assert.match(errors[0].message, /notes\.ts:42/);
  });

  test("soubor bez mutantů smí v mapě chybět", () => {
    assert.deepEqual(checkMutantRegistries(input({ routeFiles: ["notes.ts", "logs.ts", "workspace.ts"] })), []);
  });
});

describe("exceptionFor: páruje soubor, routu a normalizovaný úryvek, ne řádek", () => {
  test("shoda i na jiném řádku a s jiným formátováním úryvku", () => {
    const found = exceptionFor(mutant({ line: 99, original: "cabinId:\n    req.user!.cabinId" }), [exception()]);
    assert.equal(found?.reason, exception().reason);
  });

  test("jiný soubor, routa nebo úryvek → není výjimka", () => {
    const exceptions = [exception()];
    assert.equal(exceptionFor(mutant({ file: "src/backend/routes/diary.ts" }), exceptions), undefined);
    assert.equal(exceptionFor(mutant({ route: "PUT /api/notes/:id" }), exceptions), undefined);
    assert.equal(exceptionFor(mutant({ original: "cabinId" }), exceptions), undefined);
  });

  test("helper bez routy se páruje přes route null", () => {
    assert.ok(exceptionFor(mutant({ route: null }), [exception({ route: null })]));
    assert.equal(exceptionFor(mutant({ route: null }), [exception()]), undefined);
  });
});

describe("výjimka s mutatedLine a count: holý úryvek sdílený víc mutanty jedné routy", () => {
  // Tři mutanti `cabinId` v jedné routě; jen dva (shodné řádky) jsou ekvivalentní.
  const source = [
    "const active = { cabinId, open: true };",
    "if (x) {",
    "  await db.update({ where: { id: item.id, cabinId } });",
    "}",
    "await db.update({ where: { id: item.id, cabinId } });",
  ].join("\n");
  const removed = (line: number) => source.split("\n").map((text, i) => (i === line - 1 ? text.replace(/,? cabinId/, "") : text)).join("\n");
  const shared = (line: number) => mutant({ line, original: "cabinId", mutatedSource: removed(line) });
  const mutants = [shared(1), shared(3), shared(5)];
  const updates = exception({ original: "cabinId", mutatedLine: "where: { id: item.id }", count: 2 });

  test("mutatedLine páruje podle řádku po mutaci, ne podle čísla řádku", () => {
    assert.deepEqual(mutants.map((m) => exceptionFor(m, [updates]) !== undefined), [false, true, true]);
  });

  test("count = počet pokrytých mutantů; jinak je výjimka nejednoznačná", () => {
    assert.deepEqual(checkMutantRegistries(input({ mutants, exceptions: [updates] })), []);
    const tooMany = checkMutantRegistries(input({ mutants, exceptions: [exception({ original: "cabinId", count: 2 })] }));
    assert.deepEqual(tooMany.map((e) => e.kind), ["ambiguous-exception"]);
    assert.match(tooMany[0].message, /3 mutantům.*čeká se 2/);
    const noCount = checkMutantRegistries(input({ mutants, exceptions: [{ ...updates, count: undefined }] }));
    assert.deepEqual(noCount.map((e) => e.kind), ["ambiguous-exception"]);
  });
});

describe("tenant mutanti: registry odpovídají skutečným souborům rout a itestů", () => {
  test("mapa i výjimky sedí na nalezené mutanty a existující soubory", () => {
    const errors = checkMutantRegistries({
      mutants: findRouteFileMutants(),
      routeFiles: routeFileNames(),
      itestFiles: itestFileNames(),
      map: ROUTE_ITEST_MAP,
      exceptions: TENANT_MUTANT_EXCEPTIONS,
    });
    assert.deepEqual(errors.map((e) => e.message), []);
  });

  test("bez testu jsou jen vědomě přiznané soubory", () => {
    // Když soubor dostane itest, nebo přibude soubor bez testu, seznam se musí vědomě upravit.
    const untested = Object.entries(ROUTE_ITEST_MAP).filter(([, itests]) => itests.length === 0).map(([file]) => file);
    assert.deepEqual(untested, ["logs.ts"]);
  });
});
