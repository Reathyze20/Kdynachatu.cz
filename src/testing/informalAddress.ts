/**
 * Guard tykání v backendových hláškách (#457, spec #445). Aplikace tyká všude, i v chybách
 * z API, které frontend zobrazuje, a v e-mailech (CODING_STANDARDS.md). Tento modul je čistá
 * statická analýza: vytáhne ze zdrojáků řetězcové literály (komentáře přeskočí), vynechá
 * argumenty interních logů (`logger.*`, `console.*`) a v ostatních hledá formální oslovení.
 * Test `informalAddress.test.ts` ho pouští nad backendovými zdrojáky v `npm run test:backend`.
 *
 * Známé meze lexeru: regex literál hned za `)` nebo `}` (`if (x) /re/.test(s)`) považuje za
 * dělení. V backendu se takový zápis nevyskytuje; kdyby přibyl, guard spíš zčervená, než aby
 * mlčel, protože čtení řetězců se rozjede.
 */
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "./integration/cabinTenantCoverage";

/** Adresáře s kódem, jehož texty vidí uživatel (API odpovědi, validace, e-maily). */
const SCANNED_DIRS = ["src/backend", "src/middleware", "src/validators", "src/utils", "src/config"];

export interface StringLiteral {
  /** Řádek (od 1), na kterém literál začíná. */
  line: number;
  text: string;
  /** Literál je (i nepřímo) argumentem volání `logger.*(…)` nebo `console.*(…)`. */
  inLogCall: boolean;
}

const isIdentChar = (ch: string) => /[\p{L}\p{N}_$]/u.test(ch);

/** Konec kódu před `(` je jméno logovací funkce (`logger.warn`, `console.error`). */
const LOG_CALLEE = /\b(logger|console)\s*\.\s*\w+\s*$/;

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
 * Vrátí všechny řetězcové literály souboru ('…', "…", `…`) s odstraněnými escapy (`\n` a
 * `\t` se stanou mezerou, `\u00e1` znakem). Komentáře a regex literály přeskočí. Z template
 * literálu bere statické části, výrazy `${…}` prochází rekurzivně, takže řetězce uvnitř
 * výrazu se najdou jako samostatné literály.
 */
export function extractStringLiterals(src: string): StringLiteral[] {
  const out: StringLiteral[] = [];
  /** Pro každou otevřenou `(`: jde o volání logu? */
  const parens: boolean[] = [];
  let line = 1;
  let i = 0;

  const advance = (n = 1) => {
    for (let k = 0; k < n && i < src.length; k++) {
      if (src[i] === "\n") line++;
      i++;
    }
  };

  /** Přečte escape sekvenci na pozici `\` a vrátí znak, který zastupuje. */
  const readEscape = (): string => {
    const ch = src[i + 1] ?? "";
    const hex = ch === "u" && src[i + 2] === "{"
      ? src.slice(i + 3, src.indexOf("}", i))
      : ch === "u" ? src.slice(i + 2, i + 6) : ch === "x" ? src.slice(i + 2, i + 4) : null;
    if (hex === null) {
      advance(2);
      return /[nrt\n]/.test(ch) ? " " : ch;
    }
    advance(2 + hex.length + (src[i + 2] === "{" ? 2 : 0));
    const code = parseInt(hex, 16);
    return Number.isNaN(code) ? "" : String.fromCodePoint(code);
  };

  /** Přečte '…', "…" nebo `…`; výrazy `${…}` v template literálu nahradí mezerou. */
  const readString = (quote: string) => {
    const literal = { line, text: "", inLogCall: parens.includes(true) };
    advance(); // otevírací uvozovka
    while (i < src.length && src[i] !== quote && (quote === "`" || src[i] !== "\n")) {
      if (src[i] === "\\") {
        literal.text += readEscape();
      } else if (quote === "`" && src[i] === "$" && src[i + 1] === "{") {
        literal.text += " ";
        advance(2);
        readCode("}");
        advance(); // }
      } else {
        literal.text += src[i];
        advance();
      }
    }
    advance(); // zavírací uvozovka
    out.push(literal);
  };

  const skipRegex = () => {
    advance(); // /
    let inClass = false;
    while (i < src.length && src[i] !== "\n") {
      const ch = src[i];
      if (ch === "\\") {
        advance(2);
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
        const end = src.indexOf("*/", i + 2);
        advance((end < 0 ? src.length : end + 2) - i);
      } else if (ch === "'" || ch === '"' || ch === "`") {
        readString(ch);
      } else if (ch === "/" && slashStartsRegex(src, i)) {
        skipRegex();
      } else {
        if (ch === "(") parens.push(LOG_CALLEE.test(src.slice(Math.max(0, i - 40), i)));
        else if (ch === ")") parens.pop();
        advance();
      }
    }
  }

  readCode();
  return out;
}

/** Formální zájmena (vy), s diakritikou i bez: „Váš účet“, „Poslali jsme vám“, „vaši schránku“. */
const FORMAL_PRONOUN =
  /(?<![\p{L}\p{N}_])(vy|v[aá]š|v[aá]š[ei]|v[aá]šeho|v[aá]šemu|v[aá]š[ií]m|v[aá]šich|v[aá]šimi|v[aá][ms]|v[aá]mi)(?![\p{L}\p{N}_])/giu;

/**
 * Slovesa ve 2. osobě množného čísla končí na „-te“ (Kontaktujte, Zkuste, můžete, jste).
 * Obecné pravidlo „slovo na -te“ platí jen pro české věty (literál s mezerou a diakritikou),
 * jinak by chytalo angličtinu (`must-revalidate`, `/:id/vote`) a vývojářské popisy bez
 * diakritiky v OpenAPI. Identifikátory v camelCase (`startDate`) se přeskočí.
 */
const SECOND_PERSON_PLURAL = /(?<![\p{L}\p{N}_])(\p{L}{2,}te)(?![\p{L}\p{N}_])/giu;
const CZECH_DIACRITIC = /[áčďéěíňóřšťúůýž]/iu;
const CAMEL_CASE = /^\p{L}+\p{Lu}/u;

/** Nejčastější vykání bez diakritiky; hlídá se i v textech, kde diakritika chybí. */
const FORMAL_ASCII =
  /(?<![\p{L}\p{N}_])(zkuste|kontaktujte|zkontrolujte|zadejte|vyberte|pouzijte|prihlaste|overte|kliknete|muzete|nemate|jste|budete|chcete)(?![\p{L}\p{N}_])/giu;

/** Anglická slova na „-te“, která se smí objevit v české větě (názvy akcí, polí). */
const ENGLISH_TE_WORDS = new Set([
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
      if (!CAMEL_CASE.test(word) && !ENGLISH_TE_WORDS.has(word.toLowerCase())) found.add(word);
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
  const hits: FormalAddressHit[] = [];
  for (const literal of extractStringLiterals(src)) {
    if (literal.inLogCall) continue;
    const words = findFormalAddress(literal.text);
    if (words.length > 0) hits.push({ file, line: literal.line, words, text: literal.text });
  }
  return hits;
}

/** Backendové produkční zdrojáky (`.ts`), bez testů. Cesty relativně ke kořeni repa, s `/`. */
export function listScannedFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(PROJECT_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (rel.endsWith(".ts") && !/\.(i?test|d)\.ts$/.test(rel)) files.push(rel);
    }
  };
  for (const dir of SCANNED_DIRS) walk(dir);
  return files.sort();
}

export { PROJECT_ROOT };
