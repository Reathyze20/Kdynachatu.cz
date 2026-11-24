/**
 * Deterministický helper skillu `/ideation` (#367): `tsx src/scripts/ideation.ts <check|rank> [--root <dir>]`.
 * `check` založí chybějící šablony (existující nikdy nepřepíše) a pod minimem ručních signálů skončí
 * exit kódem 1 s počtem chybějících. `rank` vypíše bloky shluků z `shluky.md` seřazené podle počtu
 * ručních signálů `S-n`; počet issues rozhoduje jen při shodě (#386). Bez sítě, DB a `.env`.
 * Další podpříkazy patří do `COMMANDS`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

type Command = (root: string) => CommandResult;

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

const COMMANDS: Record<string, Command> = { check, rank };

const USAGE = `Použití: tsx src/scripts/ideation.ts <${Object.keys(COMMANDS).join("|")}> [--root <dir>] (výchozí kořen .ideation)`;

function run(argv: string[]): CommandResult {
  const [name, ...rest] = argv;
  const command = name ? COMMANDS[name] : undefined;
  if (!command) return { code: 2, lines: [USAGE] };

  const rootFlag = rest.indexOf("--root");
  const root = rootFlag === -1 ? ".ideation" : rest[rootFlag + 1];
  if (!root) return { code: 2, lines: [USAGE] };
  return command(path.resolve(root));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { code, lines } = run(process.argv.slice(2));
  const stream = code === 0 ? process.stdout : process.stderr;
  stream.write(`${lines.join("\n")}\n`);
  process.exitCode = code;
}
