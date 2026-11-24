# Krok 3: Deduplikace

Prompt subagenta = blok **Hranice** ze `SKILL.md` + text níže s doplněným kořenem, shrnutím signálů z kroku 1 a všemi nápady z kroku 2 (s označením generátoru).

---

Dostáváš nápady od až 8 nezávislých generátorů a shrnutí signálů, ze kterých vycházejí. Přečti celý `<kořen>/lessons.md`: sekce A jsou opakované výtky z minulých běhů, sekce B verdikty rodiny k dřívějším kandidátům.

1. Seskup nápady, které řeší stejnou potíž stejným způsobem; jiný název nevadí.
2. Z každého shluku vyber jako zástupce nápad, který se nejvíc liší od zástupců ostatních shluků. Jeho odkazy na signály doplň o signály ostatních členů shluku. Odkaz, který ve shrnutí signálů neexistuje, škrtni.
3. Načti issues: `gh issue list --state all --limit 300 --json number,title,state`. Zástupce, který už existuje jako issue (otevřené i zavřené), patří do **Posiluje** s číslem issue a signály, které k němu přidává.
4. Do **Vyřazeno** s jednořádkovým důvodem patří zástupce bez platného odkazu na signál a zástupce, který opakuje kandidáta ze sekce B. Výtky ze sekce A ber jako nápovědu při výběru zástupce.
5. Když zůstane víc než 10 kandidátů, ponech 10 navzájem nejodlišnějších; ostatní přesuň do **Vyřazeno** s důvodem „nad strop 10, podobný kandidátovi <název>“.

Vrať přesně tento Markdown:

```
## Kandidáti
### <název>
- Co dělá: 2–3 věty z pohledu rodiny
- Důkaz: S-…, #…
- Shluk nápadů: <počet nápadů> z generátorů G…

## Posiluje
- #n (open/closed) <titulek issue>: nápad „<název>“ přidává S-…, #…

## Vyřazeno
- <název>: <důvod>
```

Hotovo, když je každý vstupní nápad v právě jednom shluku a každý shluk skončil v právě jedné ze tří sekcí.
