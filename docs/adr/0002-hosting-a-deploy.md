# ADR-0002: Hosting a nasazování – jeden VPS, staging z `main`, produkce z tagu

Datum: 2026-11-17 · Stav: přijato (implementace: krok 3 roadmapy) · Nahrazuje dvojkolejnost `main` / `rodina-stable` z [SEP-1](https://github.com/Reathyze20/Kdynachatu.cz/blob/9dca8785807bde1774f4e52f67bf012b463a4ab4/docs/plans/SEP-1.md) (dokument odstraněn v #99)

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

- **Server:** Netcup VPS nano G11.5s (2 vCore, **2 GB RAM**, 60 GB), Ubuntu 24.04, EU, €3,76/měs. s DPH (~1 150 Kč/rok; objednáno 2026-11-17). 2 GB stačí jen za těchto podmínek: build výhradně v GitHub Actions (na serveru žádný `npm ci` s dev závislostmi ani Vite build), swap 2 GB, Postgres s malými paměťovými limity, staging spuštěný jen podle potřeby (PM2 `stop`, když se netestuje). Při OOM nebo trvalém swapování přejít na VPS Lite 4 GB (~1 800 Kč/rok). Produkce a staging oddělené: jiná DB i DB uživatel (staging nemá přístup k produkční DB), jiný PM2 proces a port, jiný adresář uploadů, jiný `.env` s vlastním `JWT_SECRET`. Postup: [SERVER-SETUP.md](../SERVER-SETUP.md) + staging část [STAGING-SETUP.md](../STAGING-SETUP.md).
- **Build v GitHub Actions**, na server jde hotový artefakt – při 2 GB RAM je to podmínka, ne optimalizace.
- **Domény:** `kdynachatu.cz` = produkce (rodina se přihlašuje tam; registrace platí do 2027-02-23 – prodloužit), `staging.kdynachatu.cz` za HTTP basic auth. Stará `chataceskestredohori.cz` vypršela 2026-09-27, redirect proto odpadá.
- **Data:** produkce startuje ze zálohy 2026-11-06 (DB + uploady); novější data neexistují. Před migrací kontrola počtů, po ní smoke test.
- **`rodina-stable`** se po přechodu archivuje (tagy zůstanou); pravidla o ní v `CLAUDE.md`, SDLC a `.github/` se odstraní spolu s implementací tohoto ADR.
- Stávající pojistky zůstávají: `scripts/deploy/deploy-release.sh` odmítne špatný ref i cíl (staging nesmí na produkční adresář, port, PM2 proces ani DB), `deploy-staging.yml` je vypnutý do nastavení serveru (`STAGING_ENABLED`).
- Rychlá cesta do produkce zvyšuje riziko úniku dat mezi chatami → tenant-isolation testy (krok 4) jsou povinné dřív než členství (krok 7).
- Přehodnotit při komerčním spuštění (managed DB, oddělený staging stroj, kontejnery).
