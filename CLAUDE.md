# Kdy na chatu

Rodinná PWA na koordinaci sdílené chaty (rezervace, nákupy, předávka, poznámky), multi-tenant podle `cabinId`. Backend Express + Prisma v `src/`, frontend React v `frontend-v2/`. Uživatelské texty a dokumentace česky, kód, commity a titulky PR anglicky (Conventional Commits, `feat(calendar): …`).

## Nepřekročitelná pravidla
- IMPORTANT: Každý dotaz na data chaty filtruje podle `cabinId` z přihlášeného uživatele (`src/middleware/cabinMiddleware.ts`). Nikdy nevěř `cabinId` z těla requestu, URL ani hlavičky. Cizí zdroj vrací 404.
- Nikdy neměň ani nemaž existující testy jen proto, aby prošly. Když je test podle tebe chybný, zastav se a napiš proč.
- Nikdy `prisma migrate dev` ani `db push`. Změna schématu jen podle skillu `database-migrations`; existující soubory v `prisma/migrations/` se nikdy neupravují.
- Neměň `.github/`, `.claude/`, auth ani middleware bez výslovného zadání.
- Nikdy nepracuj s produkční databází ani produkčními soubory. Staging používá jen fiktivní data.
- Nikdy push do `main` ani do `rodina-stable`. Jeden ticket = jedna větev z `main` = jeden PR do ~400 řádků.
- `rodina-stable` = rodinná produkce (push spouští produkční deploy). Jdou do ní jen opravy výslovně zadané jako hotfix: oprava nejdřív na `main`, pak cherry-pick do `hotfix/<popis>` z `rodina-stable` a PR do `rodina-stable` (`docs/plans/SEP-1.md`).

## Proces
Práce jde přes GitHub Issues: grilling → `/to-spec` → `/to-tickets` → `/implement` → `/code-review`, mezi fázemi `/clear`. Postup, brány a GitHub nastavení: `docs/SDLC.md` – přečti, než začneš nový ticket nebo PR. Roadmapa je map issue #69.

V tomto repu tento tok nahrazuje `superpowers:brainstorming`, `superpowers:writing-plans` a gstack `/spec`, `/autoplan`, `/ship`: nepoužívej je, samostatný plán se nepíše.

## Příkazy
- Dva nepropojené npm projekty: root (backend) a `frontend-v2/`. Instalace `npm install && npm --prefix frontend-v2 install`.
- `npm run preflight:deploy` – Prisma generate + backend typecheck + frontend testy + build. Musí projít před PR, výstup patří do popisu PR.
- `npx tsc --noEmit` – backend typecheck. `npm --prefix frontend-v2 run lint` – ESLint.
- `npm test` = backend (node:test přes tsx, `src/**/*.test.ts`) + frontend (Vitest).
- Jeden soubor: `node --import tsx --test src/backend/routes/reservationHelpers.test.ts`, `cd frontend-v2 && npx vitest run src/test/nudges.test.ts`, podle názvu `npx vitest -t "název"`.
- `npm run validate:ai` – povinně po změně `.agents/`, `memories/`, `docs/AI-INFRASTRUCTURE*`.
- DB v cloud session: `service postgresql start`, pak `npx prisma migrate deploy` proti `DATABASE_URL`.
- Backend bez `JWT_SECRET` (nebo s placeholderem) nenastartuje. Lokální admin: `npm run create-learning-admin` (jen dev, `LEARNING_ADMIN_PASSWORD` min. 12 znaků v `.env`).

## Navigation
- `memories/repo/architecture.md` – jak je aplikace poskládaná (pipeline, auth, vzor rout, frontend vrstvy). Přečti před prací, která zasahuje do víc vrstev.
- `memories/repo/stack-facts.md` – verze stacku, hosting, server (NVM pod `/home/reathyze/.nvm`).
- `docs/PRODUCT.md` a `docs/adr/` – co produkt je a není, rozhodnutí, která je drahé vrátit.
- `CODING_STANDARDS.md` – pravidla, podle kterých `/code-review` posuzuje diff.
- `src/validators/schemas.ts` – všechna Zod schémata vstupů; `src/backend/openapi.ts` – ručně psaná API spec, mění se s každým endpointem.
- `src/types.ts` ↔ `frontend-v2/src/api/*.ts` – wire typy záměrně zdvojené, mění se spolu.
- `frontend-v2/src/hooks/useRealtimeSync.ts` – Socket.IO event → invalidace dotazů; nový serverový event sem patří vždy.
- `.agents/skills/CabinSaaS_Architect/SKILL.md` – pravidla a inventář komponent pro `frontend-v2/`; přečti před prací na UI.

## Agent skills

### Issue tracker

Issues a specy jsou GitHub issues v `Reathyze20/Kdynachatu.cz` (CLI `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Pět výchozích rolí (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` (vzniká líně) + `docs/adr/` v kořeni repa. See `docs/agents/domain.md`.

