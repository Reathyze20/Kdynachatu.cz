# ADR-0002: Hosting a nasazování – jeden VPS, staging z `main`, produkce z tagu

Datum: 2026-11-17 · Stav: přijato (implementace: krok 3 roadmapy) · Nahrazuje dvojkolejnost `main` / `rodina-stable` z [SEP-1](../plans/SEP-1.md)

## Kontext

SEP-1 (9/2026) zmrazil rodinnou produkci na větvi `rodina-stable` (jen hotfixy) a nový vývoj pustil na `main` → staging, s návratem rodiny až po dokončení multi-tenancy. Mezitím se změnily předpoklady:

- starý server (WEDOS, `89.221.217.81`) je pozastavený kvůli nezaplacenému prodloužení a doména `chataceskestredohori.cz` vypršela – rodina aplikaci teď nemá; jediná kopie dat je záloha z 2026-11-06,
- rodina je priorita a má dostávat novinky průběžně, ne až za měsíce,
- sólo vývojář: cherry-pick hotfixů mezi dvěma rozjíždějícími se větvemi je zbytečná daň.

## Rozhodnutí

**Jedna kódová základna (`main`), rodina je chata č. 1 – první tenant.** Merge do `main` nasadí automaticky **staging** (fiktivní data); **produkce** se nasazuje jen z release tagu `v*` po ručním schválení v GitHub environment `production`. Obě prostředí běží na **jednom VPS**, oddělená.

## Zvažované varianty

- A: Držet SEP-1 (+ produkce chráněná větví; − rodina bez novinek až do konce multi-tenancy, dvojí údržba).
- B: Funkce i do `rodina-stable` (− dvě rozjíždějící se kódové základny).
- **C: Jedna větev, staging z `main`, produkce z tagu se schválením** (+ rodina dogfooduje každou verzi, žádný cherry-pick; − produkci chrání proces – tag + schválení + CI – místo větve).

## Důsledky

- **Server:** VPS v EU se 4 GB RAM, Ubuntu 24.04 (kandidáti: Netcup VPS Lite 4 GB ~€6/měs., Hetzner CX23; konkrétní poskytovatel se doplní při objednávce). Produkce a staging oddělené: jiná DB i DB uživatel (staging nemá přístup k produkční DB), jiný PM2 proces a port, jiný adresář uploadů, jiný `.env` s vlastním `JWT_SECRET`. Postup: [SERVER-SETUP.md](../SERVER-SETUP.md) + staging část [SEP-1-staging-setup.md](../plans/SEP-1-staging-setup.md).
- **Build v GitHub Actions**, na server jde hotový artefakt – produkce při deployi nepadá na paměť.
- **Domény:** `kdynachatu.cz` = produkce (rodina se přihlašuje tam; registrace platí do 2027-02-23 – prodloužit), `staging.kdynachatu.cz` za HTTP basic auth. Stará `chataceskestredohori.cz` vypršela 2026-09-27, redirect proto odpadá.
- **Data:** produkce startuje ze zálohy 2026-11-06 (DB + uploady); novější data neexistují. Před migrací kontrola počtů, po ní smoke test.
- **`rodina-stable`** se po přechodu archivuje (tagy zůstanou); pravidla o ní v `CLAUDE.md`, SDLC a `.github/` se odstraní spolu s implementací tohoto ADR.
- Stávající pojistky zůstávají: `scripts/deploy/remote-deploy.sh` odmítne špatný ref, `deploy-staging.yml` je vypnutý do nastavení serveru (`STAGING_ENABLED`).
- Rychlá cesta do produkce zvyšuje riziko úniku dat mezi chatami → tenant-isolation testy (krok 4) jsou povinné dřív než členství (krok 7).
- Přehodnotit při komerčním spuštění (managed DB, oddělený staging stroj, kontejnery).
