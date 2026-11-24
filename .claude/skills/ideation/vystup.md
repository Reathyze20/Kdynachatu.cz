# Závěr: výstupní soubor

Česky. Sekce Kandidáti je doslova výstup helperu `blind`: kandidáti pipeline a baseline naslepo zamíchaní jako K1…Kn, všichni ve stejném tvaru. Proto v ní není nic, co má jen jedna strana (štítek Navrhlo, pořadí z kroku 5, verdikt kritika). Signály se uvádějí jen jako ID, role a parafráze zůstávají v `signals.md`. Shluky signálů jdou v pořadí z kroku 1. Příloha „vyřazeno“ sbírá vyřazené z kroků 3, 4 i 5 a kandidáty se selhaným kritikem. Do sekce Výtky kritika patří výtky všech kritiků z kroku 4, každá jednou.

Šablona souboru; K1 ukazuje tvar kandidáta z výstupu `blind`, řádek Štítky je pole `labels` ve `slepe.json`:

```
# /ideation – <název běhu>

- Kořen: `<kořen>`
- Signálů: <n> ručních, <n> issues ve shlucích
- Generátorů: <doběhlo>/8 (Codex: ano/ne), nápadů do deduplikace: <n>, kandidátů po deduplikaci: <n>, po kritice: <n>, párové kolo: ano/ne
- Baseline: doběhla ano/ne, kandidátů ve výstupu: <n>
- Poznámky: <selhaný subagent, neschválené kódy shluků, odříznuté nápady nad 5, shoda na hranici a chybějící verdikty párového kola…, nebo „žádné“>

## Kandidáti

### K1 – <název>
<2–3 věty, co dělá>

- Důkaz: S-…, #…
- Štítky: jádro / doplněk (rozvíjí doplněk) · metrika 30. 6. 2027: ano / ne · velikost: S / M / L (potřebuje rozpad) · migrace: ano / ne · riziko cabinId: ano / ne: <proč>
- Námitky:
  1. <otázka>
  2. <otázka>
  3. <otázka>

Otázka pro rodinu (ke zkopírování):

> <otázka>

## Posiluje existující issues
- #n <titulek>: nápad „<název>“ přidává S-…, #…

## Shluky signálů
- `<kód>` – <potíž>: S-…, #…

## Příloha: vyřazeno
- <název>: <jednořádkový důvod>

## Výtky kritika
- <výtka>
```

Prázdnou sekci nech s řádkem „nic“.
