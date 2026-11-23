# SDLC – jak se v Kdy na chatu mění kód

Verified: 2026-11-18
Scope: vývojový proces pro práci s AI agenty (Claude Code lokálně i v cloud session z mobilu). Postup podle kurzu AI Coding Crash Course (Matt Pocock).

Produkt je v `PRODUCT.md`, drahá rozhodnutí v `adr/`, práce a roadmapa v GitHub Issues (map issue #69). Tento dokument popisuje, **jak** se kód mění.
Značky: ⚙️ vynuceno strojem (CI, hook, GitHub nastavení), 🔜 plánované vynucení, bez značky dohoda.

Text v Markdownu je pro agenta jen doporučení. Skutečnou hranicí jsou GitHub ruleset a CI.

---

## 1. Principy

1. **Vynucené > napsané.** Opakovaná chyba agenta jde nejdřív do `CODING_STANDARDS.md` (chytí ji `/code-review`), a když se opakuje dál, do hooku nebo CI.
2. **Malé kroky.** Ticket = větev = PR, ideálně do 400 změněných řádků (bez lockfile a migrací).
3. **Izolace tenantů (`cabinId`) je nepřekročitelná.** Žádný PR nesmí oslabit autorizaci podle `cabinId` ani testy, které ji ověřují.
4. **Nejjednodušší řešení, které splní akceptační kritéria ticketu.** Žádné spekulativní abstrakce ani nevyžádané refaktory.
5. **Kód je primární zdroj.** Spec je dočasný artefakt: žije v issue, po dodání se issue zavře. V repu žádné specy ani plány, které by mohly zastarat.
6. **Každá změna je vratná** revertem PR nebo redeployem předchozí verze.

## 2. Životní cyklus

Mezi fázemi `/clear` – každá fáze začíná s čistým kontextem a čte jen issue.

| Fáze | Kdo | Skill | Výstup |
|---|---|---|---|
| 1. Nápad | člověk | – | GitHub issue (i z mobilu), label `needs-triage` |
| 2. Grill | člověk + agent | `/grilling` nebo `/grill-with-docs` | sdílené porozumění, rozhodnutí; nové pojmy a ADR přes `/domain-modeling` |
| 3. Spec | agent, člověk schválí | `/to-spec` | issue se specem, label `ready-for-agent` |
| 4. Tickety | agent, člověk schválí rozpad | `/to-tickets` | sub-issues specu (vertikální řezy), blokující vazby, `ready-for-agent` |
| 5. Implementace | agent | `/implement` (volá `tdd` a `code-review`) | větev s commity, zelený `npm run preflight:deploy` |
| 6. PR | agent | – | PR do `main` s `Closes #<ticket>` a výstupem preflight |
| 7. Review a merge | člověk | – | ⚙️ CI `preflight` + `guardrails` zelené, mobilní checklist (§8), squash merge |
| 8. Monitoring | člověk, agent | `/diagnosing-bugs` | incident = nové issue (viz `OPERATIONS-RUNBOOK.md`) |

**Zkratka pro drobnosti:** když jde změna popsat jednou větou (překlep, text, drobný bug), fáze 2–4 se přeskočí: issue → větev → PR. Brány v CI platí vždy.

**Kdo spouští skilly:** příkazy `/grilling`, `/to-spec`, `/to-tickets`, `/implement`, `/code-review` spouští uživatel (režim učení). Agent je z vlastní iniciativy nevolá, s výjimkou `tdd` a `code-review` uvnitř `/implement`.

**Implementace jednoho ticketu:**
1. Větev z aktuálního `origin/main`: `<typ>/<ticket>-<slug>` (`feat/72-predavka-foto`).
2. `/implement #<ticket>` – nejdřív failing test, pak kód; typecheck a jednotlivé testy průběžně, celá sada na konci.
3. `/code-review main` – osa Standards podle `CODING_STANDARDS.md`, osa Spec podle ticketu. Nálezy opravit v téže větvi.
4. `npm run preflight:deploy`, push větve, PR.
5. Po merge se ticket zavře sám (`Closes`). Spec issue zavře člověk, až jsou všechny jeho tickety hotové.

**Rytmus z mobilu:** grill a spec ideálně na počítači, z mobilu pak cloud session „`/implement #<ticket>`“. Jedna session = jeden ticket. Po dvou neúspěšných opravách session ukončit a ticket zpřesnit. Paralelně nejvýš 2 cloud sessions (sdílejí limity účtu).

## 3. Issues, labely, ADR

- Konvence práce s issues (`gh`): `docs/agents/issue-tracker.md`. Triage labely: `docs/agents/triage-labels.md`.
- Triage: `needs-triage` (nové), `needs-info` (čeká na doplnění), `ready-for-agent` (plně zadané, agent může začít), `ready-for-human` (musí udělat člověk – GitHub nastavení, server, účty), `wontfix`.
- Ticket obsahuje: co se má chovat jinak z pohledu uživatele, akceptační kritéria jako checklist, blokující tickety. Bez cest k souborům (zastarávají).
- Ticket, který sahá na data chaty, má v kritériích i tenant chování („uživatel z jiné chaty dostane 404“).
- ADR (`docs/adr/`, šablona `_TEMPLATE.md`) jen pro rozhodnutí, která je drahé vrátit (multi-tenancy, hosting, auth, platby). Vzniká během grillu přes `/domain-modeling`.

## 4. Kdy je ticket hotový

- [ ] ⚙️ CI `preflight` zelený (Prisma generate, backend typecheck, frontend testy, frontend build)
- [ ] ⚙️ CI `guardrails` zelený (velikost PR, citlivé cesty, `.only`/`.skip`, neměnné migrace)
- [ ] Každé akceptační kritérium ticketu má test, nebo PR říká, proč nejde automaticky testovat a jak bylo ověřeno
- [ ] `/code-review` proběhl a nálezy jsou opravené nebo v PR zdůvodněné
- [ ] Nová migrace je aditivní (§6)
- [ ] Popis PR: co a proč, `Closes #<ticket>`, výstup `npm run preflight:deploy`, rizika, rollback, zdůvodnění nových závislostí
- [ ] Titulek PR v Conventional Commits anglicky (`feat(calendar): …`) – stane se zprávou squash commitu

## 5. Testy

Dnes: frontend Vitest (`frontend-v2/src/test/`, jsdom), backend unit testy přes `node:test` (`src/**/*.test.ts`, spouští je i `preflight:deploy`) a backend integrační testy nad reálným PostgreSQL (`src/**/*.itest.ts`, krok 4 roadmapy #64).

| Vrstva | Nástroj | Co | Stav |
|---|---|---|---|
| Unit | Vitest / node:test | doménová logika (kalendář, náklady, hlasování), Zod schémata | ⚙️ |
| Integrační API | Supertest nad Express app + reálný PostgreSQL | endpointy, autorizace, validace | ⚙️ lokálně (`npm run test:integration`), v CI po vložení snippetu do `ci.yml` |
| Tenant isolation | Supertest + reálná DB, 2 seedované chaty | viz níže | ⚙️ rezervace; další domény 🔜 #64, povinné a blokující |
| E2E | Playwright | 3–5 kritických cest | 🔜 |

**Reálná DB, ne mocky.** Testy čtou jen `DATABASE_URL`, kterou nastaví skript; `.env` se nepoužije.

**Jak spustit integrační testy:**
- Lokálně (běžící Docker): `npm run test:integration` – dočasný `postgres:16` na portu **5433**, `prisma migrate deploy`, testy sériově, kontejner se smaže i při selhání. Lokální DB na 5432 tento režim nepoužije nikdy; `TEST_DATABASE_URL` lokálně nenastavujte.
- CI a cloud session: `TEST_DATABASE_URL=postgresql://…/kdynachatu_test npm run test:integration` – bez Dockeru, nad service containerem nebo `service postgresql start`.
- Guard: běh skončí ještě před migrací i před každým truncate, když název DB neobsahuje `test` nebo jde o `cabin_reservation`.
- Nový test: soubor `*.itest.ts`, první import `./env`; v `before` `setupIntegrationFile()` (truncate + seed chaty A a B se správcem a členem), požadavky přes `as(app, world.memberA)`, realtime přes `recordRealtimeEmits()` (`src/testing/integration/harness.ts`). Uploady jdou do dočasného adresáře, e-maily se neodesílají, rate limity jsou vypnuté.

**Tenant-isolation sada** (cíl #64): seed chaty A a B; každý endpoint s ID vrací uživateli z A na zdroj z B **404**; listy pro A neobsahují ID z B; socket z A se nedostane do roomu B; upload z B není dostupný s tokenem z A; meta-test projde modely s `cabinId` v `prisma/schema.prisma` a ověří, že každý má test.

**Pokrytí:** doménová logika ≥ 80 %, celkově ≥ 60 %; důležitější je, že v PR neklesne.

## 6. Databázové migrace

Postup krok za krokem je ve skillu `database-migrations` (`.claude/skills/database-migrations/SKILL.md`).

1. **Jen aditivní změny v jednom releasu (expand):** nové tabulky, nullable sloupce nebo sloupce s defaultem, indexy.
2. **Destruktivní změny** (drop, rename, `SET NOT NULL`, `TRUNCATE`) = contract v samostatném PR až po nasazení kódu, který starý sloupec nepoužívá. Přejmenování = 3 releasy (přidat → přepnout čtení/zápis a migrovat data → odstranit).
3. ⚙️ **Existující soubory v `prisma/migrations/` se nikdy neupravují.** Blokuje hook `.claude/hooks/protect-paths.mjs` a CI `guardrails`.
4. ⚙️ Nová `migration.sql` s `DROP`, `RENAME`, `SET NOT NULL` nebo `TRUNCATE` vyžaduje label `migration-contract-approved`.
5. V produkci jen `prisma migrate deploy` z deploy pipeline. ⚙️ `prisma migrate reset` a `db push` jsou v `.claude/settings.json` v deny.
6. Před produkční migrací záloha (`npm run backup:db`, viz `BACKUP-AND-RESTORE.md`), jednou měsíčně zkušební obnova.

## 7. Větve, PR a GitHub nastavení

`main` je vývoj pro víc rodin a nasazuje se na staging. Produkce se nasazuje jen z release tagu `vX.Y.Z` na `main` (release-please otevírá release PR, jeho merge vytvoří tag, `deploy.yml` čeká na schválení v environment `production`; ADR-0002). Jednokolejný tok — žádná samostatná produkční větev; hotfix je oprava na `main` → nový release tag. Archivovaná větev `rodina-stable` (tag `archive/rodina-stable`) se nemění ani nenasazuje. Větve `feat/…`, `fix/…`, `chore/…`, `docs/…` s číslem ticketu, případně `claude/…` z cloud sessions. Merge squash.

**Nastavení na GitHubu (ručně)** – bez toho ostatní pravidla chrání jen dobrovolnost agenta:

| Nastavení | Hodnota | Proč |
|---|---|---|
| Ruleset pro `main` | Require pull request, **0 required approvals**, block force push, block deletion | Sólo autor nemůže schválit vlastní PR |
| Required status checks | `preflight` (workflow CI), `guardrails` (workflow Guardrails) | Hlavní brána proti chybám AI |
| Require branches up to date | zapnout | Testy běží proti aktuálnímu `main` |
| Secret scanning + push protection | zapnout | Brání commitu secrets |
| CodeQL | default setup, JavaScript/TypeScript | Statická analýza v PR |
| Dependabot alerts + security updates | zapnout (`.github/dependabot.yml` je v repu) | Zranitelné závislosti |
| Environment `production` | required reviewer = vy, secrets `SSH_*` (`SERVER-SETUP.md` §7) | Brána před produkčním deployem z tagu (`deploy.yml`) |
| Auto-merge | vypnuto | Merge je vždy vědomé rozhodnutí |
| Actions → Workflow permissions | read-only `GITHUB_TOKEN` + allow GitHub Actions to create pull requests | Minimum oprávnění; release-please otevírá release PR |

**Labely:** triage (§3) a pro guardrails `human-reviewed`, `large-pr-ok`, `migration-contract-approved`.

**Citlivé cesty** – ⚙️ `guardrails` u nich vyžaduje label `human-reviewed`, který přidáváte vy po přečtení změny:
`.github/**`, `.claude/**`, `CLAUDE.md`, `Dockerfile`, `docker-compose.yml`, `nginx-chata.conf`, `prisma/schema.prisma`, `src/middleware/**`, `src/backend/routes/auth*`, `src/utils/prisma.ts`, `src/utils/socket.ts`.
Claude GitHub App má právo zapisovat i do workflow, proto se změny v `.github/` hlídají labelem, ne důvěrou.

## 8. AI guardrails a mobilní review

| Selhání AI | Protiopatření |
|---|---|
| Smaže nebo oslabí test, přidá `.skip`/`.only` | ⚙️ `guardrails`: zákaz `.only`/`.skip` v přidaných řádcích; 🔜 počet testů nesmí klesnout |
| Porušuje konvence repa | `/code-review` podle `CODING_STANDARDS.md` |
| Halucinované API nebo balíček | ⚙️ typecheck + build; nová závislost musí mít zdůvodnění v PR |
| Příliš široký diff, nevyžádaný refaktor | ⚙️ PR nad 400 řádků bez labelu `large-pr-ok` = fail; osa Spec v `/code-review` |
| Zásah do CI, secrets, migrací, auth | ⚙️ PreToolUse hook + `guardrails` + label `human-reviewed` |
| „Hotovo“ bez důkazu | PR musí obsahovat výstup preflight; 🔜 Stop hook s typecheckem |
| Únik dat mezi chatami | 🔜 tenant-isolation sada + meta-test (#64) |

**Mobilní review checklist (2–5 minut na PR):**
1. Jsou všechny required checks zelené? Pokud ne, nemergovat.
2. Odpovídá PR jednomu ticketu? Je v popisu `Closes #…`?
3. Změnil se soubor s testy? Jde o přidání, ne oslabení?
4. Je v PR migrace? Je aditivní?
5. Mění se auth, middleware, Prisma schema, `.claude/` nebo `.github/`? Přečíst celé, teprve pak `human-reviewed`.
6. Nové závislosti? Známé a zdůvodněné?
7. Obsahuje popis výstup preflight a výsledek `/code-review`?

**Steering agenta v repu** – co je v kontextu vždy, musí si to zasloužit (pravidla prořezávání: jediný zdroj pravdy, žádný sediment, žádné no-opy):
- `CLAUDE.md` – jen nepřekročitelná pravidla, příkazy a navigační pointery.
- `CODING_STANDARDS.md` – konvence, načítá je jen `/code-review`; smí růst.
- `.claude/skills/` – skilly, které Claude Code načítá i v cloud session: projektové (`database-migrations`) a kopie `mattpocock/skills` (commit v `docs/AI-INFRASTRUCTURE-REGISTRY.md`; aktualizace = nová kopie, ne ruční úpravy). `.agents/skills/` čte jen Copilot.
- `docs/agents/` – konfigurace pro skilly (issue tracker, labely, doménové dokumenty).
- `.claude/settings.json` – deny pravidla a PreToolUse hook, vypnutá auto-memory. `.claude/hooks/protect-paths.mjs` – exit 2 pro `.env*`, `.github/**`, `.claude/settings*.json`, `.claude/hooks/**` a existující migrace.
- Deny pravidla a hooky jsou první linie, ne bezpečnostní hranice (`git -C . push …` je obejde). Hranicí je ruleset a CI.

**Co vědomě nedělat:** samostatný plan krok, specy v repu, sprinty, story pointy, ADR pro levná rozhodnutí, automatická paměť agenta, honba za 100% pokrytím.
