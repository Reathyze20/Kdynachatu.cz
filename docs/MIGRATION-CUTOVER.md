# Runbook: cutover rodinných dat (bezpečnostní kroky)

Bezpečnostní část přepnutí rodiny na verzi z `main` (chata č. 1) podle [ADR-0002](adr/0002-hosting-a-deploy.md). Produkce startuje ze zálohy z 2026-11-06, takže je potřeba před zpřístupněním rodině:

1. **rotovat `JWT_SECRET`** – zneplatní všechny staré tokeny, rodina se znovu přihlásí,
2. **odstranit slabý seed účet** `admin` / `tajneheslo123`, pokud v záloze zůstal.

Tyhle dva kroky navazují na věcnou migraci dat (`backup → restore → backfillCabin → count-check`, nacvičeno v `npm run migration:rehearsal`). Tenhle dokument řeší jen bezpečnost, ne převod dat.

> ⚠️ Běží proti **cílové produkční** databázi. Spouštěj jen během reálného cutoveru, ne na lokální kopii rodinných dat kvůli zkoušce (na zkoušku slouží `migration:rehearsal` nad jednorázovým kontejnerem).

---

## 1. Rotace `JWT_SECRET`

Aplikace bez platného `JWT_SECRET` nenastartuje a odmítne i známé placeholdery (`src/config/config.ts`). Po rotaci přestanou platit všechny vydané přihlašovací tokeny – **celá rodina se bude muset znovu přihlásit**, proto je dopředu upozorni.

### Postup

1. **Vygeneruj nový náhodný klíč** (min. 32 znaků):
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
2. **Ulož ho do správce hesel** (produkční tajemství, necommituje se).
3. **Zapiš ho do produkčního `.env`** na serveru jako `JWT_SECRET=<nový klíč>`. Staging má vlastní, jiný klíč – nesdílet.
4. **Restartuj aplikaci**, aby klíč načetla:
   ```bash
   npx pm2 restart chata-app && npx pm2 save
   ```
5. **Ověř**, že aplikace naběhla a `GET /api/health` vrací `status = ok` (viz `docs/OPERATIONS-RUNBOOK.md`).
6. **Zkus se přihlásit** jedním rodinným účtem – staré tokeny musí být odmítnuté, nové přihlášení musí projít.

### Když aplikace po rotaci nenaběhne

Nejčastěji chybějící, příliš krátký nebo placeholderový `JWT_SECRET`. Config vypíše `FATAL: JWT_SECRET ...` do logu – zkontroluj `npx pm2 logs chata-app --lines 50 --nostream`.

---

## 2. Odstranění slabého účtu `admin`

Rané běhy `createLearningAdmin` zakládaly účet `admin` s heslem `tajneheslo123`. Pokud přežil v záloze, je to veřejně známé přihlašovací údaje – před cutoverem pryč.

Skript `src/scripts/removeWeakAdmin.ts` (`npm run migration:remove-admin`) je **idempotentní** a **bezpečný ve výchozím stavu**:

- **Výchozí = DRY RUN.** Nic nezapíše, jen vypíše, co by udělal. Zápis až s `--apply`.
- **Zasáhne jen účet, jehož heslo se opravdu ověří proti `tajneheslo123`.** Legitimní účet, který se jen jmenuje `admin`, ale má silné heslo, se vypíše a nechá být – tím skript respektuje multi-tenant (nemaže nic nad rámec zadaného účtu).
- **Výchozí akce = DELETE** (po cutoveru nemá účet existovat). Pokud by účet přece jen vlastnil nějaký obsah (rezervace, poznámky…), skript sám **přejde na BLOCK** (ban + přepsání hesla náhodným řetězcem), aby smazání nekaskádovalo ztrátu dat. Vynutit blokaci pro všechny shody lze přes `--block`.
- **Opakovaný běh** nad už čistou DB nenajde nic a skončí s kódem 0.
- Na konci `--apply` běhu skript **ověří**, že žádný účet se zadaným jménem už slabé heslo nepřijímá; jinak skončí s chybou (exit 1).

### Postup

1. **Nejdřív nasucho** – uvidíš, co skript našel a co by udělal, bez zápisu:
   ```bash
   npm run migration:remove-admin
   ```
2. **Pak aplikuj.** Výchozí běh účet smaže (nebo ho bezpečně zablokuje, pokud vlastní data):
   ```bash
   npm run migration:remove-admin -- --apply
   ```
   Pokud chceš účet jen zablokovat a zachovat řádek (ban + přepsané heslo), ne mazat:
   ```bash
   npm run migration:remove-admin -- --apply --block
   ```
3. **Ověř výstup** – poslední řádek musí být `✅ Verified: no account named "admin" accepts the weak password anymore.`

Jiné jméno účtu lze zadat přes `--username <jméno>` (výchozí `admin`).

### Akceptační ověření

Po výchozím `--apply` běhu v cílové DB účet `admin` se slabým heslem neexistuje – je smazaný (nebo, pokud vlastnil data, zablokovaný s přepsaným heslem, takže `admin` / `tajneheslo123` už nejde přihlásit). Skript to na konci sám přeověří; při pochybách spusť znovu dry run – nesmí nahlásit nic akčního.
