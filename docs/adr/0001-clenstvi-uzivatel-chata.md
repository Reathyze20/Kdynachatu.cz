# ADR-0001: Členství uživatele v chatě (User ↔ Cabin) s rolí na úrovni chaty

Datum: 2026-11-17 · Stav: přijato (implementace: krok 7 roadmapy)

## Kontext

Tenant je chata (`cabinId`). Dnes má `User` jediné nullable `cabinId` a globální `role` (`admin | user | guest`, `prisma/schema.prisma`, model `User`). Pro komerční segment „sdílené chaty“ ([PRODUCT.md](../PRODUCT.md)) to nestačí: jeden člověk může být správcem rodinné chaty a zároveň hostem na chatě kamaráda. Role `guest` navíc nemá specifikaci a vynucuje se jen v části modulů. Sólo vývojář, rodina už reálně používá produkci jako chata č. 1 – změna nesmí rodinu rozbít.

## Rozhodnutí

Zavést **join tabulku členství `User ↔ Cabin` s rolí na úrovni chaty** (správce / člen / host, u hosta volitelná platnost do). Identita uživatele zůstává **globální** (unikátní username i e-mail, přihlášení beze změny). Tenant scope se nadále bere **jen ze serveru** – z ověřeného členství, ne z pole na uživateli, hlavičky ani těla requestu – a uživatel s více členstvími si přepíná aktivní chatu.

## Zvažované varianty

- A: Ponechat `User.cabinId` + globální roli (+ nulová práce; − člověk nemůže být ve dvou chatách, role nedává smysl napříč chatami).
- B: Samostatný účet pro každou chatu (+ jednoduchá izolace; − více hesel, duplicitní identita, nesedí na hosta).
- **C: Členství přes join tabulku** (+ přirozený model pro sdílené chaty i hosty; − migrace a úprava middleware, nutné testy izolace).

## Důsledky

- **Migrace rodiny automaticky, expand → contract (SDLC §6):** každý uživatel s `cabinId` dostane členství v chatě č. 1 se svou současnou rolí. `User.cabinId` a `User.role` zůstávají, dokud kód čte z členství; odstraní je samostatný contract PR. Rodina nic nepozná.
- **Hosté:** pozvánka vázaná na konkrétní rezervaci, vytvořit ji smí každý člen; členství hosta vyprší 7 dní po konci pobytu. Stavět na existujícím modelu `InviteLink` (už má `role`, `maxUses`, `expiresAt`).
- **Matice rolí** (správce / člen / host × moduly) se vynucuje ve **všech** modulech a je pokrytá testy; host vidí jen svůj pobyt, briefing a odjezd.
- `cabinMiddleware` a `protect` se mění → citlivá cesta, label `human-reviewed`. Předpoklad: hotový harness s reálnou DB a tenant-isolation testy (krok 4 roadmapy).
- Z „SaaS dluhů“ gap auditu tím mizí „globální unique username/e-mail“ – s členstvím je správně.
- Přehodnotit, pokud by vznikla potřeba organizací nad chatami (správce více chat jako firma) – to je až segment pronájmu.
