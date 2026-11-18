# Operations Runbook

Kratky operational runbook pro minimum kolem monitoringu, alertingu, post-deploy smoke checku a prvni reakce na incident.

Tenhle dokument je zamerne kratky. Nenahrazuje detailni QA, ale ma zrychlit prvni kontrolu po deployi a prvni zasah, kdyz appka nejede.

---

## 1. Co je v repu pripraveno

- Health endpoint: `GET /api/health` vraci `status`, `timestamp` a stav DB pingu.
- Deploy workflow ceka na `GET http://localhost:3000/api/health`, ne na nahodny protected endpoint.
- Manualni smoke helper: `./manual-post-deploy-smoke-check.ps1`.
- Manualni PM2 log rotation helper: `./manual-install-pm2-logrotate.ps1`.
- Funkcni manualni E2E subset je v `docs/SMOKE-TEST.md`.

---

## 2. Minimalni monitoring setup

Pro family-ready minimum staci dva uptime monitory a jeden alert channel.

### Doporucene monitory

1. Hlavni web
- URL: `https://chataceskestredohori.cz`
- Typ: HTTP(S)
- Interval: 5 minut na free tieru
- Ocekavani: HTTP 200-399

2. API health endpoint
- URL: `https://chataceskestredohori.cz/api/health`
- Typ: HTTP(S)
- Interval: 5 minut na free tieru
- Ocekavani: HTTP 200 a JSON se `status = ok`

### Alert minimum

- Primarni kanal: e-mail
- Doporuceni proti flappingu: alert az po 2 po sobe jdoucich fail checkach
- Pokud nastroj umi escalation, pridej druhy kanal az pozdeji

### Prakticka volba nastroje

- UptimeRobot: nejjednodussi start, free tier staci
- Better Stack: lepsi UX a jemnejsi incident workflow, pokud ho chcete resit vic seriozne

---

## 3. PM2 log rotation

Bez log rotation riskujes, ze `pm2 logs` a soubory v `data/logs` casem zbytecne porostou.

### Doporucena konfigurace

- modul: `pm2-logrotate`
- max size: `10M`
- retain: `30`
- compress: `true`
- rotate interval: `0 0 * * *`

### Instalace po deployi

```powershell
.\manual-install-pm2-logrotate.ps1
```

### Co script udela

- nainstaluje `pm2-logrotate` pod uzivatelem `reathyze`,
- nastavi doporucene limity,
- vypise vyslednou konfiguraci modulu,
- ulozi PM2 stav.

### Co po instalaci overit

- `npx pm2 module:list` obsahuje `pm2-logrotate`
- v `/home/reathyze/.pm2/module_conf.json` je sekce `pm2-logrotate` se spravnymi hodnotami
- po case neroste disk jen kvuli logum

---

## 4. Kratky post-deploy smoke check

Nejdv spust operacni minimum, teprve potom manualni funkcni scenare.

### Fast smoke

```powershell
.\manual-post-deploy-smoke-check.ps1
```

Pokud uz je na serveru po deployi nainstalovany backup cron a `pm2-logrotate`, pust i prisnejsi variantu:

```powershell
.\manual-post-deploy-smoke-check.ps1 -RequireOperationsMinimum
```

Script kontroluje:

- ze `chata-app` je v PM2 online,
- ze `http://localhost:3000/` odpovida,
- ze `http://localhost:3000/api/health` vraci `status = ok`,
- ze verejny web a verejny health endpoint odpovidaji,
- posledni kratke PM2 logy bez potreby rucniho opisovani prikazu.

Se zapnutym `-RequireOperationsMinimum` navic kontroluje:

- ze je v crontabu uzivatele `reathyze` nainstalovany backup job,
- ze je v PM2 nainstalovany `pm2-logrotate`,
- ze je videt aktivni konfigurace `pm2-logrotate`.

### Kdyz fast smoke projde

Pokud nasazeni menilo auth, onboarding, invites nebo shopping, navaz manualnim subsetem v `docs/SMOKE-TEST.md`.

---

## 4.1 Jak ted rychle hledat pady a incidenty

Nova prvni linie podpory je postavena na korelacnim kodu chyby a rozsirene filtraci logu.

### Co rict rodine, kdyz nahlasi problem

- Kdyz appka ukaze chybu, poslete screenshot cele obrazovky nebo opsany `Kod chyby`.
- Pokud chyba neni fullscreen, staci napsat priblizny cas, obrazovku a co klikli.

### Co pak udelat vy jako vyvojar

1. Otevrit Admin nebo Superadmin log panel.
2. Do filtru `Request ID` nebo `Text` vlozit kod chyby.
3. Kdyz kod nemate, filtrovat podle:
	- `User ID`, pokud vite koho se to tykalo,
	- `Cesta`, pokud vite ktera cast appky padala,
	- `Status = 500`, pokud slo o pad backendu,
	- `Zdroj = frontend`, pokud spadla komponenta nebo render.
4. Otevrit detail logu a spojit si:
	- `Request`,
	- `Error`,
	- `Uživatel`,
	- `Cesta`,
	- `Modul`.

### Co je dulezite vedet

- Backend vraci `X-Request-ID` pro kazdy request.
- Pri 500 se do response prida i `errorId`.
- Frontend si tenhle kod pamatuje a pripojuje ho do error toastu a fallback obrazovek.
- Frontend error reporting ho posila i do `/api/logs/client`, takze jeden kod jde dohledat napric frontend i backend logy.

Tohle je zakladni levna nahrada za heavyweight stack typu Kibana: ne plny observability ekosystem, ale rychle filtrovani podle jedne stopy.

---

## 5. Incident postup: co zkontrolovat, kdyz appka nejede

Jdi po nejkratsim operational sledu. Cilem je rychle zjistit, jestli je problem v procesu, health endpointu, DB nebo reverzni proxy vrstve.

### 1. Overit verejny signal

```powershell
Invoke-WebRequest https://chataceskestredohori.cz -Method Get
Invoke-RestMethod https://chataceskestredohori.cz/api/health
```

Kdyz failuje oboji, je to globalnejsi problem nez jen jedna feature.

### 2. Zkontrolovat PM2 proces

```bash
ssh root@89.221.217.81 "su - reathyze -s /bin/bash -c 'export NVM_DIR=/home/reathyze/.nvm; . /home/reathyze/.nvm/nvm.sh; cd /home/reathyze/chata; npx pm2 list'"
```

Hledej `chata-app` ve stavu `online`. `errored` nebo restart loop je priorita cislo jedna.

### 3. Zkontrolovat posledni logy

```bash
ssh root@89.221.217.81 "su - reathyze -s /bin/bash -c 'export NVM_DIR=/home/reathyze/.nvm; . /home/reathyze/.nvm/nvm.sh; cd /home/reathyze/chata; npx pm2 logs chata-app --lines 50 --nostream'"
```

Hledej hlavne:

- Prisma init fail,
- chybejici `.env`,
- port bind problem,
- permission problem,
- build/start crash po deployi.

### 4. Zkontrolovat lokalni health endpoint na serveru

```bash
ssh root@89.221.217.81 "curl -fsS http://localhost:3000/api/health"
```

- Kdyz lokalni health funguje, ale verejny web ne, problem bude casto v Nginx nebo sitove ceste.
- Kdyz nefunguje ani lokalni health, problem je niz v app procesu nebo DB.

### 5. Overit disk a logy

```bash
ssh root@89.221.217.81 "df -h; du -sh /home/reathyze/chata/data/logs 2>/dev/null || true"
```

Pokud je disk skoro plny nebo logy narostly neumerne, nejdriv vyres tohle.

### 6. Minimalni recovery krok

```bash
ssh root@89.221.217.81 "su - reathyze -s /bin/bash -c 'export NVM_DIR=/home/reathyze/.nvm; . /home/reathyze/.nvm/nvm.sh; cd /home/reathyze/chata; npx prisma generate; npx pm2 restart chata-app; npx pm2 save'"
```

Tenhle krok je rozumny jen kdyz je appka spadla nebo po deployi nabehne nekonzistentne. Neni to nahrada za pochopeni root cause.

### 7. Kdyz prave probehl deploy

- zkontroluj posledni GitHub Actions run,
- spust `./manual-post-deploy-smoke-check.ps1`,
- kdyz health neprojde, ber to jako deploy regression, ne jako nahodny incident.

---

## 5.1 E-mail nedorazil / SMTP padá

E-maily (reset hesla, pozvánka, ověření e-mailu, onboarding, varování před mrazem) odcházejí přes Resend SMTP z adresy `noreply@kdynachatu.cz`. Konfigurace je jen v `.env` na serveru: `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465` (TLS) nebo `587` (STARTTLS), `SMTP_USER=resend`, `SMTP_PASS=<Resend API key>`, `EMAIL_FROM="Kdy na chatu <noreply@kdynachatu.cz>"`. Vzor je v `.env.example`.

### 1. Zjistit, jestli aplikace e-mail vůbec odeslala

Logy procesu (spouštět jako v kroku 3 sekce 5, v adresáři aplikace):

```bash
npx pm2 logs chata-app --lines 200 --nostream | grep -iE "email|smtp"
```

| V logu | Význam | Co dělat |
|---|---|---|
| `... email sent to ...` s `messageId` | Resend e-mail převzal | krok 3 (doručení) |
| `SMTP credentials are not fully configured` při startu | chybí `SMTP_HOST`, `SMTP_USER` nebo `SMTP_PASS` | krok 2 |
| `SMTP is not fully configured` / `SMTP_NOT_CONFIGURED` | totéž, v produkci odeslání selže | krok 2 |
| `[SIMULATION] ...` | proces neběží s `NODE_ENV=production` a SMTP není nastavené, nic se neposílá | krok 2 |
| `Failed to send ... email` s `535` / `Invalid login` | špatný nebo zrušený API key | krok 2, nový API key |
| `Failed to send ...` s `ETIMEDOUT` / `ECONNREFUSED` | server se k `smtp.resend.com` nedostane (firewall, blokovaný port) | krok 4 |
| `Failed to send ...` s `450`/`550` a zmínkou o doméně | doména `kdynachatu.cz` v Resendu není ověřená nebo `EMAIL_FROM` je z jiné domény | krok 3 |

### 2. Zkontrolovat `.env` na serveru

```bash
grep -E "^(SMTP_HOST|SMTP_PORT|SMTP_USER|EMAIL_FROM)=" .env
grep -c "^SMTP_PASS=re_" .env   # 1 = API key vyplněný; hodnotu nevypisuj do terminálu ani do issue
```

- `SMTP_PORT=465` musí jít s TLS (aplikace ho zapne sama), `587` se STARTTLS. Jiný port nepoužívej.
- Po změně `.env` restartuj proces: `npx pm2 restart chata-app --update-env`.
- Nový API key: Resend dashboard → API Keys → Create (oprávnění „Sending access“, doména `kdynachatu.cz`), starý klíč smaž.

### 3. Resend převzal e-mail, ale nedorazil

- Resend dashboard → Emails: najdi zprávu podle adresáta. Stav `delivered` = problém je u příjemce (spam, filtr), `bounced` / `complained` = adresa neexistuje nebo příjemce označil spam.
- Resend dashboard → Domains: `kdynachatu.cz` musí být `Verified`. Když není, zkontroluj u registrátora (WEDOS DNS) záznamy SPF (TXT na `send.kdynachatu.cz`), DKIM (TXT `resend._domainkey`) a MX pro `send` podle hodnot v Resendu.
- Ověření z libovolného počítače: `nslookup -type=TXT resend._domainkey.kdynachatu.cz`.
- Rodině řekni, ať se podívá do spamu a označí e-mail jako „není spam“.

### 4. Server se k SMTP nedostane

```bash
nc -vz smtp.resend.com 465
nc -vz smtp.resend.com 587
```

Když neprojde ani jeden port, blokuje ho firewall VPS nebo poskytovatel (někteří blokují odchozí SMTP u nových serverů – požádej podporu o odblokování). Když prochází jen jeden, nastav ten do `SMTP_PORT` a restartuj.

### 5. Ověřit opravu

Jednou zkus reset hesla na vlastní účet („Zapomněli jste heslo?“ na přihlašovací obrazovce) a odeslání pozvánky na vlastní adresu z administrace chaty. V logu musí být `email sent` s `messageId` a e-mail musí dorazit do schránky. Když problém trvá déle než den, založ issue a do té doby posílej pozvánky tlačítkem „Text zprávy“ v administraci (WhatsApp/SMS) a reset hesla řeš ručně.

---

## 6. Minimalni Definition of Done pro monitoring blok

Monitoring a alerting minimum je hotove az kdyz plati vsechno:

- bezi uptime monitor na hlavni web,
- bezi uptime monitor na `GET /api/health`,
- alert prijde bez rucni kontroly logu,
- PM2 log rotation je aktivni,
- fast smoke check po deployi je sepsany a spustitelny,
- incident postup je sepsany a nekdo podle nej umi jit.