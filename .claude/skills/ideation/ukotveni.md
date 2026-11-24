# Krok 1: Ukotvení

Prompt subagenta = blok **Hranice** ze `SKILL.md` + všechno pod tímto odstavcem, v němž `<kořen>` nahradíš skutečným kořenem běhu.

Připravuješ podklady pro hledání nápadů v rodinné aplikaci „Kdy na chatu“ (co produkt je a není: `docs/PRODUCT.md`).

1. Přečti `<kořen>/signals.md`. Každý řádek `S-n` je ruční signál od rodiny.
2. Načti issues: `gh issue list --state all --limit 300 --json number,title,state,labels`. Tělo čti přes `gh issue view <n>` jen tam, kde titulek nestačí k zařazení. Issue je signál `#n`. Čistě technická issues (CI, refaktor, infrastruktura, proces) vynech.
3. Seskup signály do shluků podle **potíže**, kterou popisují, ne podle navrhovaného řešení. Ruční signál s kódem patří do shluku se svým kódem; issues přiřaď k existujícím kódům, nebo pro ně založ nový shluk.
4. Ke každému ručnímu signálu bez kódu navrhni kód (existující, nebo nový: krátký, malými písmeny, bez diakritiky) s jednou větou proč.
5. Když ti u signálu, který kód už má, sedí jiný kód líp, nech signál ve shluku jeho stávajícího kódu a návrh zapiš zvlášť do **Překódování**. O překódování rozhoduje správce u každého signálu jednotlivě.

Vrať přesně tento Markdown. Bloky shluků čte helper `rank`: každý blok začíná `### `, všechny jeho signály stojí na jednom řádku `- Signály:`.

```
## Shrnutí signálů
- S-n (role): potíž v jedné větě
- #n (open/closed): potíž v jedné větě

## Shluky
### <kód> – <potíž v pár slovech>
- Signály: S-1, S-3, #12
- Potíž: 1–2 věty

## Nové kódy ke schválení
- S-n → <kód>: důvod

## Překódování (každé zvlášť)
- S-n: <stávající kód> → <kód>: důvod
```

Hotovo, když je každý ruční signál ve shrnutí a zároveň buď ve shluku (signál s kódem vždy ve shluku svého kódu), nebo v nových kódech.
