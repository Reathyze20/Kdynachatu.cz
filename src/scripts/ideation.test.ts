// Helper `/ideation` (#367) se testuje zvenku: CLI nad dočasným adresářem, jen fiktivní data.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SCRIPT = path.resolve("src/scripts/ideation.ts");
const FIXTURE = path.resolve("src/scripts/assets/ideation-signals.fixture.md");

function freshRoot(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), "ideation-")), ".ideation");
}

function runHelper(...args: string[]) {
  const result = spawnSync(process.execPath, ["--import", "tsx", SCRIPT, ...args], { encoding: "utf8" });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

function signalsFile(count: number): string {
  const rows = Array.from({ length: count }, (_, i) => `| S-${i + 1} | 2026-10-01 | rodič | osobně | Postřeh ${i + 1}. | |\n`);
  return `# Signály\n\n| ID | Datum | Role | Zdroj | Parafráze | Shluk |\n|---|---|---|---|---|---|\n${rows.join("")}`;
}

function withSignals(count: number): string {
  const root = freshRoot();
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, "signals.md"), signalsFile(count));
  return root;
}

describe("ideation check", () => {
  test("in an empty directory it creates both templates and reports all 10 signals missing", () => {
    const root = freshRoot();

    const { code, output } = runHelper("check", "--root", root);

    assert.notEqual(code, 0);
    assert.match(output, /chybí 10/i);
    const signals = readFileSync(path.join(root, "signals.md"), "utf8");
    assert.match(signals, /\| ID \| Datum \| Role \| Zdroj \| Parafráze \| Shluk \|/);
    const lessons = readFileSync(path.join(root, "lessons.md"), "utf8");
    assert.match(lessons, /## A\. Opakované výtky/);
    assert.match(lessons, /## B\. Verdikty rodiny/);
  });

  test("never overwrites existing files", () => {
    const root = withSignals(3);
    const lessons = "# Moje poučení\n\nruční obsah\n";
    writeFileSync(path.join(root, "lessons.md"), lessons);

    runHelper("check", "--root", root);

    assert.equal(readFileSync(path.join(root, "signals.md"), "utf8"), signalsFile(3));
    assert.equal(readFileSync(path.join(root, "lessons.md"), "utf8"), lessons);
  });

  test("with 9 signals it exits non-zero and says 1 is missing", () => {
    const { code, output } = runHelper("check", "--root", withSignals(9));

    assert.notEqual(code, 0);
    assert.match(output, /chybí 1\b/i);
  });

  test("with 10 signals it passes", () => {
    const { code, output } = runHelper("check", "--root", withSignals(10));

    assert.equal(code, 0, output);
  });

  test("the fictional fixture is enough for a trial run", () => {
    const root = freshRoot();
    mkdirSync(root, { recursive: true });
    copyFileSync(FIXTURE, path.join(root, "signals.md"));

    const { code, output } = runHelper("check", "--root", root);

    assert.equal(code, 0, output);
  });

  test("an unknown subcommand exits non-zero with usage", () => {
    const { code, output } = runHelper("nonsense");

    assert.notEqual(code, 0);
    assert.match(output, /check/);
  });
});

function withClusters(markdown: string): string {
  const root = freshRoot();
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, "shluky.md"), markdown);
  return root;
}

function headingOrder(output: string): string[] {
  return output
    .split(/\r?\n/)
    .filter((line) => line.startsWith("### "))
    .map((line) => line.slice(4).split(" ")[0]);
}

const manyIssues = Array.from({ length: 70 }, (_, i) => `#${i + 100}`).join(", ");

describe("ideation rank", () => {
  test("orders clusters by family signals S-n, so many issues cannot drown them", () => {
    const root = withClusters(
      [
        "### ovladani – aplikace mate",
        `- Signály: S-1, ${manyIssues}`,
        "- Potíž: mnoho issues od správce.",
        "",
        "### udrzba – závady nemají kam",
        "- Signály: S-2, S-3",
        "- Potíž: dva signály rodiny.",
        "",
        "### naklady – roční útraty",
        "- Signály: S-4, S-5, #9",
        "- Potíž: dva signály rodiny a jedno issue.",
        "",
      ].join("\n"),
    );

    const { code, output } = runHelper("rank", "--root", root);

    assert.equal(code, 0, output);
    assert.deepEqual(headingOrder(output), ["naklady", "udrzba", "ovladani"]);
    assert.match(output, /- Potíž: dva signály rodiny a jedno issue\./);
  });

  test("keeps the original order when S-n and issue counts tie", () => {
    const root = withClusters("### b – B\n- Signály: S-1, #2\n\n### a – A\n- Signály: S-3, #4\n");

    const { output } = runHelper("rank", "--root", root);

    assert.deepEqual(headingOrder(output), ["b", "a"]);
  });

  test("a shluky.md without any cluster block exits non-zero", () => {
    const { code, output } = runHelper("rank", "--root", withClusters("# Shluky\n\nzatím nic\n"));

    assert.notEqual(code, 0);
    assert.match(output, /žádný blok/);
  });

  test("without shluky.md it exits non-zero and names the missing file", () => {
    const root = freshRoot();
    mkdirSync(root, { recursive: true });

    const { code, output } = runHelper("rank", "--root", root);

    assert.notEqual(code, 0);
    assert.match(output, /shluky\.md/);
  });
});

type Verdict = { judge: number; first: string; second: string; winner: string };

const SIX = ["P1", "P2", "P3", "P4", "P5", "P6"];

function orderedPairs(candidates: string[]): Array<[string, string]> {
  return candidates.flatMap((first) =>
    candidates.filter((second) => second !== first).map((second): [string, string] => [first, second]),
  );
}

/** Rozhodčí s pevným pořadím: v obou pořadích vyhraje kandidát, který je v `preference` dřív. */
function consistentJudge(judge: number, preference: string[]): Verdict[] {
  return orderedPairs(preference).map(([first, second]) => ({
    judge,
    first,
    second,
    winner: preference.indexOf(first) < preference.indexOf(second) ? first : second,
  }));
}

function withPairwise(input: unknown): string {
  const root = freshRoot();
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, "parove.json"), JSON.stringify(input));
  return root;
}

function advancing(output: string): string[] {
  const line = output.split(/\r?\n/).find((l) => l.startsWith("Postupují:")) ?? "";
  return line
    .replace("Postupují:", "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

describe("ideation pairwise", () => {
  test("counts a win only when both orders agree, so a judge who always picks the first one adds nothing", () => {
    const verdicts = orderedPairs(SIX).map(([first, second]) => ({
      judge: 1,
      first,
      second,
      winner: first === "P6" || second === "P6" ? "P6" : first,
    }));

    const { code, output } = runHelper("pairwise", "--root", withPairwise({ candidates: SIX, verdicts }));

    assert.equal(code, 0, output);
    assert.deepEqual(advancing(output), ["P6", "P1", "P2", "P3", "P4"]);
    assert.match(output, /P6: 5 výher/);
    assert.match(output, /P5: 0 výher/);
    assert.match(output, /Shoda na hranici: P1, P2, P3, P4, P5 mají po 0 výhrách/);
  });

  test("sums wins across 3 judges and lets at most 5 advance", () => {
    const preference = ["P4", "P6", "P1", "P2", "P5", "P3"];
    const verdicts = [1, 2, 3].flatMap((judge) => consistentJudge(judge, preference));

    const { code, output } = runHelper("pairwise", "--root", withPairwise({ candidates: SIX, verdicts }));

    assert.equal(code, 0, output);
    assert.deepEqual(advancing(output), ["P4", "P6", "P1", "P2", "P5"]);
    assert.match(output, /P4: 15 výher/);
    assert.doesNotMatch(output, /Shoda na hranici|Bez verdiktu/);
  });

  test("a missing verdict or a silent judge gives no win and is reported", () => {
    const verdicts = consistentJudge(1, SIX).filter((v) => !(v.first === "P2" && v.second === "P1"));

    const { code, output } = runHelper("pairwise", "--root", withPairwise({ candidates: SIX, verdicts }));

    assert.equal(code, 0, output);
    assert.match(output, /P1: 4 výher/);
    assert.match(output, /Bez verdiktu: rozhodčí 1: P2 před P1; rozhodčí 2: žádný verdikt; rozhodčí 3: žádný verdikt/);
  });

  test("refuses to run with 5 or fewer candidates", () => {
    const five = SIX.slice(0, 5);

    const { code, output } = runHelper(
      "pairwise",
      "--root",
      withPairwise({ candidates: five, verdicts: consistentJudge(1, five) }),
    );

    assert.notEqual(code, 0);
    assert.match(output, /víc než 5/);
  });

  test("refuses a fourth judge", () => {
    const verdicts = [1, 2, 3, 4].flatMap((judge) => consistentJudge(judge, SIX));

    const { code, output } = runHelper("pairwise", "--root", withPairwise({ candidates: SIX, verdicts }));

    assert.notEqual(code, 0);
    assert.match(output, /nejvýš 3/);
  });

  test("refuses a winner that is not in the pair", () => {
    const verdicts = [{ judge: 1, first: "P1", second: "P2", winner: "P3" }];

    const { code, output } = runHelper("pairwise", "--root", withPairwise({ candidates: SIX, verdicts }));

    assert.notEqual(code, 0);
    assert.match(output, /vítěz P3 není v dvojici/);
  });

  test("without parove.json it exits non-zero and names the missing file", () => {
    const root = freshRoot();
    mkdirSync(root, { recursive: true });

    const { code, output } = runHelper("pairwise", "--root", root);

    assert.notEqual(code, 0);
    assert.match(output, /parove\.json/);
  });
});

type BlindCandidate = {
  title: string;
  summary: string;
  evidence: string;
  labels: string;
  objections: string[];
  question: string;
};

function candidate(title: string): BlindCandidate {
  return {
    title,
    summary: `Co dělá ${title}.`,
    evidence: "S-1, #12",
    labels: "jádro · metrika 30. 6. 2027: ano · velikost: S · migrace: ne · riziko cabinId: ne: nic nového",
    objections: [`Kdo ${title} 1?`, `Kdo ${title} 2?`, `Kdo ${title} 3?`],
    question: `Chtěli byste ${title}?`,
  };
}

const PIPELINE = ["Pa", "Pb", "Pc", "Pd", "Pe"].map(candidate);
const BASELINE = ["Ba", "Bb", "Bc", "Bd", "Be"].map(candidate);

function withBlind(input: unknown): string {
  const root = freshRoot();
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, "slepe.json"), JSON.stringify(input));
  return root;
}

type BlindKey = { run: string; candidates: Array<{ id: string; origin: string; title: string }> };

function keyPath(root: string, run: string): string {
  return path.join(root, "runs", `${run}.klic.json`);
}

function readKey(root: string, run: string): BlindKey {
  return JSON.parse(readFileSync(keyPath(root, run), "utf8"));
}

function blindTitles(output: string): Array<[string, string]> {
  return output
    .split(/\r?\n/)
    .filter((line) => line.startsWith("### "))
    .map((line): [string, string] => {
      const [id, title] = line.slice(4).split(" – ");
      return [id, title];
    });
}

describe("ideation blind", () => {
  test("mixes both sides into K1–K10 without revealing origin and writes the key next to the run output", () => {
    const root = withBlind({ pipeline: PIPELINE, baseline: BASELINE });

    const { code, output } = runHelper("blind", "--root", root, "--run", "2026-11-24", "--seed", "7");

    assert.equal(code, 0, output);
    assert.doesNotMatch(output, /pipeline|baseline/i);
    const shown = blindTitles(output);
    assert.deepEqual(
      shown.map(([id]) => id),
      ["K1", "K2", "K3", "K4", "K5", "K6", "K7", "K8", "K9", "K10"],
    );
    assert.deepEqual(
      shown.map(([, title]) => title).sort(),
      ["Ba", "Bb", "Bc", "Bd", "Be", "Pa", "Pb", "Pc", "Pd", "Pe"],
    );
    assert.match(
      output,
      /### K\d+ – Pa\nCo dělá Pa\.\n\n- Důkaz: S-1, #12\n- Štítky: jádro · .*\n- Námitky:\n {2}1\. Kdo Pa 1\?\n {2}2\. Kdo Pa 2\?\n {2}3\. Kdo Pa 3\?\n\nOtázka pro rodinu \(ke zkopírování\):\n\n> Chtěli byste Pa\?/,
    );

    const key = readKey(root, "2026-11-24");
    assert.equal(key.run, "2026-11-24");
    assert.deepEqual(
      key.candidates.map((c) => c.id),
      shown.map(([id]) => id),
    );
    for (const [id, title] of shown) {
      const entry = key.candidates.find((c) => c.id === id);
      assert.equal(entry?.title, title);
      assert.equal(entry?.origin, title.startsWith("P") ? "pipeline" : "baseline");
    }
    assert.notDeepEqual(
      shown.map(([, title]) => title),
      ["Pa", "Pb", "Pc", "Pd", "Pe", "Ba", "Bb", "Bc", "Bd", "Be"],
    );
    assert.equal(existsSync(path.join(root, "slepe.json")), false, "the input with origins must not stay in the root");
  });

  test("the same seed gives the same mix and key", () => {
    const runs = [1, 2].map(() => {
      const root = withBlind({ pipeline: PIPELINE, baseline: BASELINE });
      const { output } = runHelper("blind", "--root", root, "--run", "2026-11-24", "--seed", "42");
      return { output, key: readKey(root, "2026-11-24") };
    });

    assert.equal(runs[0].output, runs[1].output);
    assert.deepEqual(runs[0].key, runs[1].key);
  });

  test("an uneven split keeps every candidate of both sides exactly once", () => {
    const root = withBlind({ pipeline: PIPELINE.slice(0, 2), baseline: BASELINE });

    const { code, output } = runHelper("blind", "--root", root, "--run", "2026-11-24-2");

    assert.equal(code, 0, output);
    const key = readKey(root, "2026-11-24-2");
    assert.deepEqual(
      key.candidates.map((c) => c.id),
      ["K1", "K2", "K3", "K4", "K5", "K6", "K7"],
    );
    assert.equal(key.candidates.filter((c) => c.origin === "pipeline").length, 2);
    assert.equal(key.candidates.filter((c) => c.origin === "baseline").length, 5);
  });

  test("refuses more than 5 candidates on one side and writes no key", () => {
    const root = withBlind({ pipeline: PIPELINE, baseline: [...BASELINE, candidate("Bf")] });

    const { code, output } = runHelper("blind", "--root", root, "--run", "2026-11-24");

    assert.notEqual(code, 0);
    assert.match(output, /baseline je 6, na stranu jich smí být nejvýš 5/);
    assert.equal(existsSync(keyPath(root, "2026-11-24")), false);
  });

  test("refuses a candidate with an extra field that could reveal its origin", () => {
    const root = withBlind({ pipeline: [{ ...candidate("Pa"), proposedBy: "3 z 8 generátorů" }], baseline: BASELINE });

    const { code, output } = runHelper("blind", "--root", root, "--run", "2026-11-24");

    assert.notEqual(code, 0);
    assert.match(output, /bez dalších polí/);
    assert.equal(existsSync(keyPath(root, "2026-11-24")), false);
  });

  test("never overwrites an existing key", () => {
    const root = withBlind({ pipeline: PIPELINE, baseline: BASELINE });
    mkdirSync(path.join(root, "runs"), { recursive: true });
    writeFileSync(keyPath(root, "2026-11-24"), "původní klíč\n");

    const { code, output } = runHelper("blind", "--root", root, "--run", "2026-11-24");

    assert.notEqual(code, 0);
    assert.match(output, /už existuje/);
    assert.equal(readFileSync(keyPath(root, "2026-11-24"), "utf8"), "původní klíč\n");
  });

  test("without --run or without slepe.json it exits non-zero and says what is missing", () => {
    const root = freshRoot();
    mkdirSync(root, { recursive: true });

    const noRun = runHelper("blind", "--root", root);
    const noInput = runHelper("blind", "--root", root, "--run", "2026-11-24");

    assert.notEqual(noRun.code, 0);
    assert.match(noRun.output, /--run/);
    assert.notEqual(noInput.code, 0);
    assert.match(noInput.output, /slepe\.json/);
  });
});

function writeKey(root: string, run: string, candidates: Array<[string, "pipeline" | "baseline"]>): void {
  mkdirSync(path.join(root, "runs"), { recursive: true });
  const key = { run, candidates: candidates.map(([id, origin]) => ({ id, origin, title: `Nápad ${id}` })) };
  writeFileSync(keyPath(root, run), `${JSON.stringify(key, null, 2)}\n`);
}

function withLessons(verdictLines: string[]): string {
  const root = freshRoot();
  mkdirSync(root, { recursive: true });
  writeFileSync(
    path.join(root, "lessons.md"),
    ["# Poučení", "", "## A. Opakované výtky", "", "- Výtka (běhy: 2026-11-24)", "", "## B. Verdikty rodiny", "", ...verdictLines, ""].join("\n"),
  );
  return root;
}

/** Řádek tabulky `evaluate` pro jednu stranu jako čísla: navrženo, chtěla, použila, nechtěla, bez odpovědi. */
function tableRow(output: string, side: string): number[] {
  const line = output.split(/\r?\n/).find((l) => l.startsWith(`| ${side} |`));
  assert.ok(line, `chybí řádek ${side} v:\n${output}`);
  return line.split("|").slice(2, -1).map((cell) => Number(cell.trim()));
}

describe("ideation evaluate", () => {
  test("sums both sides across runs and counts a missing verdict as no answer, not as unwanted", () => {
    const root = withLessons([
      "- 2026-11-24 K1 | Nápad K1 | chtějí | ušetří telefonát",
      "- 2026-11-24 K2 | Nápad K2 | nechtějí | WhatsApp stačí",
      "- 2026-11-24 K3 | Nápad K3 | použili | přidali první položku",
      "- 2026-12-22 K1 | Nápad K1 | chtějí | babička se ptala",
      "- 2026-12-22 K2 | Nápad K2 | použili | používají každý víkend",
    ]);
    writeKey(root, "2026-11-24", [["K1", "pipeline"], ["K2", "baseline"], ["K3", "pipeline"], ["K4", "baseline"]]);
    writeKey(root, "2026-12-22", [["K1", "baseline"], ["K2", "pipeline"], ["K3", "pipeline"]]);

    const { code, output } = runHelper("evaluate", "--root", root);

    assert.equal(code, 0, output);
    assert.match(output, /2026-11-24, 2026-12-22/);
    // navrženo, chtěla (i použila), použila, nechtěla, bez odpovědi
    assert.deepEqual(tableRow(output, "pipeline"), [4, 3, 2, 0, 1]);
    assert.deepEqual(tableRow(output, "baseline"), [3, 1, 0, 1, 1]);
  });

  test("reads verdict lines written in the exact format the check template documents", () => {
    const root = freshRoot();
    runHelper("check", "--root", root);
    const lessonsPath = path.join(root, "lessons.md");
    const template = readFileSync(lessonsPath, "utf8");
    assert.match(template, /`- <běh> <K-ID> \| <název> \| chtějí \/ nechtějí \/ použili \| <důvod>`/);
    const verdicts = ["- 2026-11-24 K2 | Nápad K2 | použili | zapsali první předávku", "- 2026-11-24 K1 | Nápad K1 | nechtějí | zbytečné"];
    writeFileSync(lessonsPath, `${template}${verdicts.join("\n")}\n`);
    writeKey(root, "2026-11-24", [["K1", "pipeline"], ["K2", "baseline"]]);

    const { code, output } = runHelper("evaluate", "--root", root);

    assert.equal(code, 0, output);
    assert.deepEqual(tableRow(output, "pipeline"), [1, 0, 0, 1, 0]);
    assert.deepEqual(tableRow(output, "baseline"), [1, 1, 1, 0, 0]);
  });

  test("reports a verdict whose K-ID or run has no key and leaves it out of the table", () => {
    const root = withLessons([
      "- 2026-11-24 K1 | Nápad K1 | chtějí | ano",
      "- 2026-11-24 K9 | Překlep | chtějí | K9 v klíči není",
      "- 2026-10-01 K1 | Starý běh | použili | běh bez klíče",
    ]);
    writeKey(root, "2026-11-24", [["K1", "pipeline"], ["K2", "baseline"]]);

    const { code, output } = runHelper("evaluate", "--root", root);

    assert.equal(code, 0, output);
    assert.deepEqual(tableRow(output, "pipeline"), [1, 1, 0, 0, 0]);
    assert.deepEqual(tableRow(output, "baseline"), [1, 0, 0, 0, 1]);
    assert.match(output, /Nezapočteno.*\n.*2026-11-24 K9/);
    assert.match(output, /2026-11-24 K9: K-ID není v klíči běhu/);
    assert.match(output, /2026-10-01 K1: běh nemá klíč/);
  });

  test("an unrecognised verdict or a malformed line is reported and the candidate stays without an answer", () => {
    const root = withLessons([
      "- 2026-11-24 K1 | Nápad K1 | možná | ještě neví",
      "- 2026-11-24 K2 | Nápad K2 |  | zeptám se v neděli",
      "- 2026-11-24 K3 chtějí",
    ]);
    writeKey(root, "2026-11-24", [["K1", "pipeline"], ["K2", "baseline"], ["K3", "pipeline"]]);

    const { code, output } = runHelper("evaluate", "--root", root);

    assert.equal(code, 0, output);
    assert.deepEqual(tableRow(output, "pipeline"), [2, 0, 0, 0, 2]);
    assert.deepEqual(tableRow(output, "baseline"), [1, 0, 0, 0, 1]);
    assert.match(output, /2026-11-24 K1: neznámý verdikt „možná“/);
    assert.match(output, /„- 2026-11-24 K3 chtějí“: řádek není ve formátu/);
    assert.doesNotMatch(output, /2026-11-24 K2:/);
  });

  test("a second verdict for the same candidate is reported and the last one counts", () => {
    const root = withLessons(["- 2026-11-24 K1 | Nápad K1 | chtějí | ano", "- 2026-11-24 K1 | Nápad K1 | použili | po měsíci"]);
    writeKey(root, "2026-11-24", [["K1", "pipeline"]]);

    const { code, output } = runHelper("evaluate", "--root", root);

    assert.equal(code, 0, output);
    assert.deepEqual(tableRow(output, "pipeline"), [1, 1, 1, 0, 0]);
    assert.match(output, /2026-11-24 K1: verdikt je tu víckrát, počítá se poslední/);
  });

  test("without lessons.md, its section B or any key it exits non-zero and says what is missing", () => {
    const noLessons = freshRoot();
    writeKey(noLessons, "2026-11-24", [["K1", "pipeline"]]);
    const noSection = freshRoot();
    mkdirSync(noSection, { recursive: true });
    writeFileSync(path.join(noSection, "lessons.md"), "# Poučení\n\n## A. Opakované výtky\n\n- 2026-11-24 K1 | Nápad K1 | chtějí | ano\n");
    writeKey(noSection, "2026-11-24", [["K1", "pipeline"]]);
    const noKey = withLessons(["- 2026-11-24 K1 | Nápad K1 | chtějí | ano"]);

    const results = [noLessons, noSection, noKey].map((root) => runHelper("evaluate", "--root", root));

    for (const { code } of results) assert.notEqual(code, 0);
    assert.match(results[0].output, /lessons\.md/);
    assert.match(results[1].output, /## B\. Verdikty rodiny/);
    assert.match(results[2].output, /klíč/);
  });

  test("a key that is not valid JSON or has the wrong shape exits non-zero and names the file", () => {
    const broken = withLessons([]);
    mkdirSync(path.join(broken, "runs"), { recursive: true });
    writeFileSync(keyPath(broken, "2026-11-24"), "{ nedopsáno");
    const wrongShape = withLessons([]);
    mkdirSync(path.join(wrongShape, "runs"), { recursive: true });
    writeFileSync(keyPath(wrongShape, "2026-11-24"), JSON.stringify({ run: "2026-11-24", candidates: [{ id: "K1", origin: "jiná" }] }));

    for (const root of [broken, wrongShape]) {
      const { code, output } = runHelper("evaluate", "--root", root);
      assert.equal(code, 1, output);
      assert.match(output, /2026-11-24\.klic\.json/);
    }
  });
});
