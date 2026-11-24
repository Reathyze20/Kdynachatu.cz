/**
 * Deterministický helper skillu `/ideation` (#367): `tsx src/scripts/ideation.ts <check|rank|pairwise|blind> [--root <dir>]`.
 * `check` založí chybějící šablony (existující nikdy nepřepíše) a pod minimem ručních signálů skončí
 * exit kódem 1 s počtem chybějících. `rank` vypíše bloky shluků z `shluky.md` seřazené podle počtu
 * ručních signálů `S-n`; počet issues rozhoduje jen při shodě (#386). `pairwise` sečte verdikty
 * párového kola z `parove.json` a vybere nejvýš 5 postupujících (#370). `blind --run <běh> [--seed <n>]`
 * zamíchá kandidáty pipeline a baseline ze `slepe.json` do K1…Kn a klíč původu zapíše do
 * `runs/<běh>.klic.json` (#371). Bez sítě, DB a `.env`. Další podpříkazy patří do `COMMANDS`.
 */
import { randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

Jeden řádek na kandidáta, vyplňuje správce: \`- <běh> <K-ID> | <název> | chtějí / nechtějí / použili | <důvod>\`
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

function renderCandidate(id: string, c: z.infer<typeof BlindCandidate>): string {
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
  const sides: Array<[Origin, z.infer<typeof BlindCandidate>[]]> = [
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

const COMMANDS: Record<string, Command> = { check, rank, pairwise, blind };

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
