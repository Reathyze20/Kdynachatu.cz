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

Oba seznamy návrhů z jeho výstupu ukaž uživateli odděleně a počkej na odpověď:

- **Nové kódy** (signál zatím bez kódu): obecný souhlas („schvaluji“) platí pro celý seznam.
- **Překódování** (signál, který kód už má): platí jen návrh, u kterého uživatel výslovně jmenuje ID signálu („S-6 na offline ano“). Obecný souhlas se vztahuje jen na nové kódy, takže signál bez výslovného souhlasu zůstává ve svém shluku.

Po odpovědi:

1. Schválené kódy zapiš do sloupce Shluk v `<kořen>/signals.md`. Signál s neschváleným novým kódem zůstane v tomto běhu bez shluku.
2. Finální shluky zapiš do `<kořen>/shluky.md` (přepiš ho) ve formátu bloků z `ukotveni.md`: schválené signály přesuň do bloků jejich kódů, pro nový kód bez bloku založ blok s potíží z návrhu.
3. Spusť `npm run --silent ideation -- rank --root <kořen>`. Helper řadí podle signálů rodiny `S-n`, aby jejich témata nepřehlušila issues od správce. Při nenulovém exit kódu oprav `shluky.md` podle hlášky helperu a spusť znovu.

Hotovo, když máš shrnutí signálů a shluky v pořadí z helperu; toto pořadí platí pro kroky 2 a 3 i pro výstup.

### 2. Nezávislé generování (8 generátorů)

Rozděl čočky a modely podle [generovani.md](generovani.md) a spusť všech 8 generátorů najednou. Každý dostane jen svůj prompt, žádný sdílený kontext. Hotovo, když máš výstup od každého generátoru, který doběhl.

### 3. Deduplikace (1 subagent)

Od každého generátoru vezmi nejvýš jeho prvních 5 nápadů v pořadí, v jakém je vrátil; generátory počet nedodržují spolehlivě. Kolik nápadů a u kterého generátoru jsi odřízl, uveď v Poznámkách výstupu.

Spusť jednoho subagenta (`general-purpose`) s promptem z [deduplikace.md](deduplikace.md), s těmito nápady a se shrnutím signálů a seřazenými shluky z kroku 1. Hotovo, když máš kandidáty (nejvýš 10) se štítkem Navrhlo, seznam „posiluje #n“ a vyřazené s důvody.

### Závěr: výstup

Zapiš `<kořen>/runs/<RRRR-MM-DD>.md` podle [vystup.md](vystup.md); když soubor existuje, přidej k datu `-2`, `-3`… Uživateli vypiš cestu k souboru a počty z hlavičky. Hotovo, když soubor existuje a každý kandidát v něm má aspoň jeden odkaz na signál (`S-n` nebo `#n`).
