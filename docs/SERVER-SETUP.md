# Nový produkční server – návod krok za krokem

> **Stav 2026-11-17:** cílový stav určuje [ADR-0002](adr/0002-hosting-a-deploy.md) – server **Netcup VPS nano 2 GB** (objednáno 2026-11-17; postup objednávky v kroku 1 už neplatí, zbytek návodu je pro Ubuntu 24.04 obecný), na jednom VPS produkce i staging, build v GitHub Actions, produkce z release tagu. Části návodu, které počítají s deployem z `main` přímo do produkce a buildem na serveru, se přepíšou při implementaci ADR-0002 (krok 3 roadmapy).

Cíl: připravit čistý VPS tak, aby na něj fungoval stávající deploy z `.github/workflows/deploy.yml`
(push na `main` → GitHub Actions → SSH jako `reathyze` → `/home/reathyze/chata`, PM2 app `chata-app`),
a přestěhovat na něj data ze starého serveru.

Konvence v návodu:

- `NOVA_IP` = IP adresa nového VPS (dostaneš e-mailem / v administraci WEDOS)
- `STARA_IP` = starý server (`89.221.217.81`)
- `DOMENA` = doména appky (dnes `chataceskestredohori.cz`)
- Příkazy s `$` spouštíš na serveru, příkazy s `PS>` v PowerShellu na svém PC.
- Kde je `<...>`, doplň vlastní hodnotu.

Celkový čas: cca 1,5–2 hodiny včetně čekání na DNS.

---

## 1. Objednávka na WEDOS

1. wedos.cz → **Servery → VPS ON** → objednat.
2. Konfigurace:
   - **CPU:** 1–2 vCPU
   - **RAM:** 2 GB (méně ne — `npm ci` + Vite build při deployi potřebuje paměť)
   - **Disk:** 40 GB SSD (VPS ON jde později zvětšit, ne zmenšit)
   - **OS:** Ubuntu 24.04 LTS
   - **Zálohy:** ne (appka se zálohuje sama a kopie se denně stahuje na PC, viz krok 10.1) · **DDoS ochrana:** ne
3. Pokud formulář nabízí vložení **SSH klíče**, vlož svůj veřejný klíč (viz krok 2.1). Jinak ti přijde root heslo.
4. Odešli objednávku, zaplať a počkej na e-mail s IP adresou.

> Popisky ve WEDOS administraci se mohou mírně lišit — důležité jsou hodnoty výše.

**Varianta Hetzner (levnější):** console.hetzner.com → nový projekt → **Add Server** → lokace Nuremberg nebo
Falkenstein → image **Ubuntu 24.04** → typ shared vCPU x86 (CX23 nebo nejbližší s 4 GB RAM) → přidej svůj SSH
klíč (krok 2.1) → placené Backups nejsou nutné (appka se zálohuje sama). Dál pokračuj krokem 2.2.

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
    rsync psmisc curl git build-essential unattended-upgrades

# firewall: jen SSH + web
$ ufw allow OpenSSH
$ ufw allow 'Nginx Full'
$ ufw --force enable

# 2 GB swap — pojistka, aby build při deployi nespadl na nedostatek RAM
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
```

Výsledný connection string (použiješ v `.env`):

```
postgresql://chata:<SILNE_HESLO_DB>@localhost:5432/chata?schema=public
```

> Heslo bez znaků `@ : / ? #` — jinak je musíš v URL escapovat.

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

Nejjednodušší je zkopírovat `.env` ze starého serveru (krok 6) a změnit v něm jen `DATABASE_URL`.
Pokud zakládáš nový, minimum je:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://chata:<SILNE_HESLO_DB>@localhost:5432/chata?schema=public
JWT_SECRET=<vygeneruj: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
FRONTEND_URL=https://DOMENA

# e-maily (Resend) — SES ze starého .env už nefunguje, viz OPERATIONS-RUNBOOK.md §5.1
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=<Resend API key>
EMAIL_FROM="Kdy na chatu <noreply@kdynachatu.cz>"
```

> Při stěhování **ponech stejný `JWT_SECRET`** jako na starém serveru — jinak se všichni z rodiny budou muset znovu přihlásit.

```bash
$ chmod 600 /home/reathyze/chata/.env
```

---

## 6. Přenos dat ze starého serveru

Udělej to těsně před přepnutím DNS, ať nic nechybí. Ideálně ve chvíli, kdy nikdo z rodiny appku nepoužívá.

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
PS> scp chata.dump chata-uploads.tgz chata.env reathyze@NOVA_IP:/tmp/
```

### 6.3 Na novém serveru

```bash
$ cd /home/reathyze/chata
$ cp /tmp/chata.env .env && nano .env    # změň DATABASE_URL na nový (krok 3), zbytek nech
$ chmod 600 .env
$ pg_restore --no-owner --role=chata -d "postgresql://chata:<SILNE_HESLO_DB>@localhost:5432/chata" /tmp/chata.dump
$ tar -xzf /tmp/chata-uploads.tgz -C data
$ ls data/uploads | head
$ rm /tmp/chata.dump /tmp/chata-uploads.tgz /tmp/chata.env
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

### 7.2 Secrets v repozitáři

GitHub → `Reathyze20/Cabin_Reservation_App` → **Settings → Secrets and variables → Actions** → uprav:

| Secret | Hodnota |
|---|---|
| `SSH_HOST` | `NOVA_IP` |
| `SSH_USER` | `reathyze` |
| `SSH_PRIVATE_KEY` | celý obsah `$HOME\.ssh\chata_deploy` (soukromý, včetně řádků `-----BEGIN/END-----`) |
| `SERVER_PATH` | `/home/reathyze/chata` |

`DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL` v secrets nevadí, ale nepoužijí se — `.env` už na serveru existuje.

### 7.3 První deploy

GitHub → **Actions → Deploy to Production** → poslední běh → **Re-run all jobs**
(nebo jakýkoli push na `main`).

Deploy sám nainstaluje závislosti, spustí migrace, sestaví frontend, nastartuje `chata-app`
v PM2 a nastaví denní zálohy do `/home/reathyze/backups/cabin` (cron ve 3:00).

Kontrola na serveru:

```bash
$ pm2 status                                  # chata-app = online
$ curl -s http://localhost:3000/api/health    # {"status":"ok",...}
```

---

## 8. DNS

U registrátora domény (pokud je doména na WEDOS: administrace → Domény → DNS záznamy):

- záznam **A** pro `DOMENA` → `NOVA_IP`
- případně **A** pro `www.DOMENA` → `NOVA_IP`

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
    server_name DOMENA;

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

```bash
$ sudo ln -s /etc/nginx/sites-available/chata /etc/nginx/sites-enabled/chata
$ sudo rm /etc/nginx/sites-enabled/default
$ sudo nginx -t && sudo systemctl reload nginx

# HTTPS certifikát (DNS už musí ukazovat na NOVA_IP)
$ sudo certbot --nginx -d DOMENA --redirect -m reathyze20@gmail.com --agree-tos
$ sudo certbot renew --dry-run    # ověří automatickou obnovu
```

---

## 10. Kontrola, že vše funguje

- [ ] `https://DOMENA/api/health` vrací `"status":"ok"`
- [ ] přihlášení vlastním účtem funguje (bez nutnosti nového loginu, pokud jsi zachoval `JWT_SECRET`)
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
2. zruš službu u starého poskytovatele,
3. aktualizuj IP v `nginx-chata.conf` / dokumentaci, pokud je tam uvedená.
