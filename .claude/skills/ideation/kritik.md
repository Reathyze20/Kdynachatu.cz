# Krok 4: Ukotvená kritika

Prompt kritika = blok **Hranice kritika** níže + všechno pod čarou s doplněným kořenem, jedním kandidátem z kroku 3, shrnutím signálů z kroku 1 a seznamem issues. Seznam issues načti jednou sám (`gh issue list --state all --limit 300 --json number,title,state`) a vlož ho do každého promptu, aby kritik nepotřeboval `gh`.

Každý kritik dostane jen svého kandidáta, bez ostatních kandidátů a bez verdiktů ostatních kritiků: nezávislý kritik nekonformuje.

> **Hranice kritika:** Pracuješ read-only a jen nástroji Read, Grep a Glob: žádný Bash, `gh`, zápis souborů ani subagenti. Z `<kořen>/` čteš jen `lessons.md`, žádné `.env*`. Ve výstupu jen role, žádná jména.

---

Posuzuješ jednoho kandidáta na funkci rodinné aplikace „Kdy na chatu“. Každé tvrzení opři o fakt z repa a uveď, kde leží (soubor a sekce, číslo issue): `docs/PRODUCT.md`, `docs/adr/`, kód v `src/` a `frontend-v2/src/`, `prisma/schema.prisma`. Přečti celý `<kořen>/lessons.md`: sekce A jsou opakované výtky z minulých běhů, sekce B verdikty rodiny k dřívějším kandidátům.

**Kandidát:**
<název, co dělá, důkaz, domovský shluk>

**Shrnutí signálů:**
<shrnutí z kroku 1>

**Issues:**
<seznam issues>

## Rubrika

**1. Vyřadit**, když platí aspoň jedno:
- rozpor s ADR v `docs/adr/` nebo se sekcí „Vědomě ne teď“ v `docs/PRODUCT.md`;
- důkaz nemá ani jeden odkaz `S-n` nebo `#n`, který je ve shrnutí signálů;
- duplikát issue ze seznamu: stejná potíž řešená stejným způsobem.

U vyřazeného kandidáta vrať jen řádky Verdikt a Výtky (bod 5); body 2–4 jsou pro ponechané.

**2. Štítky:**
- **Oblast:** jádro / doplněk podle sekce „Jádro vs. doplňky“ v `PRODUCT.md`. Rozvoj doplňku dostane varování „rozvíjí doplněk“.
- **Metrika 30. 6. 2027:** ano / ne, posouvá-li rezervace vzniklé v aplikaci nebo předávku u ≥ 70 % pobytů (sekce „Rozhodnutí o komerci“).
- **Velikost:** S / M / L; nad ~400 řádků změny přidej „potřebuje rozpad“.
- **Migrace:** ano / ne podle `prisma/schema.prisma`.
- **Riziko pro izolaci `cabinId`:** ano / ne a jednou větou proč (nová data chaty, nový dotaz, sdílení mezi chatami).

**3. Tři námitky** jako otázky, které správce položí rodině. Každá míří na předpoklad, na kterém nápad stojí, a jde zodpovědět z vlastní zkušenosti rodiny („Kdo z vás dnes … a jak často?“). Co si rodina myslí, zjistí jen otázka, proto verdikt o jejích preferencích (typu „lidem se to nebude líbit“) nevynášíš.

**4. Jedna otázka pro rodinu** ke zkopírování do WhatsAppu: tykání, jedna věta, bez odborných slov, aby šla odpovědět jednou zprávou.

**5. Výtky:** každý důvod vyřazení a každé varování („rozvíjí doplněk“, „potřebuje rozpad“, riziko `cabinId` ano) přepiš jako obecnou výtku k nápadům, ne ke kandidátovi („Nápady přidávají obrazovku tam, kde stačí upozornění“). Bez důvodů a varování napiš „žádné“.

Vrať přesně tento Markdown:

```
### <název>
- Verdikt: ponechat / vyřadit: <důvod s odkazem na fakt>
- Oblast: jádro / doplněk (<varování>)
- Metrika 30. 6. 2027: ano / ne
- Velikost: S / M / L (potřebuje rozpad)
- Migrace: ano / ne
- Riziko cabinId: ano / ne: <proč>
- Námitky:
  1. <otázka>
  2. <otázka>
  3. <otázka>
- Otázka pro rodinu: <otázka>
- Výtky: <výtka>; <výtka> / žádné
```

Hotovo, když je verdikt podložený odkazem na fakt a ponechaný kandidát má všech pět štítků, tři námitky jako otázky a otázku pro rodinu.
