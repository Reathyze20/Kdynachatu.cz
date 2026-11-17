# ADR-0003: Pronájem jako modul per chata – ne teď, ale neblokovat

Datum: 2026-11-17 · Stav: přijato

## Kontext

Komerčně dávají smysl dva odlišné světy: **vlastníci sdílené chaty** (koordinace domácností) a **pronajímatelé** (hosté zvenku, platby, veřejná dostupnost, napojení na Booking/Airbnb). Musí být pro uživatele oddělené. Častý případ přitom kombinuje obojí: rodina chatu pronajímá, když ji sama nepoužívá. Sólo vývojář – dvě kódové základny by znamenaly dvojí údržbu.

## Rozhodnutí

**Jeden systém** – jeden backend a jedna DB se sdíleným jádrem (chata, kalendář, uživatelé, údržba, zásoby). Pronájem bude **modul zapínaný per chata** (`Cabin.features`) s **vlastním UI** pro pronajímatele a veřejnou stránkou pro hosty, případně později s jinou značkou či doménou. **Teď se nestaví.**

Do té doby platí jen dva závazky pro každou změnu jádra:

1. **Kalendář musí unést blokaci od nečlena** (externí host) – nesmí předpokládat, že každý obsazený termín patří členovi chaty.
2. **Model rezervace nesmí předpokládat, že rezervující je člen chaty.**

## Zvažované varianty

- A: Oddělená aplikace a codebase (+ čisté oddělení; − dvojí údržba, kalendář by se musel synchronizovat).
- **B: Jeden systém, modul per chata, oddělené UI** (+ sdílené jádro, kombinace vlastník + pronájem zdarma; − disciplína, aby se světy nemíchaly v UI).
- C: Pronájem jako příznak v rámci stávajícího UI (− světy se smíchají, což nechceme).

## Důsledky

- Spec, které mění rezervace nebo kalendář, kontroluje oba závazky v sekci „Tenant & bezpečnost“ / Implementation Decisions.
- Žádný kód pro pronájem, dokud nepadne rozhodnutí o komerci ([PRODUCT.md](../PRODUCT.md)) a samostatný grill k pronájmu.
- Přehodnotit, pokud by pronájem vyžadoval jiný tenant model (organizace spravující více chat).
