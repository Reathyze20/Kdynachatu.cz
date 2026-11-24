/**
 * Guard tykání v backendových hláškách (#457, spec #445). Aplikace tyká všude, i v chybách
 * z API, které frontend zobrazuje, a v e-mailech (CODING_STANDARDS.md). Tento modul je čistá
 * statická analýza: vytáhne ze zdrojáků řetězcové literály (komentáře přeskočí), vynechá
 * interní logy (`logger.*`, `console.*`) a v ostatních hledá formální tvary oslovení.
 * Test `informalAddress.test.ts` ho pouští nad backendovými zdrojáky v `npm run test:backend`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Adresáře s kódem, jehož texty vidí uživatel (API odpovědi, validace, e-maily). */
export const SCANNED_DIRS = ["src/backend", "src/middleware", "src/validators", "src/utils", "src/config"];

export interface StringLiteral {
  /** Řádek (od 1), na kterém literál začíná. */
  line: number;
  text: string;
}

const isIdentChar = (ch: string) => /[\p{L}\p{N}_$]/u.test(ch);

/**
 * Lomítko začíná regex literál, když za předchozím významným znakem nemůže stát dělení
 * (operátor, otevírací závorka, začátek souboru nebo klíčové slovo jako `return`).
 */
function slashStartsRegex(src: string, i: number): boolean {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j--;
  if (j < 0) return true;
  const prev = src[j];
  if (isIdentChar(prev)) {
    let k = j;
    while (k >= 0 && isIdentChar(src[k])) k--;
    return /^(return|typeof|case|in|of|delete|void|throw|new|yield|await)$/.test(src.slice(k + 1, j + 1));
  }
  return !/[)\]}]/.test(prev);
}

/**
 * Vrátí všechny řetězcové literály souboru ('…', "…", `…`). Komentáře a regex literály
 * přeskočí. Z template literálu bere jen statické části, výrazy `${…}` prochází rekurzivně,
 * takže řetězce uvnitř výrazu se najdou jako samostatné literály.
 */
export function extractStringLiterals(src: string): StringLiteral[] {
  const out: StringLiteral[] = [];
  let line = 1;
  let i = 0;

  const advance = () => {
    if (src[i] === "\n") line++;
    i++;
  };

  const readQuoted = (quote: string) => {
    const startLine = line;
    let text = "";
    advance(); // otevírací uvozovka
    while (i < src.length && src[i] !== quote && src[i] !== "\n") {
      if (src[i] === "\\") {
        advance();
        if (i < src.length) {
          text += src[i];
          advance();
        }
        continue;
      }
      text += src[i];
      advance();
    }
    advance(); // zavírací uvozovka
    out.push({ line: startLine, text });
  };

  const readTemplate = () => {
    const startLine = line;
    let text = "";
    advance(); // `
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") {
        advance();
        if (i < src.length) {
          text += src[i];
          advance();
        }
        continue;
      }
      if (src[i] === "$" && src[i + 1] === "{") {
        // Statická část před výrazem; výraz nahradí mezera, ať se nespojí slova.
        text += " ";
        advance();
        advance();
        readCode("}");
        advance(); // }
        continue;
      }
      text += src[i];
      advance();
    }
    advance(); // `
    out.push({ line: startLine, text });
  };

  const skipRegex = () => {
    advance(); // /
    let inClass = false;
    while (i < src.length && src[i] !== "\n") {
      const ch = src[i];
      if (ch === "\\") {
        advance();
        advance();
        continue;
      }
      if (ch === "[") inClass = true;
      else if (ch === "]") inClass = false;
      else if (ch === "/" && !inClass) break;
      advance();
    }
    advance(); // zavírací /
  };

  /** Čte kód až po neuzavřený znak `until` (pro výrazy v template literálu) nebo do konce. */
  function readCode(until?: string) {
    let depth = 0;
    while (i < src.length) {
      const ch = src[i];
      if (until && ch === until && depth === 0) return;
      if (ch === "{") depth++;
      else if (ch === "}") depth--;

      if (ch === "/" && src[i + 1] === "/") {
        while (i < src.length && src[i] !== "\n") advance();
      } else if (ch === "/" && src[i + 1] === "*") {
        advance();
        advance();
        while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) advance();
        advance();
        advance();
      } else if (ch === "'" || ch === '"') {
        readQuoted(ch);
      } else if (ch === "`") {
        readTemplate();
      } else if (ch === "/" && slashStartsRegex(src, i)) {
        skipRegex();
      } else {
        advance();
      }
    }
  }

  readCode();
  return out;
}

/** Interní log: řádek, na kterém literál začíná, volá `logger.*` nebo `console.*`. */
const LOG_CALL = /\b(logger|console)\.\w+\s*\(/;

/** Formální zájmena (vy): „Váš účet“, „Poslali jsme vám“, „bez vás“. */
const FORMAL_PRONOUN = /(?<![\p{L}])(váš|vaše|vašeho|vašemu|vaším|vaší|vašich|vašim|vašimi|vám|vás|vámi)(?![\p{L}])/giu;

/**
 * Slovesa ve 2. osobě množného čísla končí na „-te“ (Kontaktujte, Zkuste, můžete, jste).
 * Obecné pravidlo „slovo na -te“ platí jen pro české věty (literál s mezerou a diakritikou),
 * jinak by chytalo angličtinu (`must-revalidate`, `/:id/vote`) a vývojářské popisy bez
 * diakritiky v OpenAPI. Identifikátory v camelCase (`startDate`) se přeskočí.
 */
const SECOND_PERSON_PLURAL = /(?<![\p{L}])(\p{L}{2,}te)(?![\p{L}])/giu;
const CZECH_DIACRITIC = /[áčďéěíňóřšťúůýž]/iu;
const CAMEL_CASE = /^\p{L}+\p{Lu}/u;

/** Nejčastější vykání bez diakritiky; hlídá se i v textech, kde diakritika chybí. */
const FORMAL_ASCII = /(?<![\p{L}])(zkuste|kontaktujte|zkontrolujte|zadejte|vyberte|pouzijte|muzete|nemate|jste|budete|chcete)(?![\p{L}])/giu;

/** Anglická slova na „-te“, která se objeví i v české větě (názvy akcí, polí). */
const NOT_FORMAL_TE = new Set([
  "complete", "create", "date", "delete", "invite", "note", "private", "quote", "remote",
  "route", "site", "state", "template", "update", "validate", "write",
]);

const isCzechSentence = (text: string) => /\s/.test(text.trim()) && CZECH_DIACRITIC.test(text);

/** Vrátí formální tvary oslovení nalezené v textu (prázdné pole = text tyká nebo neoslovuje). */
export function findFormalAddress(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(FORMAL_PRONOUN)) found.add(m[1]);
  for (const m of text.matchAll(FORMAL_ASCII)) found.add(m[1]);
  if (isCzechSentence(text)) {
    for (const m of text.matchAll(SECOND_PERSON_PLURAL)) {
      const word = m[1];
      if (!CAMEL_CASE.test(word) && !NOT_FORMAL_TE.has(word.toLowerCase())) found.add(word);
    }
  }
  return [...found];
}

export interface FormalAddressHit {
  file: string;
  line: number;
  words: string[];
  text: string;
}

/** Projde zdroják jednoho souboru a vrátí uživatelské literály s formálním oslovením. */
export function scanSource(file: string, src: string): FormalAddressHit[] {
  const lines = src.split("\n");
  const hits: FormalAddressHit[] = [];
  for (const literal of extractStringLiterals(src)) {
    if (LOG_CALL.test(lines[literal.line - 1] ?? "")) continue;
    const words = findFormalAddress(literal.text);
    if (words.length > 0) hits.push({ file, line: literal.line, words, text: literal.text });
  }
  return hits;
}

/** Backendové produkční zdrojáky (`.ts`), bez testů. Cesty relativně ke kořeni repa, s `/`. */
export function listScannedFiles(root = PROJECT_ROOT): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (rel.endsWith(".ts") && !/\.(i?test|d)\.ts$/.test(rel)) files.push(rel);
    }
  };
  for (const dir of SCANNED_DIRS) walk(dir);
  return files.sort();
}
