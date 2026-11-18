# Backup and Restore

Repo ted obsahuje zakladni backup manager pro databazi a uploads.

Primarni cil:

- mit pravidelny backup PostgreSQL databaze,
- mit pravidelny backup `data/uploads`,
- mit jednoduchy a opakovatelny restore postup,
- nespolihat jen na ad hoc kopii dat pri deployi.

## Co se zalohuje

### Databaze

- PostgreSQL dump pres `pg_dump`
- format: custom dump
- vhodne pro obnovu pres `pg_restore`

### Uploady

- archiv celeho `UPLOADS_PATH`
- standardne `data/uploads`
- archiv obsahuje i thumbnaily a wallpapers, pokud jsou uvnitr uploads stromu

## Kde se zalohy ukladaji

Standardne do:

```text
data/backups/
  db/
  uploads/
```

Na produkci doporucuji pouzit cestu mimo working tree, napriklad:

```text
/home/reathyze/backups/cabin
```

Pres env promennou:

```bash
BACKUP_ROOT=/home/reathyze/backups/cabin
```

## Env promenne

- `DATABASE_URL` - povinna pro backup a restore DB
- `UPLOADS_PATH` - volitelna, default `data/uploads`
- `BACKUP_ROOT` - volitelna, default `data/backups`
- `BACKUP_RETENTION_DAYS` - volitelna, default `14`
- `PG_DUMP_COMMAND` - volitelna, override pro `pg_dump`; pro wrapper command pouzij JSON pole
- `PG_RESTORE_COMMAND` - volitelna, override pro `pg_restore`; pro wrapper command pouzij JSON pole

## Spusteni backupu

### Databaze

```bash
npm run backup:db
```

### Uploady

```bash
npm run backup:uploads
```

### Oboji najednou

```bash
npm run backup:all
```

### Opakovatelny smoke test backup + restore

```bash
npm run backup:smoke
```

Tenhle smoke test:

- spusti disposable PostgreSQL 16 kontejner,
- vytvori fixture data v DB i v `uploads`,
- spusti skutecny `backupManager` pro `backup all`,
- obnovi DB dump do druhe test DB,
- obnovi uploads archiv do docasneho adresare,
- porovna vysledky a skonci chybou pri jakemkoliv nesouladu.

Na Windows je to zaroven hlavni zpusob, jak overit DB backup/restore bez lokalne nainstalovanych `pg_dump` a `pg_restore`.

Po kazdem backupu vznikne:

- samotny archiv nebo dump,
- vedle nej metadata soubor `.json`,
- probehne prune souboru starsich nez `BACKUP_RETENTION_DAYS`.

## Nacvik migrace (rehearsal)

```bash
npm run migration:rehearsal
```

Nacvicitelna migracni cesta zalohy (restore -> backfillCabin -> count-check) proti
odhoditelnemu `postgres:16` kontejneru. Slouzi k overeni cutover postupu bez zasahu
do produkce.

Co rehearsal dela:

- spusti disposable PostgreSQL 16 kontejner (publikovany na `REHEARSAL_PG_PORT`,
  default `59432`, aby nekolidoval s lokalni DB na 5432),
- vytvori source DB ve tvaru stare zalohy pred multi-tenancy (vetsina radku ma
  `cabinId = NULL`, jedna rezervace uz patri existujici chate),
- zazalohuje source pres skutecny `backupManager` a obnovi do ciloveho DB,
- spusti skutecny `backfillCabin` nad obnovenymi daty,
- **count-check**: porovna pocty radku source vs. obnoveno+backfillnuto pro vsechny
  entity (`users`, `reservations`, `shoppingItems`, `noteThreads`, `notes`, `gallery`,
  `diary`, `reconstructionItems`, `inventoryItems`) — restore ani backfill nesmi
  zadny radek ztratit, zduplikovat ani preskocit,
- **spot-check** jedne rezervace: po restore zustava beze zmeny a backfill ji doplni
  `cabinId`,
- overi, ze rezervace s uz existujicim `cabinId` si ho podrzi (backfill doplnuje jen
  `NULL`, nikdy neprepisuje),
- obnovi uploads archiv a overi pocet souboru,
- skonci chybou pri jakemkoliv nesouladu.

Cistou count-check funkci (`compareCounts`) pokryvaji unit testy
`src/scripts/migrationCountCheck.test.ts` (`npm run test:backend`).

> Pozn.: krok s uploady vola `tar` s archivni cestou na disku `C:`. Spoustej rehearsal
> z PowerShellu (`tar` = `System32\tar.exe`/bsdtar); GNU `tar` z Gitu bere `C:` jako
> vzdaleny host a selze. Na serveru/CI (POSIX) je to bez rozdilu.

## Restore

Restore je zamerne oddeleny od `npm run`, protoze potrebuje konkretni soubor a explicitni potvrzeni.

### Restore databaze

```bash
npx tsx src/scripts/backupManager.ts restore db --file /cesta/k/backupu.dump --yes
```

Poznamka:

- restore DB je destruktivni operace,
- pred obnovou doporucuji udelat novy aktualni backup,
- idealne nejdriv overit restore na test DB.

### Restore uploadu

```bash
npx tsx src/scripts/backupManager.ts restore uploads --file /cesta/k/backupu.tar.gz --yes
```

Chovani:

- aktualni uploads adresar se pred obnovou prejmenuje na `uploads.before-restore-<timestamp>`,
- teprve potom se nasadi obsah z archivu.

## Doporuceny cron na serveru

Priklad pro VPS s NVM:

```bash
0 3 * * * cd /home/reathyze/chata && export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && BACKUP_ROOT=/home/reathyze/backups/cabin BACKUP_RETENTION_DAYS=14 npm run backup:all >> /home/reathyze/chata/data/logs/backup-cron.log 2>&1
```

Tenhle cron patri do crontabu uzivatele `reathyze`, ne do roota. Jinak si zbytecne vyrobis root-owned soubory v backupech nebo logach.

Co ten cron dela:

- kazdy den ve 3:00 spusti backup DB i uploadu,
- uklada zalohy mimo repo working tree,
- zapisuje vystup do lokalniho logu,
- automaticky maze starsi zalohy podle retence.

### Manualni instalace cronu z lokalniho pocitace

Produkci deploy ted cron automaticky obnovi pri kazdem uspesnem nasazeni a pokud v backup rootu nic neni, seedne i prvni backup.

PowerShell helper zustava uzitecny pro rucni re-run nebo kdyz potrebujes operational opravu mimo standardni deploy:

```powershell
.\manual-install-backup-cron.ps1
```

Script:

- instaluje cron pod uzivatelem `reathyze`,
- vytvori backup adresar a log directory, pokud jeste neexistuji,
- pred instalaci overi, ze se pod `reathyze` po nacteni NVM opravdu najde `node` a `npm`,
- odmitne se spustit, pokud server jeste nebezi z verze obsahujici `backup:all` a `src/scripts/backupManager.ts`,
- umi volitelne spustit i prvni overovaci backup pres `-RunInitialBackup`.

Priklad po deployi:

```powershell
.\manual-install-backup-cron.ps1 -RunInitialBackup
```

## Doporuceny restore postup

### Databaze

1. Zastavit aplikaci nebo zajistit maintenance okno.
2. Udelat novy bezprostredni backup aktualni DB.
3. Otestovat restore na test databazi, pokud je to mozne.
4. Spustit `restore db --file ... --yes`.
5. Zkontrolovat health endpoint a prihlaseni.

### Uploady

1. Udelat novy bezprostredni backup aktualnich uploadu.
2. Spustit `restore uploads --file ... --yes`.
3. Zkontrolovat galerii, thumbnaily a wallpapers.

## Off-site kopie na lokální PC

Zálohy na VPS nepřežijí ztrátu serveru (pozastavení služby, smazání VPS, havárie disku).
Proto se denně stahují na PC skriptem `manual-pull-backups.ps1` (zatím místo placených záloh
u poskytovatele nebo object storage).

Předpoklady:

- SSH klíč na PC funguje bez hesla (nebo přes `ssh-agent`) pro `reathyze@<IP serveru>`,
- host key serveru je v `known_hosts` — poprvé se připoj ručně: `ssh reathyze@<IP serveru>`,
- na serveru už proběhl aspoň jeden backup (deploy ho seedne, jinak cron ve 3:00).

Jednorázové stažení a registrace denní úlohy v Plánovači úloh Windows:

```powershell
.\manual-pull-backups.ps1 -ServerHost <IP serveru> -InstallScheduledTask
```

Co skript dělá:

- stáhne do `%USERPROFILE%\chata-zalohy\{db,uploads}` jen soubory, které lokálně chybí,
- přeskočí soubory mladší 10 minut (záloha se možná ještě zapisuje),
- každý soubor ověří přes SHA-256 proti serveru (do té doby leží jako `.part`),
- lokálně drží zálohy 30 dní (`-KeepDays`), vždy ale nejméně 3 nejnovější od každého druhu (`-MinKeep`),
- když je nejnovější záloha starší než 48 h (`-StaleHours`), skončí exit kódem 2 — server
  pravděpodobně přestal zálohovat,
- loguje do `%USERPROFILE%\chata-zalohy\pull-backups.log`.

Naplánovaná úloha „Chata - stažení záloh" běží denně ve 12:00 (`-TaskTime`). PC neběží pořád,
proto má zapnuté „spustit co nejdříve po zmeškání" — doběhne po zapnutí PC. Při chybě nebo
staré záloze ukáže notifikaci ve Windows. Odebrání: `Unregister-ScheduledTask -TaskName "Chata - stažení záloh"`.

Limity:

- kopie je jen tak čerstvá, jak často běží PC; server drží 14 dní, takže PC stačí zapnout
  aspoň jednou za ~13 dní, jinak se nejstarší zálohy ztratí bez stažení,
- archiv uploads je pokaždé plný (ne inkrementální) — při 30denní retenci počítej s ~30× velikostí
  galerie na disku PC,
- `.env` (tajné klíče, SMTP) se nezálohuje — pro obnovu ho drž zvlášť (správce hesel / šifrovaně).

## Co tento zaklad jeste neresi

- automatickou kontrolu uspesnosti backupu pres alert (castecne: lokalni pull upozorni na starou zalohu),
- snapshot celeho serveru,
- point-in-time recovery PostgreSQL,
- off-site kopii nezavislou na tom, jestli bezi domaci PC (object storage / druhy stroj).
