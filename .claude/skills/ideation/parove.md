# Krok 5: Párové porovnání

Rozhodčí pro případ, kdy po kroku 4 zbývá víc než 5 ponechaných kandidátů. Jedno kolo se 3 kritiky; výsledek se neopakuje ani nedolaďuje.

1. Ponechaným kandidátům přiděl kódy P1, P2… v pořadí z kroku 3.
2. Sestav seznam dvojic: nejdřív každou dvojici (Pi, Pj) s i < j, za nimi tytéž dvojice obráceně (Pj, Pi). Každá dvojice je v seznamu v obou pořadích.
3. Spusť 3 kritiky (`Explore`, `model: "opus"`) v jedné zprávě, každý s promptem níže. Kandidáti v promptu jsou anonymizovaní: kód místo názvu, co dělá, důkaz a štítky z kroku 4; bez štítku Navrhlo a bez námitek.
4. Výstupy kritiků převeď do `<kořen>/parove.json`, kritiky čísluj 1–3:

   ```json
   { "candidates": ["P1", "P2"], "verdicts": [{ "critic": 1, "first": "P1", "second": "P2", "winner": "P1" }] }
   ```

   `candidates` jsou všechny kódy v pořadí z bodu 1, `first` a `second` pořadí dvojice ze seznamu, `winner` kód, který kritik vybral.
5. Spusť `npm run --silent ideation -- pairwise --root <kořen>`. Helper dá kritikovi výhru jen tam, kde vybral stejného kandidáta v obou pořadích dvojice, a vypíše řádek `Postupují:` s nejvýš 5 kódy. Při nenulovém exit kódu oprav převod v `parove.json` podle hlášky helperu a spusť znovu; verdikty kritiků zůstávají, jak je vrátili. Řádek `Bez verdiktu:` z výstupu helperu patří do Poznámek výstupu.

Hotovo, když helper skončil s 0 a máš řádek `Postupují:`.

## Prompt kritika párového kola

Blok **Hranice kritika** z [kritik.md](kritik.md), pak všechno pod tímto odstavcem s doplněnými kandidáty a seznamem dvojic.

Porovnáváš anonymní kandidáty na funkce rodinné aplikace „Kdy na chatu“. Pracuj jen s tímto zadáním, soubory nečti.

**Kandidáti:**
<kód, co dělá, důkaz, štítky>

**Dvojice:**
<seznam „<první> vs <druhý>“ v pořadí z bodu 2>

U každé dvojice vyber kandidáta, který rodině víc pomůže. Rozhoduj podle prvního kritéria, ve kterém se liší:
1. silnější důkaz od rodiny (víc signálů `S-n`),
2. jádro před doplňkem,
3. posouvá metriku 30. 6. 2027,
4. menší velikost, bez migrace, bez rizika `cabinId`.

Každou dvojici posuzuj samostatně a vždy vyber jednoho z obou.

Vrať jeden řádek na dvojici, ve stejném pořadí jako seznam:

```
<první> vs <druhý>: <vítěz>
```

Hotovo, když má každá dvojice ze seznamu právě jeden řádek.
