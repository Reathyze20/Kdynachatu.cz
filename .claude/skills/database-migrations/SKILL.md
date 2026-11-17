---
name: database-migrations
description: Postup změny databázového schématu (Prisma 7) v tomto repu. Použij vždy, když měníš prisma/schema.prisma, přidáváš tabulku, sloupec nebo index, nebo píšeš novou migraci.
---

# Změna databázového schématu

Nikdy `prisma migrate dev` (ani `npm run prisma:migrate`, které ho volá) a nikdy `db push`. Dev i produkční DB mají drift mimo `prisma/schema.prisma` (zbytková tabulka `system_logs`, jinak pojmenované indexy) a `migrate dev` by ho začal „opravovat“ – včetně mazání.

## Postup

1. Uprav `prisma/schema.prisma` a spusť `npm run prisma:generate` (klient do `src/generated/prisma`, gitignored).
2. Vygeneruj rozdíl proti skutečné DB:
   `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
   Ověř, že výstup obsahuje jen tvou změnu. Cokoli dalšího (drift) do migrace nepatří.
3. Ručně vytvoř `prisma/migrations/<YYYYMMDDHHMMSS>_<nazev>/migration.sql` jen s tvou změnou.
4. `npm run prisma:migrate:deploy` a `npx tsc --noEmit`.

## Pravidla migrací

- Existující soubory v `prisma/migrations/` se nikdy neupravují (blokuje hook i CI).
- Jen aditivní změny (expand): nová tabulka, nullable sloupec nebo sloupec s defaultem, index. `DROP`, `RENAME`, `SET NOT NULL`, `TRUNCATE` patří do samostatného contract PR až po nasazení kódu, který starý tvar nepoužívá, a CI je pustí jen s labelem `migration-contract-approved`. Podrobně `docs/SDLC.md` §6.
- Nový model s daty chaty dostane `cabinId String @map("cabin_id")`, relaci na `Cabin` s `onDelete: Cascade` a `@@index` začínající `cabinId`. Názvy sloupců snake_case přes `@map`, stejně jako okolní modely.

## Prisma 7 v tomto repu

- Adapter `@prisma/adapter-pg`; URL datasource jde z `prisma.config.ts` (`DATABASE_URL`), ne ze schématu.
- Klient se importuje jako `../generated/prisma/client.js` (relativně), sdílená instance je `src/utils/prisma.ts`.
- `prisma/schema.prisma` je citlivá cesta: PR s jeho změnou potřebuje label `human-reviewed`.
