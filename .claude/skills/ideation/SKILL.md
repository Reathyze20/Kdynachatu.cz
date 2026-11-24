---
name: ideation
description: Kandidáti na funkce ze signálů rodiny a GitHub issues do lokálního Markdownu v .ideation/runs/.
disable-model-invocation: true
argument-hint: "[zkouška]"
---

# /ideation

Pipeline, která ze skutečných signálů (ruční zpětná vazba rodiny v `signals.md` a GitHub issues) vytáhne kandidáty na funkce. Spec je issue #367. Běh má kroky 0–3 (kontrola vstupu, ukotvení, nezávislé generování, deduplikace) a závěrečný zápis výstupu; čísla dalších kroků pipeline drží spec. Výstup je jeden lokální soubor; o kandidátech rozhoduje správce, ne pipeline.

## Hranice

Lokální databáze obsahuje produkční data rodiny a autopilot postaví cokoli, co dostane `ready-for-agent`. Proto platí po celý běh, pro tebe i pro každého subagenta:

- Signály bereš jen ze `<kořen>/signals.md` a z GitHub issues **pro čtení** (`gh issue list`, `gh issue view`).
- Zapisuješ jen do `<kořen>/` (gitignored). Na GitHub nezapisuješ nic: žádné `gh issue create` / `edit` / `comment` / `close`, žádné labely, PR ani `gh api` mimo GET. Z `<kořen>/` nic necommituješ.
- Žádné `psql`, `docker`, `prisma`, žádné čtení `.env*`, žádný jiný přístup k databázi.
- Ve výstupech jen role (prarodič, rodič…), nikdy jména.

Na začátek promptu každého subagenta vlož doslova tento blok:

> **Hranice:** Pracuješ read-only. GitHub jen `gh issue list` a `gh issue view`. Žádné `psql`, `docker`, `prisma`, žádné čtení `.env*`, žádný zápis souborů ani na GitHub. Ve výstupu jen role, žádná jména.

## Stropy

Na jeden běh nejvýš: krok 1 = 1 subagent, krok 2 = 8 generátorů, krok 3 = 1 subagent. Subagent, který selže nebo vrátí nepoužitelný výstup, se nenahrazuje: pokračuj s tím, co máš, a uveď to v hlavičce výstupu.

## Postup

### 0. Kořen a kontrola vstupu

- Bez argumentu je kořen `.ideation`.
- `/ideation zkouška` je zkušební běh nad fiktivními signály: kořen `.ideation/zkouska`. Když `.ideation/zkouska/signals.md` neexistuje, zkopíruj do něj `src/scripts/assets/ideation-signals.fixture.md`.

Spusť `npm run --silent ideation -- check --root <kořen>`. Při nenulovém exit kódu vypiš uživateli výstup helperu (kolik signálů chybí, které šablony založil) a běh tím **končí**, bez jediného subagenta. Hotovo, když helper skončil s 0.

### 1. Ukotvení (1 subagent)

Spusť jednoho subagenta (`general-purpose`) s promptem z [ukotveni.md](ukotveni.md).

Návrhy kódů shluků z jeho výstupu ukaž uživateli a počkej na odpověď. Schválené kódy zapiš do sloupce Shluk v `<kořen>/signals.md` a započítej je do shluků; neschválené signály zůstanou v tomto běhu bez shluku. Hotovo, když máš shrnutí signálů a finální seznam shluků seřazený podle velikosti.

### 2. Nezávislé generování (8 generátorů)

Rozděl čočky a modely podle [generovani.md](generovani.md) a spusť všech 8 generátorů najednou. Každý dostane jen svůj prompt, žádný sdílený kontext. Hotovo, když máš výstup od každého generátoru, který doběhl.

### 3. Deduplikace (1 subagent)

Spusť jednoho subagenta (`general-purpose`) s promptem z [deduplikace.md](deduplikace.md) a se všemi nápady z kroku 2. Hotovo, když máš kandidáty (nejvýš 10), seznam „posiluje #n“ a vyřazené.

### Závěr: výstup

Zapiš `<kořen>/runs/<RRRR-MM-DD>.md` podle [vystup.md](vystup.md); když soubor existuje, přidej k datu `-2`, `-3`… Uživateli vypiš cestu k souboru a počty z hlavičky. Hotovo, když soubor existuje a každý kandidát v něm má aspoň jeden odkaz na signál (`S-n` nebo `#n`).
