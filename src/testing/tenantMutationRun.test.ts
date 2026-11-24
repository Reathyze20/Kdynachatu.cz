import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { TenantMutant } from "./tenantMutants";
import type { TenantMutantException } from "./tenantMutantRegistry";
import { exitCodeFor, formatMutantLine, formatSummary, mutantTimeoutMs, planMutant, resultOfOutcome } from "./tenantMutationRun";

function mutant(overrides: Partial<TenantMutant> = {}): TenantMutant {
  return {
    file: "src/backend/routes/notes.ts",
    line: 177,
    route: "GET /api/notes/:id",
    kind: "remove-where-cabinId",
    original: "cabinId: req.user!.cabinId",
    mutatedSource: "",
    ...overrides,
  };
}

const map = { "notes.ts": ["notes.itest.ts"], "logs.ts": [] };
const exception: TenantMutantException = {
  file: "notes.ts",
  route: "GET /api/notes/:id",
  original: "cabinId: req.user!.cabinId",
  reason: "ekvivalentní: dotaz se opakuje s { id, cabinId }",
};

describe("mutantTimeoutMs: 3× kontrolní doba skupiny, minimálně 60 s", () => {
  test("krátký kontrolní běh → minimum 60 s", () => {
    assert.equal(mutantTimeoutMs(5_000), 60_000);
    assert.equal(mutantTimeoutMs(20_000), 60_000);
  });

  test("dlouhý kontrolní běh → trojnásobek", () => {
    assert.equal(mutantTimeoutMs(30_000), 90_000);
  });
});

describe("planMutant + resultOfOutcome: klasifikace mutanta", () => {
  test("mutant s itesty v mapě se spustí proti nim", () => {
    assert.deepEqual(planMutant(mutant(), map, []), { itests: ["notes.itest.ts"] });
  });

  test("soubor rout s prázdným seznamem itestů → přežil – bez testu, bez spouštění", () => {
    assert.deepEqual(planMutant(mutant({ file: "src/backend/routes/logs.ts" }), map, []), { result: { kind: "survived-untested" } });
  });

  test("mutant odpovídající výjimce → výjimka s důvodem, bez spouštění", () => {
    assert.deepEqual(planMutant(mutant(), map, [exception]), { result: { kind: "exception", reason: exception.reason } });
  });

  test("neprošlé testy = zabit, timeout = zabit (timeout), prošlé = přežil", () => {
    assert.deepEqual(resultOfOutcome("failed"), { kind: "killed" });
    assert.deepEqual(resultOfOutcome("timeout"), { kind: "killed-timeout" });
    assert.deepEqual(resultOfOutcome("passed"), { kind: "survived" });
  });
});

describe("formatMutantLine: soubor:řádek, routa, výsledek", () => {
  const widths = { location: 34, route: 24 };

  test("zarovnané sloupce a české výsledky", () => {
    assert.equal(formatMutantLine(mutant(), { kind: "killed" }, widths), "src/backend/routes/notes.ts:177     GET /api/notes/:id        zabit");
    assert.equal(formatMutantLine(mutant(), { kind: "killed-timeout" }, widths).trimEnd().split(/\s{2,}/).at(-1), "zabit (timeout)");
    assert.match(formatMutantLine(mutant(), { kind: "survived" }, widths), /  přežil$/);
    assert.match(formatMutantLine(mutant(), { kind: "survived-untested" }, widths), /  přežil – bez testu$/);
    assert.match(formatMutantLine(mutant(), { kind: "exception", reason: "ekvivalentní: X" }, widths), /  výjimka \(ekvivalentní: X\)$/);
  });

  test("helper bez routy", () => {
    assert.match(formatMutantLine(mutant({ route: null }), { kind: "killed" }, widths), /:177 +\(bez routy\) +zabit$/);
  });
});

describe("formatSummary: počty podle výsledku a celková doba", () => {
  test("souhrn počtů a doba v minutách a sekundách", () => {
    const results = [{ kind: "killed" }, { kind: "killed" }, { kind: "killed-timeout" }, { kind: "survived" }, { kind: "survived-untested" }, { kind: "exception", reason: "x" }] as const;
    assert.equal(
      formatSummary(results, 754_400),
      "Souhrn: 6 mutantů – zabit 2, zabit (timeout) 1, přežil 1, přežil – bez testu 1, výjimka 1. Doba běhu: 12 min 34 s.",
    );
  });
});

describe("exitCodeFor: nenulový při přeživším mimo výjimky", () => {
  test("jen zabití a výjimky → 0", () => {
    assert.equal(exitCodeFor([{ kind: "killed" }, { kind: "killed-timeout" }, { kind: "exception", reason: "x" }]), 0);
  });

  test("přeživší i přeživší bez testu → 1", () => {
    assert.equal(exitCodeFor([{ kind: "killed" }, { kind: "survived" }]), 1);
    assert.equal(exitCodeFor([{ kind: "survived-untested" }]), 1);
  });
});
