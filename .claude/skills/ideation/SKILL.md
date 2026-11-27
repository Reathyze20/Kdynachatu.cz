---
name: ideation
description: Kandidáti na funkce ze signálů rodiny a GitHub issues do lokálního Markdownu v .ideation/runs/; vyhodnoť = tabulka pipeline vs. baseline podle verdiktů rodiny.
disable-model-invocation: true
argument-hint: "[vyhodnoť] [zkouška]"
---

# /ideation

Pipeline, která ze skutečných signálů (ruční zpětná vazba rodiny v `signals.md` a GitHub issues) vytáhne kandidáty na funkce. Spec je issue #367. Běh má kroky 0–5 (kontrola vstupu, ukotvení, nezávislé generování, deduplikace, ukotvená kritika, párové porovnání), zápis výstupu a návrh poučení. Vedle pipeline běží levná **baseline** (jeden silný prompt) a výstup ukáže kandidáty obou naslepo zamíchané jako K1–K10, aby správce mohl podle verdiktů rodiny posoudit, jestli se pipeline vyplácí. Výstup je jeden lokální soubor; o kandidátech rozhoduje správce, ne pipeline.

## Hranice

Lokální databáze obsahuje produkční data rodiny a autopilot postaví cokoli, co dostane `ready-for-agent`. Proto platí po celý běh, pro tebe i pro každého subagenta:

- Signály bereš jen ze `<kořen>/signals.md` a z GitHub issues **pro čtení** (`gh issue list`, `gh issue view`).
- Zapisuješ jen do `<kořen>/` (gitignored). Na GitHub nezapisuješ nic: žádné `gh issue create` / `edit` / `comment` / `close`, žádné labely, PR ani `gh api` mimo GET. Z `<kořen>/` nic necommituješ.
- Žádné `psql`, `docker`, `prisma`, žádné čtení `.env*`, žádný jiný přístup k databázi.
- Ve výstupech jen role (prarodič, rodič…), nikdy jména.
- Původ kandidátů znají jen helper a správce: klíč `<kořen>/runs/*.klic.json` čte jen helper (`blind` ho zapisuje, `evaluate` z něj počítá tabulku) a otevírá jen správce. Ty ani žádný subagent ho nečtete ani nevypisujete, jinak slepé míchání nedrží. Původ odkrývá jen výstup `evaluate` v režimu `vyhodnoť`.

Na začátek promptu každého subagenta kromě kritiků a rozhodčích (ti mají přísnější blok v [kritik.md](kritik.md) a [parove.md](parove.md)) vlož doslova tento blok:

> **Hranice:** Pracuješ read-only. GitHub jen `gh issue list` a `gh issue view`. Žádné `psql`, `docker`, `prisma`, žádné čtení `.env*` ani `<kořen>/runs/*.klic.json`, žádný zápis souborů ani na GitHub. Ve výstupu jen role, žádná jména.

## Stropy

Na jeden běh nejvýš: krok 1 = 1 subagent, krok 2 = 8 generátorů + 1 baseline, krok 3 = 1 subagent, krok 4 = 1 kritik na kandidáta (nejvýš 10 z pipeline + 5 z baseline), krok 5 = 3 rozhodčí v 1 kole. Subagent, který selže nebo vrátí nepoužitelný výstup, se nenahrazuje: pokračuj s tím, co máš, a uveď to v hlavičce výstupu.

## Kořen

Kořen je `.ideation`. S argumentem `zkouška` je to `.ideation/zkouska`, zkušební kořen nad fiktivními signály.

## Režim `vyhodnoť`

`/ideation vyhodnoť [zkouška]` spojí klíče všech běhů v kořeni s verdikty rodiny ze sekce B `<kořen>/lessons.md` a ukáže, jak si vedla pipeline proti baseline. Pipeline se nespouští: žádný subagent, žádný zápis souborů.

1. Spusť `npm run --silent ideation -- evaluate --root <kořen>`.
2. Výstup helperu ukaž uživateli beze změny, při nenulovém exit kódu jeho hlášku. Řádky pod „Nezapočteno“ opravuje správce v sekci B; ty `lessons.md` necháváš beze změny.

Hotovo, když uživatel viděl výstup helperu. Tím režim končí, `## Postup` platí jen pro běh bez `vyhodnoť`.

## Postup

### 0. Kontrola vstupu

Při `zkouška`, když `.ideation/zkouska/signals.md` neexistuje, zkopíruj do něj `src/scripts/assets/ideation-signals.fixture.md`.

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

### 2. Nezávislé generování (8 generátorů + baseline)

Rozděl čočky a modely podle [generovani.md](generovani.md) a ve stejné zprávě spusť všech 8 generátorů i baseline podle [baseline.md](baseline.md). Každý dostane jen svůj prompt, žádný sdílený kontext. Od baseline vezmi nejvýš prvních 5 kandidátů v pořadí, v jakém je vrátila; baseline neprochází krokem 3 ani 5. Hotovo, když máš výstup od každého generátoru a od baseline, pokud doběhli.

### 3. Deduplikace (1 subagent)

Od každého generátoru vezmi nejvýš jeho prvních 5 nápadů v pořadí, v jakém je vrátil; generátory počet nedodržují spolehlivě. Kolik nápadů a u kterého generátoru jsi odřízl, uveď v Poznámkách výstupu.

Spusť jednoho subagenta (`general-purpose`) s promptem z [deduplikace.md](deduplikace.md), s těmito nápady a se shrnutím signálů a seřazenými shluky z kroku 1. Hotovo, když máš kandidáty (nejvýš 10), seznam „posiluje #n“ a vyřazené s důvody.

### 4. Ukotvená kritika (1 kritik na kandidáta)

Na každého kandidáta z kroku 3 i z baseline spusť jednoho kritika: subagent `Explore` (bez nástrojů pro zápis) s `model: "opus"` a promptem z [kritik.md](kritik.md), všechny v jedné zprávě. Kritik původ kandidáta nezná: prompt je pro obě strany stejný.

- **Pipeline:** kandidát s verdiktem „vyřadit“ jde do přílohy „vyřazeno“ s důvodem kritika.
- **Baseline:** verdikt nic nevyřazuje, kandidát zůstává se štítky a námitkami od kritika. Filtr kritika je součást pipeline, kterou baseline testuje, takže by ji nespravedlivě vylepšil.
- Kandidát, jehož kritik selhal, nemá štítky ani námitky, takže jde do přílohy s důvodem „bez kritiky (kritik selhal)“, na obou stranách.

Hotovo, když má každý kandidát obou stran verdikt nebo je v příloze.

### 5. Párové porovnání (jen při víc než 5 kandidátech)

Krok se týká jen kandidátů pipeline. Když po kroku 4 zbývá nejvýš 5 ponechaných kandidátů pipeline, krok přeskoč: postupují všichni v pořadí z kroku 3. Jinak postupuj podle [parove.md](parove.md). Postupují kandidáti z řádku `Postupují:` helperu v jeho pořadí, ostatní jdou do přílohy „vyřazeno“ s důvodem „nepostoupil z párového kola (<n> výher)“. Hotovo, když máš nejvýš 5 postupujících.

### Závěr: výstup

Název běhu je `<RRRR-MM-DD>`; když `<kořen>/runs/<název>.md` existuje, přidej k datu `-2`, `-3`…

1. Zapiš `<kořen>/slepe.json` s postupujícími kandidáty pipeline z kroku 5 (v jejich pořadí) a kandidáty baseline z kroku 4, nejvýš 5 na stranu:

   ```json
   { "pipeline": [{ "title": "", "summary": "", "evidence": "", "labels": "", "objections": ["", "", ""], "question": "" }], "baseline": [] }
   ```

   `title` je název, `summary` 2–3 věty, co dělá, `evidence` odkazy `S-n` a `#n` z důkazu, `labels` štítky kritika v jednom řádku `jádro / doplněk (rozvíjí doplněk) · metrika 30. 6. 2027: ano / ne · velikost: S / M / L (potřebuje rozpad) · migrace: ano / ne · riziko cabinId: ano / ne: <proč>`, `objections` tři námitky a `question` otázka pro rodinu. Jiná pole helper odmítne, aby nic neprozradilo stranu.
2. Spusť `npm run --silent ideation -- blind --root <kořen> --run <název>`. Helper kandidáty zamíchá, přidělí K1…Kn, klíč původu zapíše do `<kořen>/runs/<název>.klic.json` a `slepe.json` smaže. Při nenulovém exit kódu oprav `slepe.json` podle hlášky helperu (u existujícího klíče zvol další příponu názvu) a spusť znovu.
3. Zapiš `<kořen>/runs/<název>.md` podle [vystup.md](vystup.md); sekce Kandidáti je doslova výstup helperu.

Uživateli vypiš cestu k souboru a počty z hlavičky. Hotovo, když soubor existuje, v sekci Kandidáti je přesně výstup `blind` (nejvýš 10 kandidátů K1…Kn, každý se štítky, třemi námitkami a otázkou pro rodinu, každý kandidát pipeline s odkazem na signál) a klíč běhu existuje.

### Poučení

Sekce A v `<kořen>/lessons.md` je paměť, kterou spravuje správce: zapisuješ do ní jen výtky, které uživatel v tomto běhu výslovně potvrdil.

1. Z předchozích výstupů `<kořen>/runs/*.md` přečti jen sekce `## Výtky kritika`.
2. Najdi výtky, které se svým smyslem objevily v bězích aspoň 2 různých dnů (aktuální běh se počítá, opakovaný běh téhož dne ne) a v sekci A ještě nejsou. Ukaž je uživateli očíslované, u každé s daty běhů, a zeptej se, které uložit. Když žádná taková není, napiš „Žádné opakované výtky k uložení.“ a běh končí.
3. Potvrzené výtky (čísla nebo „všechny“) zapiš pod nadpis `## A. Opakované výtky` jako `- <výtka> (běhy: <data>)`. Odpověď bez čísel ani „všechny“ znamená, že `lessons.md` zůstane beze změny.

Hotovo, když jsi napsal „Žádné opakované výtky k uložení.“, nebo uživatel odpověděl a v sekci A přibyly právě výtky, které potvrdil.
