# Krok 5: Párové porovnání

Jedno kolo se 3 rozhodčími pro případ, kdy po kroku 4 zbývá víc než 5 ponechaných kandidátů. Jeho výsledek je konečný.

1. Ponechaným kandidátům přiděl kódy P1, P2… v pořadí z kroku 3.
2. Sestav seznam všech uspořádaných dvojic (každá dvojice v obou pořadích), seřazený podle druhého kódu a pak prvního: `P2 vs P1`, `P3 vs P1`… `P1 vs P2`, `P3 vs P2`… Dvojice a její obrácení tak v seznamu nestojí u sebe.
3. Spusť 3 rozhodčí (`Explore`, `model: "opus"`) v jedné zprávě, každý s promptem níže. Rozhodčí 1 dostane seznam dvojic i kandidátů v pořadí z bodů 1 a 2, rozhodčí 2 oba seznamy obrácené, rozhodčí 3 oba seznamy od poloviny (druhá půlka, pak první). Kandidáti jsou anonymizovaní: kód místo názvu, co dělá, důkaz a štítky z kroku 4; bez štítku Navrhlo a bez námitek.
4. Výstupy rozhodčích převeď do `<kořen>/parove.json`, rozhodčí čísluj 1–3:

   ```json
   { "candidates": ["P1", "P2"], "verdicts": [{ "judge": 1, "first": "P1", "second": "P2", "winner": "P1" }] }
   ```

   `candidates` jsou všechny kódy v pořadí z bodu 1, `first` a `second` pořadí dvojice, jak ji rozhodčí dostal, `winner` kód, který vybral.
5. Spusť `npm run --silent ideation -- pairwise --root <kořen>`. Helper dá rozhodčímu výhru jen tam, kde vybral stejného kandidáta v obou pořadích dvojice, a vypíše řádek `Postupují:` s nejvýš 5 kódy. Při nenulovém exit kódu oprav převod v `parove.json` podle hlášky helperu a spusť znovu; verdikty zůstávají, jak je rozhodčí vrátili. Řádky `Shoda na hranici:` a `Bez verdiktu:` z výstupu helperu patří do Poznámek výstupu.

Hotovo, když helper skončil s 0 a máš řádek `Postupují:`.

## Prompt rozhodčího

Blok **Hranice rozhodčího** a pod ním všechno pod čarou s doplněnými kandidáty a seznamem dvojic.

> **Hranice rozhodčího:** Pracuješ jen s tímto zadáním, bez nástrojů. Ve výstupu jen kódy kandidátů.

---

Porovnáváš anonymní kandidáty na funkce rodinné aplikace „Kdy na chatu“.

**Kandidáti:**
<kód, co dělá, důkaz, štítky>

**Dvojice:**
<seznam „<první> vs <druhý>“>

U každé dvojice vyber kandidáta, který rodině víc pomůže. Zvaž sílu důkazu od rodiny (signály `S-n`), jádro proti doplňku, posun metriky 30. 6. 2027 a cenu (velikost, migrace, riziko `cabinId`). Vítěz je vždy jeden z obou.

Vrať jeden řádek na dvojici, ve stejném pořadí jako seznam:

```
<první> vs <druhý>: <vítěz>
```

Hotovo, když má každá dvojice ze seznamu právě jeden řádek.
