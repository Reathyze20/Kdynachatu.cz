# Krok 3: Deduplikace

Prompt subagenta = blok **Hranice** ze `SKILL.md` + všechno pod tímto odstavcem s doplněným kořenem, shrnutím signálů a seřazenými shluky z kroku 1 a nápady z kroku 2 (s označením generátoru).

Dostáváš nápady od až 8 nezávislých generátorů, shrnutí signálů a shluky signálů, ze kterých nápady vycházejí. Přečti celý `<kořen>/lessons.md`: sekce A jsou opakované výtky z minulých běhů, sekce B verdikty rodiny k dřívějším kandidátům.

Podobnost nápadů posuzuješ jen uvnitř jednoho shluku signálů: nápady z různých shluků se nikdy neslučují ani nevyřazují jeden kvůli druhému.

1. Každému nápadu urči **domovský shluk**: shluk signálů, do kterého patří nejvíc jeho odkazů (při shodě ten s víc odkazy `S-n`, pak ten výš v pořadí shluků).
2. Seskup do **skupin** nápady se stejným domovským shlukem, které řeší stejnou potíž stejným způsobem; jiný název nevadí.
3. Z každé skupiny vyber jako zástupce nápad, který se nejvíc liší od ostatních skupin téhož shluku. Jeho odkazy na signály doplň o signály ostatních členů skupiny. Odkaz, který ve shrnutí signálů neexistuje, škrtni.
4. Spočítej, kolik různých generátorů nápady skupiny navrhlo: to je štítek **Navrhlo**. Nápad od jediného generátoru je okrajový; o vyřazení štítek nerozhoduje.
5. Načti issues: `gh issue list --state all --limit 300 --json number,title,state`. Zástupce, který už existuje jako issue (otevřené i zavřené), patří do **Posiluje** s číslem issue a signály, které k němu přidává.
6. Do **Vyřazeno** s jednořádkovým důvodem patří zástupce bez platného odkazu na signál a zástupce, který opakuje kandidáta ze sekce B. Výtky ze sekce A ber jako nápovědu při výběru zástupce.
7. Když zůstane víc než 10 kandidátů, vyřazuj po jednom, dokud jich není 10:
   - Ve shluku s nejvíc kandidáty (při shodě ten níž v pořadí shluků) vyřaď toho, který se nejvíc kryje s jiným kandidátem z téhož shluku. Důvod: „nad strop 10: shluk `<kód>`, kryje se s kandidátem <název>: <v čem konkrétně>“.
   - Když má každý domovský shluk už jen jednoho kandidáta, vyřaď kandidáta s nejméně odkazy `S-n` (při shodě s nejméně odkazy celkem). Důvod: „nad strop 10: nejslabší důkaz od rodiny (<jeho odkazy>)“.

Vrať přesně tento Markdown:

```
## Kandidáti
### <název>
- Co dělá: 2–3 věty z pohledu rodiny
- Důkaz: S-…, #…
- Domovský shluk: `<kód>`
- Navrhlo: <počet> generátorů (G…)

## Posiluje
- #n (open/closed) <titulek issue>: nápad „<název>“ přidává S-…, #…

## Vyřazeno
- <název>: <důvod>
```

Hotovo, když je každý vstupní nápad v právě jedné skupině, každá skupina skončila v právě jedné ze tří sekcí a každý důvod „nad strop 10“ jmenuje buď shluk a kandidáta, se kterým se kryje, nebo odkazy nejslabšího důkazu.
