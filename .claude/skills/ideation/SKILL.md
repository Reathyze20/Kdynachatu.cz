---
name: ideation
description: Kandidáti na funkce ze signálů rodiny a GitHub issues do lokálního Markdownu v .ideation/runs/.
disable-model-invocation: true
argument-hint: "[zkouška]"
---

# /ideation

Pipeline, která ze skutečných signálů (ruční zpětná vazba rodiny v `signals.md` a GitHub issues) vytáhne kandidáty na funkce. Spec je issue #367. Běh má kroky 0–5 (kontrola vstupu, ukotvení, nezávislé generování, deduplikace, ukotvená kritika, párové porovnání), zápis výstupu a návrh poučení. Výstup je jeden lokální soubor; o kandidátech rozhoduje správce, ne pipeline.

## Hranice

Lokální databáze obsahuje produkční data rodiny a autopilot postaví cokoli, co dostane `ready-for-agent`. Proto platí po celý běh, pro tebe i pro každého subagenta:

- Signály bereš jen ze `<kořen>/signals.md` a z GitHub issues **pro čtení** (`gh issue list`, `gh issue view`).
- Zapisuješ jen do `<kořen>/` (gitignored). Na GitHub nezapisuješ nic: žádné `gh issue create` / `edit` / `comment` / `close`, žádné labely, PR ani `gh api` mimo GET. Z `<kořen>/` nic necommituješ.
- Žádné `psql`, `docker`, `prisma`, žádné čtení `.env*`, žádný jiný přístup k databázi.
- Ve výstupech jen role (prarodič, rodič…), nikdy jména.

Na začátek promptu každého subagenta kromě kritiků (ti mají přísnější blok v [kritik.md](kritik.md)) vlož doslova tento blok:

> **Hranice:** Pracuješ read-only. GitHub jen `gh issue list` a `gh issue view`. Žádné `psql`, `docker`, `prisma`, žádné čtení `.env*`, žádný zápis souborů ani na GitHub. Ve výstupu jen role, žádná jména.

## Stropy

Na jeden běh nejvýš: krok 1 = 1 subagent, krok 2 = 8 generátorů, krok 3 = 1 subagent, krok 4 = 1 kritik na kandidáta (nejvýš 10), krok 5 = 3 kritici v 1 kole a jen při víc než 5 kandidátech. Subagent, který selže nebo vrátí nepoužitelný výstup, se nenahrazuje: pokračuj s tím, co máš, a uveď to v hlavičce výstupu.

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

### 4. Ukotvená kritika (1 kritik na kandidáta)

Na každého kandidáta z kroku 3 spusť jednoho kritika: subagent `Explore` s `model: "opus"` a promptem z [kritik.md](kritik.md), všechny v jedné zprávě. Kandidát s verdiktem „vyřadit“ jde do přílohy „vyřazeno“ s důvodem kritika. Kandidát, jehož kritik selhal, nemá štítky ani námitky, takže jde do přílohy s důvodem „bez kritiky (kritik selhal)“. Hotovo, když má každý kandidát verdikt nebo je v příloze.

### 5. Párové porovnání (jen při víc než 5 kandidátech)

Když po kroku 4 zbývá nejvýš 5 ponechaných kandidátů, krok přeskoč: postupují všichni v pořadí z kroku 3. Jinak postupuj podle [parove.md](parove.md). Postupují kandidáti z řádku `Postupují:` helperu v jeho pořadí, ostatní jdou do přílohy „vyřazeno“ s důvodem „nepostoupil z párového kola (<n> výher)“. Hotovo, když máš nejvýš 5 postupujících.

### Závěr: výstup

Zapiš `<kořen>/runs/<RRRR-MM-DD>.md` podle [vystup.md](vystup.md); když soubor existuje, přidej k datu `-2`, `-3`… Uživateli vypiš cestu k souboru a počty z hlavičky. Hotovo, když soubor existuje, má nejvýš 5 kandidátů a každý má aspoň jeden odkaz na signál (`S-n` nebo `#n`), štítky, tři námitky a otázku pro rodinu.

### Poučení

Sekce A v `<kořen>/lessons.md` je paměť, kterou spravuje správce: zapisuješ do ní jen výtky, které uživatel v tomto běhu výslovně potvrdil.

1. Z předchozích výstupů v `<kořen>/runs/` přečti jen sekce `## Výtky kritika`.
2. Najdi výtky, které se svým smyslem objevily aspoň ve 2 různých bězích (aktuální se počítá) a v sekci A ještě nejsou. Ukaž je uživateli očíslované, u každé s daty běhů, a zeptej se, které uložit. Když žádná taková není, napiš „Žádné opakované výtky k uložení.“ a běh končí.
3. Potvrzené výtky (čísla nebo „všechny“) zapiš pod nadpis `## A. Opakované výtky` jako `- <výtka> (běhy: <data>)`. Odpověď bez čísel ani „všechny“ znamená, že `lessons.md` zůstane beze změny.

Hotovo, když uživatel odpověděl a v sekci A přibyly právě výtky, které potvrdil.
