# Staging verify harness

Projde `staging.kdynachatu.cz` (fiktivní demo data) jako tester přes puppeteer-core:
basic auth, login demo účtem, průchod hlavními cestami, sběr konzole/CSP, screenshoty.
Read-only — data nemutuje.

## Jednorázové nastavení

```sh
cp scripts/verify/staging.env.example scripts/verify/staging.env
# vyplň STAGING_BASIC_PASS (nginx basic auth) a STAGING_DEMO_PASS (demo-spravce ze seedu)
```

`staging.env` je gitignored; hesla tedy nejdou do kódu ani do gitu. Hodnoty jsou na serveru
(`/etc/nginx/.htpasswd-staging`, seed `db:seed`) a ve správci hesel.

## Spuštění

```sh
npm run verify:staging                         # /dashboard /reservations /shopping /gallery /notes
node scripts/verify/staging.mjs /diary /reconstruction   # vlastní cesty
```

- Screenshoty: `scripts/verify/.artifacts/<route>.png` (gitignored).
- Výstup shrne počet errorů a **unikátní CSP porušení** (route × počet) — tím se ověřuje #97
  (CSP) před přepnutím `reportOnly: false` v `src/backend/app.ts`.
- `puppeteer-core` se instaluje na první spuštění do dočasné cache (`%TEMP%/cabin-verify-puppeteer`),
  nepřidává se do `package.json`. Chrome se bere z obvyklé cesty, jinak nastav `CHROME_PATH`.

## Staging musí běžet

Server drží staging kvůli RAM někdy `pm2 stop`nutý. Jestli běží, prozradí `/api/health`
(bez auth). Probuzení je na člověku (SSH) nebo přes `gh workflow run deploy-staging.yml`.
