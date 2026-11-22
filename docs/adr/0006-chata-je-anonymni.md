# ADR-0006: Chata je anonymní – appka zná jen nejbližší obec

Datum: 2026-11-22 · Stav: přijato

## Kontext

Appka drží přesně ten údaj, který zloděj potřebuje: **kdy na chatě nikdo není** (kalendář
pobytů, řetězec turnusů, předávka „voda a topení vypnuto“). Kdyby k tomu znala i přesnou polohu
chaty, únik dat nebo cizí přístup by znamenal hotový návod. Uživatel 2026-11-22: *„představa, že
zloděj ví, kdy tam kdo je a kdo ne, je prostě šílená.“*

Spouštěčem byla nová funkce **Akce v okolí chaty** (D3, filtr 10 / 20 / 50 km), která polohu
potřebuje. Dnešní stav:
- `Cabin.weatherLocation`: volný text, příklad „Trebenice“. Počasí a mrazová upozornění ho
  geokódují přes Open-Meteo a berou první výsledek (`count=1`). V Česku je ale mnoho obcí se
  stejným jménem (Lhota, Újezd…), takže výsledek může ukázat úplně jinou obec.
- `Cabin.address` („Adresa pro navigaci“, až 300 znaků): sloupec ve schématu a v Zod schématu.
  Aplikace ho podle průzkumu kódu z 2026-11-22 nikde nezobrazuje. Jestli je vyplněný v
  produkčních datech, ověřeno není.

## Rozhodnutí

Appka zná polohu chaty **jen na úrovni nejbližší obce**. Obec se při zadávání vybírá ze seznamu
(název + okres), ne volným textem. Její souřadnice (střed obce, ne chaty) slouží počasí,
mrazovým upozorněním i filtru akcí v okolí. Přesnou adresu ani souřadnice chaty appka nesbírá a
neukládá.

## Zvažované varianty

- **A: Nejbližší obec ze seznamu** *(zvoleno)*. + Únik dat neprozradí, která chata to je; jeden
  údaj pro počasí i akce; žádné nejasnosti u stejnojmenných obcí. − Počasí a vzdálenosti
  jsou přesné na úroveň obce (pár km), což pro oba účely stačí.
- **B: Přesná adresa nebo GPS chaty.** + Přesné vzdálenosti, navigace. − Spolu s kalendářem
  pobytů přesně ten údaj, který ohrožuje bezpečnost chaty.
- **C: Volný text jako dnes.** + Beze změny. − Stejnojmenné obce, uživatel může zadat i přesnou
  adresu, kterou appka pak drží.

## Důsledky

- Výběr obce potřebuje seznam obcí s okresem. Odkud ho brát, se rozhodne v D3 (geokódovací
  služba vs. statický seznam obcí ČR).
- Uložené souřadnice obce jsou změna schématu → jen podle skillu `database-migrations`.
- `Cabin.address` je v rozporu s tímto rozhodnutím. Odstranění = contract migrace a potřebuje
  `migration-contract-approved` od člověka. Před tím ověřit v produkci, jestli je sloupec
  vyplněný, a obsah nepřenášet nikam jinam.
- Navigaci na chatu si rodina řeší mimo appku (všichni cestu znají; hostům ji pošle člen sám).
- Stejná opatrnost platí pro další údaje, které by chatu identifikovaly. Hero fotka chaty (H1a)
  je jen pro přihlášené členy a nesmí se objevit na veřejné stránce nebo v náhledu odkazu.
- Přehodnotit, kdyby appka začala sloužit segmentu 2 (pronájem), kde je adresa nutná
  ([ADR-0003](0003-pronajem-modul-ne-ted.md)).
