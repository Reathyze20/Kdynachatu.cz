---
name: CabinSaaS_Architect
description: "Postup pro UI ve frontend-v2/: zkontrolovat inventář → použít kanonickou komponentu → projít checklist proti DESIGN.md. Použij, když stavíš, převádíš nebo posuzuješ obrazovku, komponentu, modál, formulář nebo seznam ve frontend-v2/."
---

# CabinSaaS Architect – postup pro UI ve `frontend-v2/`

Pravidla vzhledu, komponent, vzorů, textů a formátů jsou jen v `DESIGN.md` v kořeni repa. Tento skill je neopakuje, odkazuje na kapitoly (§). Když se s `DESIGN.md` rozchází cokoli jiného (tento skill, `references/`, mockupy v `docs/design/`, `docs/plans/redesign-faze-4-*`), platí `DESIGN.md`. Pravidla pro data, API a realtime jsou v `CODING_STANDARDS.md` (sekce Frontend), vrstvy aplikace v `memories/repo/architecture.md`.

Postup má tři kroky v tomto pořadí. Převod existující obrazovky navíc sleduje `DESIGN.md` §11.

## 1. Zkontroluj inventář

1. Projdi složky `frontend-v2/src/components/ui/`, `shared/` a `layout/` a tabulku komponent v `DESIGN.md` §6. Zdrojem je kód. `references/component-inventory.md` je mapa featur, hooků, API modulů a `lib/` a smí zaostávat.
2. Projdi `frontend-v2/src/features/<featura>/`, jestli tam stejná věc už není.
3. Při převodu obrazovky najdi její soubory v allowlistu guardů (`DESIGN.md` §10). Je to seznam toho, co převést.

Hotovo, když u každého prvku obrazovky víš, která existující komponenta ho pokrývá, nebo že žádná.

## 2. Použij kanonickou komponentu

- Prvek, který má řádek v tabulce `DESIGN.md` §6, se staví jen touto komponentou. Vzor z §7 (hlavička, vytvoření, akce nad položkou, mazání, formulář, stavy) se staví přesně podle §7.
- Řádek se stavem **Cíl** ještě není hotový. Co do té doby platí, říká úvod `DESIGN.md`. Redesign ticket čeká, až se zavřou jeho blokery (§11).
- Opakující se vzor bez kanonické komponenty popiš v PR jako návrh změny `DESIGN.md`.
- Struktura dat a stavů: `references/recipes.md` (stránka se stavy, query hook s optimistickou mutací, formulář, API modul, master-detail). Z receptů ber strukturu, vzhled ber z `DESIGN.md`.
- API cesty a tvary odpovědí: `references/api-endpoints.md`. Typy: `references/data-models.md`.
- Nová barva, písmo nebo vizuální směr je rozhodnutí uživatele (`DESIGN.md` §1): připrav picker v `docs/design/` a nech vybrat.

Hotovo, když každý prvek stojí na komponentě z kroku 1, nebo na nové komponentě, kterou PR zdůvodňuje.

## 3. Projdi checklist

Odškrtni každý bod. Nesplněný bod je nález v `/code-review`.

**Vzhled (`DESIGN.md`)**

- [ ] Barvy, plochy, mezery a z-index jen z tokenů (§2).
- [ ] Typová škála a řezy písma (§3), ikony (§4), pohyb (§5).
- [ ] Kanonické komponenty místo zmrazených legacy tříd (§6).
- [ ] Hlavička, vytvoření, akce nad položkou, mazání, formuláře a čtyři stavy podle vzorů (§7).
- [ ] Texty podle hlasu (§8), data, časy a částky podle formátů (§9).
- [ ] Šířky obrazovky a dotykové cíle podle §1 a §7. Ověřeno podle §11 krok 6.
- [ ] Guard testy ve `frontend-v2/src/test/` procházejí a převedené soubory jsou odebrané z allowlistu (§10).

**Data a architektura**

- [ ] Každé pravidlo z `CODING_STANDARDS.md` › Frontend.
- [ ] Auth a chata jen přes `useAuth()` z `context/AuthContext.tsx`, nikdy přímo z `localStorage`. Admin ovládání podle `isAdmin`, host jen čte.
- [ ] Mutace invaliduje dotazy všech modulů, které měněná data čtou (tabulka níže).

## Dopady mezi moduly

| Akce | Dotkne se |
|---|---|
| Smazání nákupního seznamu | kaskádově smaže jeho položky |
| Smazání uživatele | kaskádově jeho rezervace, poznámky, zápisy deníku a úkoly rekonstrukce. Fotky zůstanou bez autora |
| Zásoba na LOW / EMPTY | widget `essentialWarning` na Přehledu |
| Položka z kontextové akce chatu | `sourceMessageId` spojí poznámku s položkou nákupu |
| Úkol rekonstrukce z chatu | `sourceMessageId` spojí poznámku s úkolem |
| Dokončená předávka | příznak rezervace `isCheckoutCompleted` |
| Smazání složky galerie | kaskádově její fotky, a tím zápisy deníku, které na ně odkazují |
