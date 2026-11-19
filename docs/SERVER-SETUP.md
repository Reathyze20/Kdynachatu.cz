# Nový produkční server – návod krok za krokem

> **Stav 2026-11-19:** cílový stav určuje [ADR-0002](adr/0002-hosting-a-deploy.md) – server **Netcup VPS nano 2 GB** (objednáno 2026-11-17), na jednom VPS produkce i staging, build v GitHub Actions, produkce z release tagu (`.github/workflows/deploy.yml`, #96).
>
> **Kdo co poskytuje:** server = **Netcup** · doména `kdynachatu.cz` a její DNS = **WEDOS** (jen registrace domény, nic dalšího se tam nekupuje; registrace platí do 2027-02-23 – prodloužit) · e-maily = **Resend** (doména už ověřená, DNS záznamy hotové) · starý server `89.221.217.81` se ruší (krok 11).

Cíl: připravit čistý VPS tak, aby na něj fungoval deploy z `.github/workflows/deploy.yml`
(release tag `v*` → build v GitHub Actions → schválení v environment `production` → SSH jako `reathyze`
→ `/home/reathyze/chata/releases/<tag>_<čas>`, PM2 app `chata-app` na portu 3000),
a přestěhovat na něj data ze starého serveru.

Konvence v návodu:

- `NOVA_IP` = IP adresa Netcup VPS (v e-mailu od Netcupu nebo v Netcup SCP)
- `STARA_IP` = starý server (`89.221.217.81`)
- `DOMENA` = `kdynachatu.cz` (stará `chataceskestredohori.cz` vypršela, neřeší se)
- Příkazy s `$` spouštíš na serveru, příkazy s `PS>` v PowerShellu na svém PC.
- Kde je `<...>`, doplň vlastní hodnotu.

Celkový čas: cca 1,5–2 hodiny včetně čekání na DNS.

---

## 1. Netcup VPS (objednáno)

Server je objednaný (Netcup VPS nano, 2 vCore, 2 GB RAM, 60 GB). Zbývá:

1. Z e-mailu od Netcupu si vezmi IP adresu (`NOVA_IP`) a přístup do **SCP** (Server Control Panel, `servercontrolpanel.de`).
2. Netcup VPS se dodává s **Debianem** – přeinstaluj na **Ubuntu 24.04**:
   1. SCP → horní menu **SSH Keys** → přidej svůj veřejný klíč (krok 2.1). Bez uloženého klíče instalační formulář pole pro klíč vůbec nenabídne.
   2. SCP → server → **Media → Images** → **Ubuntu 24.04.x UEFI amd64** (Minimal; ne BIOS, ne cloudimg, ne 26.04 – ta má jiný Postgres).
   3. Ve formuláři: Locale **`en_US.UTF-8`** (ne `de_DE`), Timezone libovolná (Prague v nabídce není, nastaví se v kroku 2.3), **Create additional user** = `reathyze` + heslo (pro `sudo`, ulož do správce hesel), **SSH Keys** = tvůj klíč, SSH password authentication vypnuto, **Send e-mail to me** zapnout. Pozor, prohlížeč umí do jména a hesla doplnit přihlašovací údaje z Netcupu.
   4. **Install** (tlačítko úplně dole). Po instalaci se jednou zobrazí root heslo – ulož ho do správce hesel (záchrana přes konzoli **Screen**).
   5. Před prvním připojením smaž starý otisk serveru: `PS> ssh-keygen -R NOVA_IP`.
3. Placené zálohy u Netcupu nejsou nutné (appka se zálohuje sama a kopie se denně stahuje na PC, viz krok 10.1).

> Popisky v Netcup SCP se mohou mírně lišit – důležité je Ubuntu 24.04 a SSH klíč. Pokud jsi zakládal uživatele `reathyze` ve formuláři, krok 2.4 je hotový až na kontrolu `sshd` (přihlášení heslem už je vypnuté).
>
> 2 GB RAM stačí jen s **2 GB swapem** (krok 2.3) a bez buildu na serveru (ADR-0002).

---

## 2. První přihlášení a základ systému

### 2.1 SSH klíč na tvém PC (pokud ho ještě nemáš)

```powershell
PS> Test-Path $HOME\.ssh\id_ed25519.pub     # True = klíč máš, přeskoč další řádek
PS> ssh-keygen -t ed25519 -C "reathyze20@gmail.com"
PS> Get-Content $HOME\.ssh\id_ed25519.pub   # tohle je veřejný klíč
```

### 2.2 Přihlášení jako root

```powershell
PS> ssh root@NOVA_IP
```

### 2.3 Aktualizace, časová zóna, firewall, swap

```bash
$ apt update && apt upgrade -y
$ timedatectl set-timezone Europe/Prague

# balíčky, které appka a deploy skript potřebují
$ apt install -y nginx postgresql certbot python3-certbot-nginx \
    rsync psmisc curl git build-essential unattended-upgrades nano ufw

# firewall: jen SSH + web
$ ufw allow OpenSSH
$ ufw allow 'Nginx Full'
$ ufw --force enable

# 2 GB swap — pojistka, aby npm ci při deployi nespadl na nedostatek RAM (build běží v GitHub Actions)
$ fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
$ echo '/swapfile none swap sw 0 0' >> /etc/fstab

# automatické bezpečnostní aktualizace
$ dpkg-reconfigure -plow unattended-upgrades   # zvol "Yes"
```

### 2.4 Uživatel `reathyze`

Deploy se přihlašuje jako `reathyze` a vše běží pod ním (ne pod rootem).

```bash
$ adduser reathyze                 # zadej heslo (budeš ho potřebovat pro sudo)
$ usermod -aG sudo reathyze
$ mkdir -p /home/reathyze/.ssh
$ cp /root/.ssh/authorized_keys /home/reathyze/.ssh/ 2>/dev/null || true
$ chown -R reathyze:reathyze /home/reathyze/.ssh && chmod 700 /home/reathyze/.ssh
```

Pokud jsi při objednávce nevkládal SSH klíč, přidej ho ručně:

```bash
$ nano /home/reathyze/.ssh/authorized_keys   # vlož obsah id_ed25519.pub, ulož
$ chown reathyze:reathyze /home/reathyze/.ssh/authorized_keys && chmod 600 /home/reathyze/.ssh/authorized_keys
```

Ověř z PC v **novém** okně (staré nech otevřené pro jistotu):

```powershell
PS> ssh reathyze@NOVA_IP
```

Funguje? Pak vypni přihlašování heslem a rootem:

```bash
$ sudo nano /etc/ssh/sshd_config
#   PasswordAuthentication no
#   PermitRootLogin no
$ sudo systemctl restart ssh
```

---

## 3. PostgreSQL

```bash
$ psql --version          # poznamenej si verzi (Ubuntu 24.04 = 16)
$ sudo -u postgres psql -c "CREATE USER chata WITH PASSWORD '<SILNE_HESLO_DB>';"
$ sudo -u postgres psql -c "CREATE DATABASE chata OWNER chata;"
# k produkční DB se smí připojit jen role chata (staging role ji neuvidí)
$ sudo -u postgres psql -c "REVOKE CONNECT ON DATABASE chata FROM PUBLIC;" -c "GRANT CONNECT ON DATABASE chata TO chata;"
```

Paměťové limity pro 2 GB RAM (ADR-0002):

```bash
$ sudo -u postgres psql <<'SQL'
ALTER SYSTEM SET shared_buffers = '128MB';
ALTER SYSTEM SET work_mem = '4MB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET effective_cache_size = '512MB';
ALTER SYSTEM SET max_connections = '30';
SQL
$ sudo systemctl restart postgresql
```

Výsledný connection string (použiješ v `.env`):

```
postgresql://chata:<SILNE_HESLO_DB>@localhost:5432/chata
```

> Heslo bez znaků `@ : / ? #` — jinak je musíš v URL escapovat.
>
> **`?schema=public` netřeba.** Prisma bez něj použije schéma `public` stejně. Zálohovací skript (`npm run backup:db`) od #118 parametry, kterým `pg_dump` nerozumí, sám odřízne (dřív na něm deploy padal: `invalid URI query parameter: "schema"`). Ručně spouštěný `pg_dump` ho ale pořád odmítne.

---

## 4. Node.js přes nvm + PM2 (jako `reathyze`)

```bash
$ ssh reathyze@NOVA_IP         # nebo: sudo -iu reathyze
$ curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
$ source ~/.nvm/nvm.sh
$ nvm install 22
$ nvm alias default 22
$ npm install -g pm2
```

Automatický start PM2 po restartu serveru:

```bash
$ pm2 startup systemd
# vypíše řádek začínající "sudo env PATH=..." → zkopíruj ho a spusť
```

Rotace logů PM2 (ať logy nezaplní disk):

```bash
$ pm2 install pm2-logrotate
$ pm2 set pm2-logrotate:max_size 10M
$ pm2 set pm2-logrotate:retain 30
$ pm2 set pm2-logrotate:compress true
```

---

## 5. Adresář appky a `.env`

```bash
$ mkdir -p /home/reathyze/chata/data/uploads /home/reathyze/backups/cabin
$ nano /home/reathyze/chata/.env
```

`.env` a `data/` v `/home/reathyze/chata` sdílí všechny verze appky. Deploy vedle nich zakládá `releases/<tag>_<čas>/` a symlink `current` na běžící verzi.

Zakládej `.env` **nový** – starý obsahuje nefunkční SES a starý `JWT_SECRET`. `DEPLOY_TARGET=production` je povinný (bez něj deploy odmítne běžet). Minimum:

```env
NODE_ENV=production
DEPLOY_TARGET=production
PORT=3000
DATABASE_URL=postgresql://chata:<SILNE_HESLO_DB>@localhost:5432/chata
JWT_SECRET=<vygeneruj: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
FRONTEND_URL=https://DOMENA

# e-maily (Resend) — SES ze starého .env už nefunguje, viz OPERATIONS-RUNBOOK.md §5.1
SMTP_HOST=smtp.resend.com
SMTP_PORT=2587
SMTP_USER=resend
SMTP_PASS=<Resend API key>
EMAIL_FROM="Kdy na chatu <noreply@kdynachatu.cz>"
```

> **Port 2587, ne 465/587:** Netcup blokuje odchozí 465 i 587 (spojení jen visí, appka nespadne, e-maily tiše nechodí). Resend nabízí stejné SMTP i na 2465/2587; 2587 = STARTTLS, se kterým `src/utils/email.ts` funguje bez úprav (`secure` jen pro 465). API klíč stačí s oprávněním **Sending access** pro doménu `kdynachatu.cz`.

> **Registrace nových chat (`CABIN_SIGNUP_ENABLED`):** v produkci je bez proměnné **zavřená** – `POST /api/register` a `POST /api/cabin/create` vrací 403 „Registrace nových chat je zatím uzavřená.“, přihlašovací obrazovka nenabízí registraci a onboarding odkáže na pozvánku. Rodina se přidává přes pozvánky, přihlášení a reset hesla fungují dál. Otevřít ji jde jen explicitně `CABIN_SIGNUP_ENABLED=true` v `.env` a restartem appky. Mimo produkci je bez proměnné otevřená. Aktuální stav: `curl https://DOMENA/api/signup-status`.

> `JWT_SECRET` je **nový**, ne ten ze starého serveru (ADR-0002, [MIGRATION-CUTOVER.md](MIGRATION-CUTOVER.md) §1) – rodina se po přechodu přihlásí znovu. Prázdné `SMTP_PASS` appce nebrání naběhnout, jen nechodí e-maily.

```bash
$ chmod 600 /home/reathyze/chata/.env
```

---

## 6. Přenos dat ze starého serveru

Udělej to těsně před přepnutím DNS, ať nic nechybí. Ideálně ve chvíli, kdy nikdo z rodiny appku nepoužívá.

> **Záloha už je na PC** (`%USERPROFILE%\chata-zaloha`: `chata.dump`, `chata-uploads.tgz`, `chata.env` z 2026-11-06, novější data neexistují). Pokud starý server už neběží nebo se na něm od té doby nic nezměnilo, kroky 6.1 a první `scp` v 6.2 přeskoč a nahraj soubory rovnou z této složky.

### 6.1 Na starém serveru

```bash
$ ssh reathyze@STARA_IP
$ cd /home/reathyze/chata
$ psql --version   # musí být stejná nebo NIŽŠÍ verze než na novém serveru (krok 3)
# .env nejde načíst přes `source` (EMAIL_FROM obsahuje < >), vytáhneme jen DATABASE_URL
$ DB=$(sed -n 's/^DATABASE_URL=//p' .env | tail -1 | tr -d "\"'\r")
# pg_dump neumí Prisma parametr ?schema=public → odřízneme query část URL
$ pg_dump -Fc --no-owner --no-privileges "${DB%%\?*}" -f /tmp/chata.dump
$ pg_restore --list /tmp/chata.dump | grep -c "TABLE DATA"   # kontrola: číslo > 0
$ tar -czf /tmp/chata-uploads.tgz -C data uploads
$ cp .env /tmp/chata.env
$ ls -lh /tmp/chata.dump /tmp/chata-uploads.tgz
```

### 6.2 Přes tvoje PC na nový server

```powershell
PS> mkdir $HOME\chata-migrace; cd $HOME\chata-migrace
PS> scp reathyze@STARA_IP:/tmp/chata.dump reathyze@STARA_IP:/tmp/chata-uploads.tgz reathyze@STARA_IP:/tmp/chata.env .
PS> scp chata.dump chata-uploads.tgz reathyze@NOVA_IP:/tmp/   # chata.env na nový server nepatří (krok 5)
```

### 6.3 Na novém serveru

```bash
$ cd /home/reathyze/chata
$ pg_restore --no-owner --role=chata -d "postgresql://chata:<SILNE_HESLO_DB>@localhost:5432/chata" /tmp/chata.dump
$ tar -xzf /tmp/chata-uploads.tgz -C data
$ ls data/uploads | head
$ rm /tmp/chata.dump /tmp/chata-uploads.tgz
```

Pak smaž kopie i na starém serveru (`rm /tmp/chata.*`) a ve složce `chata-migrace` na PC.

> Varování z `pg_restore` typu „role … does not exist“ jsou při `--no-owner` neškodné. Chyby u `CREATE TABLE` neškodné nejsou.

---

## 7. GitHub Actions: deploy klíč a secrets

### 7.1 Samostatný klíč jen pro deploy

```powershell
PS> ssh-keygen -t ed25519 -f $HOME\.ssh\chata_deploy -N '""' -C "github-deploy"
PS> Get-Content $HOME\.ssh\chata_deploy.pub
```

Veřejný klíč přidej na server:

```bash
$ nano /home/reathyze/.ssh/authorized_keys   # nový řádek s obsahem chata_deploy.pub
```

### 7.2 Environment `production` a secrets

GitHub → `Reathyze20/Kdynachatu.cz` → **Settings → Environments → New environment** `production`:

- **Required reviewers:** ty (každý produkční deploy čeká na tvoje schválení),
- **Deployment branches and tags:** Selected → tag `v*` a větev `main` (ruční spuštění z UI běží z `main`),
- **Environment secrets** (stejné názvy jako u `staging`):

| Secret | Hodnota |
|---|---|
| `SSH_HOST` | `NOVA_IP` |
| `SSH_USER` | `reathyze` |
| `SSH_PRIVATE_KEY` | celý obsah `$HOME\.ssh\chata_deploy` (soukromý, včetně řádků `-----BEGIN/END-----`) |

`SERVER_PATH`, `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL` se nepoužívají — cesta je ve workflow, `.env` je na serveru.

**Settings → Actions → General → Workflow permissions:** zaškrtni **Allow GitHub Actions to create and approve pull requests** (release-please otevírá release PR).

### 7.3 První deploy

Produkce se nasazuje jen z release tagu `vX.Y.Z` na `main`:

1. Po merge do `main` udržuje workflow **Release Please** otevřený release PR (verze + `CHANGELOG.md`).
   Release PR z výchozího tokenu nespustí CI: zavři ho a hned znovu otevři, pak checky naběhnou.
2. Merge release PR vytvoří tag a spustí **Deploy to Production**. Ručně: **Actions → Deploy to Production → Run workflow** s tagem
   (takhle se dělá i rollback na starší verzi).
3. Build proběhne v Actions, pak deploy čeká na schválení v environment `production`.

Na serveru deploy rozbalí artefakt do `releases/`, spustí `npm ci --omit=dev`, zálohu DB, `prisma migrate deploy`,
přepne `current`, restartuje `chata-app` a ověří `/api/health`. Když health check selže, vrátí `current`
na předchozí verzi (u úplně prvního deploye není kam, appka zůstane spadlá – `pm2 logs chata-app`). Nastaví také denní zálohy do `/home/reathyze/backups/cabin` (cron ve 3:00).

Kontrola na serveru:

```bash
$ pm2 status                                  # chata-app = online
$ curl -s http://localhost:3000/api/health    # {"status":"ok",...}
```

---

## 8. DNS

Doména zůstává na WEDOS, mění se jen kam ukazuje: WEDOS administrace → **Domény → kdynachatu.cz → DNS záznamy**:

- záznam **A** pro `kdynachatu.cz` (název prázdný) → `NOVA_IP`
- případně **A** pro `www` → `NOVA_IP`
- později pro staging **A** pro `staging` → `NOVA_IP` (viz `plans/SEP-1-staging-setup.md`)

**Nesahat** na záznamy Resendu: `send` (MX + TXT), `resend._domainkey`, `_dmarc` – bez nich nechodí e-maily.

Tip: den předem sniž TTL záznamu na 300 s, přepnutí pak proběhne rychle.

Ověření z PC (až vrátí `NOVA_IP`, pokračuj):

```powershell
PS> Resolve-DnsName DOMENA -Type A
```

---

## 9. Nginx + HTTPS

```bash
$ sudo nano /etc/nginx/sites-available/chata
```

Vlož (zjednodušená verze `nginx-chata.conf` z repa — bez SSL řádků, ty doplní certbot):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name DOMENA www.DOMENA;

    client_max_body_size 60M;

    location = /sw.js {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location = /index.html {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location = /manifest.webmanifest {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Požadavky na holou IP nebo cizí hostname nemají dostat appku (data by byla vidět přes IP ještě před DNS a HTTPS). `sudo nano /etc/nginx/sites-available/default-deny`:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 444;
}
```

```bash
$ sudo ln -s /etc/nginx/sites-available/chata /etc/nginx/sites-enabled/chata
$ sudo ln -s /etc/nginx/sites-available/default-deny /etc/nginx/sites-enabled/default-deny
$ sudo rm /etc/nginx/sites-enabled/default
$ sudo nginx -t && sudo systemctl reload nginx

# HTTPS certifikát (DNS už musí ukazovat na NOVA_IP)
$ sudo certbot --nginx -d DOMENA -d www.DOMENA --redirect -m reathyze20@gmail.com --agree-tos
$ sudo certbot renew --dry-run    # ověří automatickou obnovu
```

---

## 10. Kontrola, že vše funguje

- [ ] `https://DOMENA/api/health` vrací `"status":"ok"`
- [ ] přihlášení vlastním účtem funguje (po novém `JWT_SECRET` je nutné nové přihlášení)
- [ ] kalendář ukazuje existující rezervace
- [ ] galerie ukazuje staré fotky a jde nahrát nová
- [ ] chat: zpráva se objeví i v druhém okně bez reloadu (Socket.IO přes Nginx)
- [ ] `sudo reboot` → po minutě appka znovu běží (`pm2 status`)
- [ ] druhý den ráno: v `/home/reathyze/backups/cabin/db` a `/uploads` je nová záloha
- [ ] `df -h /` — dost volného místa

### 10.1 Off-site kopie záloh na PC

Až je na serveru první záloha (deploy ji seedne), zaregistruj na PC denní stahování:

```powershell
PS> ssh reathyze@NOVA_IP exit        # jednou kvůli host key (known_hosts)
PS> .\manual-pull-backups.ps1 -ServerHost NOVA_IP -InstallScheduledTask
```

Zálohy se ukládají do `%USERPROFILE%\chata-zalohy`. Detaily v `docs/BACKUP-AND-RESTORE.md`.

## 11. Starý server

Nech ho běžet ještě cca týden jako zálohu. Potom:

1. poslední `pg_dump` + uploads si stáhni na PC (pro jistotu),
2. zruš **VPS** u starého poskytovatele (WEDOS) – **doménu `kdynachatu.cz` nerušit**, ta na WEDOS zůstává,
3. aktualizuj IP v `nginx-chata.conf` / dokumentaci, pokud je tam uvedená.
