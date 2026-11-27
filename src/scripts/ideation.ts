/**
 * Deterministický helper skillu `/ideation` (#367): `tsx src/scripts/ideation.ts <check|rank|pairwise|blind|evaluate> [--root <dir>]`.
 * `check` založí chybějící šablony (existující nikdy nepřepíše) a pod minimem ručních signálů skončí
 * exit kódem 1 s počtem chybějících. `rank` vypíše bloky shluků z `shluky.md` seřazené podle počtu
 * ručních signálů `S-n`; počet issues rozhoduje jen při shodě (#386). `pairwise` sečte verdikty
 * párového kola z `parove.json` a vybere nejvýš 5 postupujících (#370). `blind --run <běh> [--seed <n>]`
 * zamíchá kandidáty pipeline a baseline ze `slepe.json` do K1…Kn a klíč původu zapíše do
 * `runs/<běh>.klic.json` (#371). `evaluate` spojí všechny klíče s verdikty rodiny ze sekce B
 * `lessons.md` a vypíše tabulku pipeline vs. baseline (#372). Bez sítě, DB a `.env`. Další podpříkazy
 * patří do `COMMANDS`.
 */
import { randomInt } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const MIN_SIGNALS = 10;

const SIGNALS_TEMPLATE = `# Signály od rodiny

Ruční zpětná vazba rodiny pro \`/ideation\`. Složka \`.ideation/\` je gitignored a zůstává jen na tomto počítači.

Každý signál je jeden řádek tabulky s ID \`S-<n>\` (čísluj dál od posledního):
- **Role** místo jména (prarodič, rodič, dospívající, správce chaty…).
- **Zdroj:** osobně / WhatsApp / telefon.
- **Parafráze** vlastními slovy, bez jmen a bez citací.
- **Shluk:** krátký kód (např. \`predavka\`). Prázdný nechá navrhnout \`/ideation\` ke schválení.

| ID | Datum | Role | Zdroj | Parafráze | Shluk |
|---|---|---|---|---|---|
`;

const LESSONS_TEMPLATE = `# Poučení z /ideation

## A. Opakované výtky

Výtky kritika, které se objevily aspoň ve 2 bězích. Zapisuje se sem jen po potvrzení správcem. Generátoři tuto sekci nevidí.

## B. Verdikty rodiny

Jeden řádek na kandidáta, vyplňuje správce a čte \`/ideation vyhodnoť\`: \`- <běh> <K-ID> | <název> | chtějí / nechtějí / použili | <důvod>\`

Běh je název souboru v \`runs/\` bez přípony (např. \`2026-11-24\`), K-ID a název jsou ze sekce Kandidáti tohoto běhu. Verdikt je právě jedno ze slov chtějí, nechtějí, použili; \`použili\` se počítá i jako \`chtějí\`. Kandidát bez řádku nebo s prázdným verdiktem je „bez odpovědi“. Když rodina funkci později použije, přepiš verdikt na existujícím řádku.
`;

const SIGNALS_FILE = "signals.md";
const TEMPLATES: ReadonlyArray<{ file: string; content: string }> = [
  { file: SIGNALS_FILE, content: SIGNALS_TEMPLATE },
  { file: "lessons.md", content: LESSONS_TEMPLATE },
];

const SIGNAL_ROW = /^\|\s*S-\d+\s*\|/;

type CommandResult = { code: number; lines: string[] };

type Command = (root: string, args: string[]) => CommandResult;

function check(root: string): CommandResult {
  const lines: string[] = [];
  mkdirSync(root, { recursive: true });
  for (const { file, content } of TEMPLATES) {
    const target = path.join(root, file);
    if (existsSync(target)) continue;
    writeFileSync(target, content);
    lines.push(`Založeno: ${target}`);
  }

  const signalsPath = path.join(root, SIGNALS_FILE);
  const count = readFileSync(signalsPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => SIGNAL_ROW.test(line)).length;

  if (count < MIN_SIGNALS) {
    lines.push(
      `Ručních signálů je ${count} z minima ${MIN_SIGNALS}, chybí ${MIN_SIGNALS - count}. Doplň je do ${signalsPath} a spusť znovu.`,
    );
    return { code: 1, lines };
  }
  lines.push(`Ručních signálů: ${count} (minimum ${MIN_SIGNALS}). Vstup je v pořádku.`);
  return { code: 0, lines };
}

const CLUSTERS_FILE = "shluky.md";

function countIds(block: string, pattern: RegExp): number {
  const signalsLine = block.split(/\r?\n/).find((line) => line.startsWith("- Signály:")) ?? "";
  return signalsLine.match(pattern)?.length ?? 0;
}

function rank(root: string): CommandResult {
  const clustersPath = path.join(root, CLUSTERS_FILE);
  if (!existsSync(clustersPath)) {
    return { code: 1, lines: [`Chybí ${clustersPath}. Zapiš do něj finální shluky z kroku 1 a spusť znovu.`] };
  }

  const blocks = readFileSync(clustersPath, "utf8")
    .split(/^(?=### )/m)
    .filter((block) => block.startsWith("### "))
    .map((block) => block.trimEnd());
  if (blocks.length === 0) return { code: 1, lines: [`V ${clustersPath} není žádný blok „### <kód> – …“.`] };

  // Array.prototype.sort je stabilní, takže úplná shoda zachová pořadí ze souboru.
  const ranked = blocks
    .map((block) => ({ block, familySignals: countIds(block, /\bS-\d+/g), issues: countIds(block, /#\d+/g) }))
    .sort((a, b) => b.familySignals - a.familySignals || b.issues - a.issues);
  return { code: 0, lines: [ranked.map(({ block }) => block).join("\n\n")] };
}

const PAIRWISE_FILE = "parove.json";
const MAX_ADVANCING = 5;
const MAX_CANDIDATES = 10;
const JUDGES = [1, 2, 3];

const PairwiseInput = z.object({
  candidates: z.array(z.string().min(1)),
  verdicts: z.array(
    z.object({ judge: z.number().int(), first: z.string(), second: z.string(), winner: z.string() }),
  ),
});

/** Jedno uspořádané posouzení: rozhodčí viděl `first` jako prvního a `second` jako druhého. */
function orderedPair(judge: number, first: string, second: string): string {
  return `rozhodčí ${judge}: ${first} před ${second}`;
}

function pairwiseInputError({ candidates, verdicts }: z.infer<typeof PairwiseInput>): string | undefined {
  if (candidates.length <= MAX_ADVANCING) {
    return `Párové kolo se spouští jen při víc než ${MAX_ADVANCING} kandidátech (je jich ${candidates.length}). Postupují všichni.`;
  }
  if (candidates.length > MAX_CANDIDATES) return `Kandidátů je ${candidates.length}, krok 4 jich pouští nejvýš ${MAX_CANDIDATES}.`;
  if (new Set(candidates).size !== candidates.length) return "Kód kandidáta se v `candidates` opakuje.";

  const seen = new Set<string>();
  for (const { judge, first, second, winner } of verdicts) {
    if (!JUDGES.includes(judge)) return `Rozhodčí ${judge}: párové kolo má nejvýš ${JUDGES.length} rozhodčí (1–${JUDGES.length}).`;
    const label = orderedPair(judge, first, second);
    for (const id of [first, second, winner]) {
      if (!candidates.includes(id)) return `${label}: neznámý kandidát ${id}.`;
    }
    if (first === second) return `${label}: dvojice musí mít dva různé kandidáty.`;
    if (winner !== first && winner !== second) return `${label}: vítěz ${winner} není v dvojici.`;
    if (seen.has(label)) return `${label}: verdikt je tu dvakrát.`;
    seen.add(label);
  }
  return undefined;
}

/**
 * Rozhodčí dává výhru jen tehdy, když vybral stejného kandidáta v obou pořadích dvojice; tím se
 * potlačí poziční zaujatost. Pořadí: počet výher, při shodě pořadí v `candidates` (z kroku 3).
 */
function pairwise(root: string): CommandResult {
  const inputPath = path.join(root, PAIRWISE_FILE);
  if (!existsSync(inputPath)) {
    return { code: 1, lines: [`Chybí ${inputPath}. Zapiš do něj kandidáty a verdikty rozhodčích z kroku 5 a spusť znovu.`] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(inputPath, "utf8"));
  } catch {
    return { code: 1, lines: [`${inputPath} není platný JSON.`] };
  }
  const parsed = PairwiseInput.safeParse(raw);
  if (!parsed.success) {
    return { code: 1, lines: [`${inputPath} nemá tvar { candidates: string[], verdicts: { judge, first, second, winner }[] }.`] };
  }
  const error = pairwiseInputError(parsed.data);
  if (error) return { code: 1, lines: [error] };

  const { candidates, verdicts } = parsed.data;
  const winnerOf = new Map(verdicts.map((v) => [orderedPair(v.judge, v.first, v.second), v.winner]));
  const wins = new Map(candidates.map((id) => [id, 0]));
  const missing: string[] = [];

  for (const judge of JUDGES) {
    if (!verdicts.some((v) => v.judge === judge)) {
      missing.push(`rozhodčí ${judge}: žádný verdikt`);
      continue;
    }
    candidates.forEach((a, i) => {
      for (const b of candidates.slice(i + 1)) {
        const ab = winnerOf.get(orderedPair(judge, a, b));
        const ba = winnerOf.get(orderedPair(judge, b, a));
        if (ab === undefined) missing.push(orderedPair(judge, a, b));
        if (ba === undefined) missing.push(orderedPair(judge, b, a));
        if (ab !== undefined && ab === ba) wins.set(ab, (wins.get(ab) ?? 0) + 1);
      }
    });
  }

  // Array.prototype.sort je stabilní, takže shoda výher zachová pořadí z kroku 3.
  const winsOf = (id: string) => wins.get(id) ?? 0;
  const ranked = [...candidates].sort((a, b) => winsOf(b) - winsOf(a));
  const advancing = ranked.slice(0, MAX_ADVANCING);
  const lines = [
    `Postupují: ${advancing.join(", ")}`,
    ...ranked.map((id, i) => `${i + 1}. ${id}: ${winsOf(id)} výher${i < MAX_ADVANCING ? " (postupuje)" : ""}`),
  ];
  const cutoff = winsOf(ranked[MAX_ADVANCING - 1]);
  const tied = ranked.filter((id) => winsOf(id) === cutoff);
  if (winsOf(ranked[MAX_ADVANCING]) === cutoff) {
    lines.push(`Shoda na hranici: ${tied.join(", ")} mají po ${cutoff} výhrách, o postupu rozhodlo pořadí z kroku 3.`);
  }
  if (missing.length > 0) lines.push(`Bez verdiktu: ${missing.join("; ")}`);
  return { code: 0, lines };
}

const BLIND_FILE = "slepe.json";
const MAX_PER_SIDE = 5;
const RUN_NAME = /^\d{4}-\d{2}-\d{2}(-\d+)?$/;

// `.strict()` odmítne navíc pole (třeba původ nebo štítek Navrhlo), která by ve výstupu prozradila stranu.
const BlindCandidate = z
  .object({
    title: z.string().min(1),
    summary: z.string().min(1),
    evidence: z.string().min(1),
    labels: z.string().min(1),
    objections: z.array(z.string().min(1)).length(3),
    question: z.string().min(1),
  })
  .strict();

const BlindInput = z
  .object({ pipeline: z.array(BlindCandidate), baseline: z.array(BlindCandidate) })
  .strict();

type Origin = "pipeline" | "baseline";
type Candidate = z.infer<typeof BlindCandidate>;

function flagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

/** Mulberry32: malý deterministický generátor, aby stejný seed dal v testu stejné zamíchání. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function renderCandidate(id: string, c: Candidate): string {
  return [
    `### ${id} – ${c.title}`,
    c.summary,
    "",
    `- Důkaz: ${c.evidence}`,
    `- Štítky: ${c.labels}`,
    "- Námitky:",
    ...c.objections.map((objection, i) => `  ${i + 1}. ${objection}`),
    "",
    "Otázka pro rodinu (ke zkopírování):",
    "",
    `> ${c.question}`,
  ].join("\n");
}

/**
 * Slepé míchání: stdout nese jen K-ID a obsah kandidátů, původ jde jen do klíče. Vstup `slepe.json`
 * po zápisu klíče smaže, aby původ v kořeni neležel na dvou místech.
 */
function blind(root: string, args: string[]): CommandResult {
  const runName = flagValue(args, "--run");
  if (!runName || !RUN_NAME.test(runName)) {
    return { code: 2, lines: ["blind potřebuje --run <RRRR-MM-DD> nebo <RRRR-MM-DD-n>, název běhu, ke kterému klíč patří."] };
  }
  const seedFlag = flagValue(args, "--seed");
  if (seedFlag !== undefined && !/^\d+$/.test(seedFlag)) return { code: 2, lines: ["--seed musí být nezáporné celé číslo."] };

  const inputPath = path.join(root, BLIND_FILE);
  if (!existsSync(inputPath)) {
    return { code: 1, lines: [`Chybí ${inputPath}. Zapiš do něj kandidáty pipeline a baseline a spusť znovu.`] };
  }
  const keyPath = path.join(root, "runs", `${runName}.klic.json`);
  if (existsSync(keyPath)) {
    return { code: 1, lines: [`Klíč ${keyPath} už existuje a nepřepisuje se. Zvol další název běhu (-2, -3…).`] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(inputPath, "utf8"));
  } catch {
    return { code: 1, lines: [`${inputPath} není platný JSON.`] };
  }
  const parsed = BlindInput.safeParse(raw);
  if (!parsed.success) {
    return {
      code: 1,
      lines: [
        `${inputPath} nemá tvar { pipeline: K[], baseline: K[] }, K = { title, summary, evidence, labels, objections: [3 otázky], question } bez dalších polí.`,
      ],
    };
  }
  const sides: Array<[Origin, Candidate[]]> = [
    ["pipeline", parsed.data.pipeline],
    ["baseline", parsed.data.baseline],
  ];
  for (const [origin, list] of sides) {
    if (list.length > MAX_PER_SIDE) return { code: 1, lines: [`Kandidátů ${origin} je ${list.length}, na stranu jich smí být nejvýš ${MAX_PER_SIDE}.`] };
  }
  const all = sides.flatMap(([origin, list]) => list.map((c) => ({ origin, c })));
  if (all.length === 0) return { code: 1, lines: ["Ve slepe.json není žádný kandidát."] };

  const seed = seedFlag === undefined ? randomInt(2 ** 32) : Number(seedFlag);
  const mixed = shuffle(all, seededRandom(seed)).map((entry, i) => ({ id: `K${i + 1}`, ...entry }));

  mkdirSync(path.dirname(keyPath), { recursive: true });
  const key = { run: runName, candidates: mixed.map(({ id, origin, c }) => ({ id, origin, title: c.title })) };
  writeFileSync(keyPath, `${JSON.stringify(key, null, 2)}\n`);
  rmSync(inputPath);
  return { code: 0, lines: [mixed.map(({ id, c }) => renderCandidate(id, c)).join("\n\n")] };
}

const KEY_SUFFIX = ".klic.json";
const VERDICT_HEADING = /^## B\./;
const VERDICT_LINE = /^- (\S+) (K\d+) \| [^|]*\| ([^|]*)(\|.*)?$/;
const VERDICTS = ["chtějí", "nechtějí", "použili"] as const;
type Verdict = (typeof VERDICTS)[number];

const BlindKey = z.object({
  run: z.string(),
  candidates: z.array(z.object({ id: z.string(), origin: z.enum(["pipeline", "baseline"]), title: z.string() })),
});

/** Řádky sekce B `lessons.md` od nadpisu `## B.` do dalšího nadpisu `## `; bez nadpisu `undefined`. */
function verdictSection(lessons: string): string[] | undefined {
  const lines = lessons.split(/\r?\n/);
  const start = lines.findIndex((line) => VERDICT_HEADING.test(line));
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return end === -1 ? rest : rest.slice(0, end);
}

type RunKey = { run: string; candidates: z.infer<typeof BlindKey>["candidates"] };

/** Všechny klíče `runs/*.klic.json` seřazené podle názvu běhu, nebo hláška, co je špatně. */
function readKeys(runsDir: string): RunKey[] | string {
  const files = existsSync(runsDir) ? readdirSync(runsDir).filter((f) => f.endsWith(KEY_SUFFIX)).sort() : [];
  if (files.length === 0) return `V ${runsDir} není žádný klíč *${KEY_SUFFIX}. Vyhodnocovat jde až po běhu /ideation.`;
  const keys: RunKey[] = [];
  for (const file of files) {
    const keyPath = path.join(runsDir, file);
    let parsed: ReturnType<typeof BlindKey.safeParse>;
    try {
      parsed = BlindKey.safeParse(JSON.parse(readFileSync(keyPath, "utf8")));
    } catch {
      return `${keyPath} není platný JSON.`;
    }
    if (!parsed.success) return `${keyPath} nemá tvar klíče { run, candidates: [{ id, origin: pipeline / baseline, title }] }.`;
    // Běh se jmenuje podle souboru: tak ho správce vidí v runs/ a tak ho píše do sekce B.
    keys.push({ run: file.slice(0, -KEY_SUFFIX.length), candidates: parsed.data.candidates });
  }
  return keys;
}

/**
 * Odkrytí po bězích: spojí klíče `runs/*.klic.json` s verdikty rodiny ze sekce B `lessons.md`.
 * Kandidát bez verdiktu je „bez odpovědi“, ne „nechtěla“; „chtěla“ zahrnuje i „použila“.
 * Verdikt, který nejde přiřadit, se do tabulky nepočítá a vypíše se pod ní.
 */
function evaluate(root: string): CommandResult {
  const lessonsPath = path.join(root, "lessons.md");
  if (!existsSync(lessonsPath)) {
    return { code: 1, lines: [`Chybí ${lessonsPath}. Spusť \`check\`, který ho založí, a do sekce B zapiš verdikty rodiny.`] };
  }
  const section = verdictSection(readFileSync(lessonsPath, "utf8"));
  if (section === undefined) return { code: 1, lines: [`V ${lessonsPath} chybí nadpis \`## B. Verdikty rodiny\`.`] };
  const keys = readKeys(path.join(root, "runs"));
  if (typeof keys === "string") return { code: 1, lines: [keys] };

  // Řádek s prázdnou buňkou verdiktu je „bez odpovědi“ a nehlásí se; vše ostatní mimo formát se hlásí.
  const verdicts = new Map<string, Verdict>();
  const problems: string[] = [];
  for (const raw of section) {
    const line = raw.trim();
    if (!line.startsWith("- ")) continue;
    const match = VERDICT_LINE.exec(line);
    if (!match) {
      problems.push(`- „${line}“: řádek není ve formátu \`- <běh> <K-ID> | <název> | <verdikt> | <důvod>\``);
      continue;
    }
    const [, run, id, verdictCell] = match;
    const entry = `${run} ${id}`;
    const verdict = verdictCell.trim().toLowerCase();
    if (verdict === "") continue;
    if (!(VERDICTS as readonly string[]).includes(verdict)) {
      problems.push(`- ${entry}: neznámý verdikt „${verdictCell.trim()}“ (čekám ${VERDICTS.join(" / ")})`);
      continue;
    }
    if (verdicts.has(entry)) problems.push(`- ${entry}: verdikt je tu víckrát, počítá se poslední`);
    verdicts.set(entry, verdict as Verdict);
  }

  const runs = keys.map(({ run }) => run);
  const counted = new Set<string>();
  const counts = {
    pipeline: { proposed: 0, wanted: 0, used: 0, unwanted: 0, noAnswer: 0 },
    baseline: { proposed: 0, wanted: 0, used: 0, unwanted: 0, noAnswer: 0 },
  };
  for (const { run, candidates } of keys) {
    for (const { id, origin } of candidates) {
      const side = counts[origin];
      side.proposed++;
      const verdict = verdicts.get(`${run} ${id}`);
      counted.add(`${run} ${id}`);
      if (verdict === undefined) side.noAnswer++;
      else if (verdict === "nechtějí") side.unwanted++;
      else {
        side.wanted++;
        if (verdict === "použili") side.used++;
      }
    }
  }

  for (const entry of verdicts.keys()) {
    if (counted.has(entry)) continue;
    problems.push(`- ${entry}: ${runs.includes(entry.split(" ")[0]) ? "K-ID není v klíči běhu" : "běh nemá klíč"}`);
  }

  const row = (name: Origin) => {
    const c = counts[name];
    return `| ${name} | ${c.proposed} | ${c.wanted} | ${c.used} | ${c.unwanted} | ${c.noAnswer} |`;
  };
  const notes = problems.length > 0 ? ["", "Nezapočteno (oprav řádek v sekci B):", ...problems] : [];
  return {
    code: 0,
    lines: [
      `Běhy: ${runs.join(", ")} (${runs.length})`,
      "",
      "| Strana | Navrženo | Rodina chtěla | Použila | Nechtěla | Bez odpovědi |",
      "|---|---|---|---|---|---|",
      row("pipeline"),
      row("baseline"),
      "",
      "„Rodina chtěla“ zahrnuje i „použila“. Kandidát bez verdiktu v sekci B je „bez odpovědi“, ne „nechtěla“.",
      ...notes,
    ],
  };
}

const COMMANDS: Record<string, Command> = { check, rank, pairwise, blind, evaluate };

const USAGE = `Použití: tsx src/scripts/ideation.ts <${Object.keys(COMMANDS).join("|")}> [--root <dir>] (výchozí kořen .ideation); blind navíc --run <běh> [--seed <n>]`;

function run(argv: string[]): CommandResult {
  const [name, ...rest] = argv;
  const command = name ? COMMANDS[name] : undefined;
  if (!command) return { code: 2, lines: [USAGE] };

  const rootFlag = rest.indexOf("--root");
  const root = rootFlag === -1 ? ".ideation" : rest[rootFlag + 1];
  if (!root) return { code: 2, lines: [USAGE] };
  return command(path.resolve(root), rest);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { code, lines } = run(process.argv.slice(2));
  const stream = code === 0 ? process.stdout : process.stderr;
  stream.write(`${lines.join("\n")}\n`);
  process.exitCode = code;
}
