// Staging verification harness (puppeteer-core).
//
// Drives staging.kdynachatu.cz the way a tester would: passes HTTP basic auth,
// logs in with a demo account, walks the main routes, collects console/CSP
// messages and saves a screenshot per route. Read-only — it never mutates data.
//
// Usage:
//   node scripts/verify/staging.mjs                 # default routes
//   node scripts/verify/staging.mjs /shopping /gallery
//
// Credentials come from scripts/verify/staging.env (gitignored); see
// staging.env.example. puppeteer-core is installed on demand into a temp cache,
// so it stays out of package.json (same approach as the `verify` skill).
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const DEFAULT_ROUTES = ["/dashboard", "/reservations", "/shopping", "/gallery", "/notes"];
const CSP_RE = /content security policy|unsafe-eval|refused to|violates the following/i;

function loadEnvFile(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function config() {
  const file = path.join(SCRIPT_DIR, "staging.env");
  const env = { ...loadEnvFile(file), ...process.env };
  const required = ["STAGING_URL", "STAGING_BASIC_USER", "STAGING_BASIC_PASS", "STAGING_DEMO_USER", "STAGING_DEMO_PASS"];
  const missing = required.filter((k) => !env[k]);
  if (missing.length) {
    console.error(`Chybí konfigurace: ${missing.join(", ")}.`);
    console.error(`Vytvoř ${file} podle scripts/verify/staging.env.example.`);
    process.exit(1);
  }
  const chrome =
    env.CHROME_PATH ||
    ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) =>
      fs.existsSync(p)
    );
  if (!chrome) {
    console.error("Nenalezen Chrome. Nastav CHROME_PATH.");
    process.exit(1);
  }
  return { env, chrome };
}

// Resolve puppeteer-core, installing it into a temp cache on first run.
function loadPuppeteer() {
  const cache = path.join(os.tmpdir(), "cabin-verify-puppeteer");
  const nm = path.join(cache, "node_modules");
  const tryResolve = () => require(require.resolve("puppeteer-core", { paths: [nm, process.cwd()] }));
  try {
    return tryResolve();
  } catch {
    console.log("Instaluji puppeteer-core do dočasné cache…");
    fs.mkdirSync(cache, { recursive: true });
    execSync("npm install puppeteer-core --no-audit --no-fund --silent", { cwd: cache, stdio: "inherit" });
    return tryResolve();
  }
}

async function main() {
  const { env, chrome } = config();
  const routes = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ROUTES;
  const base = env.STAGING_URL.replace(/\/$/, "");
  const outDir = path.join(SCRIPT_DIR, ".artifacts");
  fs.mkdirSync(outDir, { recursive: true });

  const puppeteer = await loadPuppeteer();
  const messages = []; // { route, type, text }
  let currentRoute = "(boot)";

  const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--no-sandbox"] });
  let failed = false;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.authenticate({ username: env.STAGING_BASIC_USER, password: env.STAGING_BASIC_PASS });
    page.on("console", (m) => messages.push({ route: currentRoute, type: m.type(), text: m.text() }));
    page.on("pageerror", (e) => messages.push({ route: currentRoute, type: "pageerror", text: e.message }));

    // --- Login ---
    currentRoute = "/login";
    console.log(`→ login jako ${env.STAGING_DEMO_USER}`);
    const resp = await page.goto(`${base}/login`, { waitUntil: "networkidle2", timeout: 30000 });
    if (!resp || resp.status() >= 400) throw new Error(`/login vrátilo HTTP ${resp && resp.status()}`);
    await dismissCookieBanner(page);
    await page.waitForSelector('input[name="username"], input[type="text"]', { timeout: 15000 });
    const userSel = (await page.$('input[name="username"]')) ? 'input[name="username"]' : 'input[type="text"]';
    await page.type(userSel, env.STAGING_DEMO_USER, { delay: 10 });
    await page.type('input[type="password"]', env.STAGING_DEMO_PASS, { delay: 10 });
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}),
    ]);
    await sleep(1500);
    if (!(await page.$('[data-testid="dashboard-page"]')) && !/\/dashboard/.test(page.url())) {
      throw new Error(`login neprošel, URL=${page.url()}`);
    }
    console.log("  ✓ přihlášeno");

    // --- Walk routes ---
    for (const route of routes) {
      currentRoute = route;
      process.stdout.write(`→ ${route} `);
      const r = await page.goto(`${base}${route}`, { waitUntil: "networkidle2", timeout: 30000 }).catch((e) => {
        console.log(`CHYBA: ${e.message}`);
        failed = true;
        return null;
      });
      if (!r) continue;
      await dismissCookieBanner(page);
      await sleep(800);
      const shot = path.join(outDir, `${route.replace(/\W+/g, "-").replace(/^-|-$/g, "")}.png`);
      await page.screenshot({ path: shot });
      console.log(`HTTP ${r.status()} → ${shot}`);
    }
  } catch (e) {
    console.error(`SELHALO: ${e.message}`);
    failed = true;
  } finally {
    await browser.close();
  }

  report(messages);
  process.exit(failed ? 1 : 0);
}

async function dismissCookieBanner(page) {
  await page
    .evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) => /rozum/i.test(b.textContent || ""));
      if (btn) btn.click();
    })
    .catch(() => {});
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function report(messages) {
  const csp = messages.filter((m) => CSP_RE.test(m.text));
  const errors = messages.filter((m) => m.type === "error" || m.type === "pageerror");
  console.log("\n=== SHRNUTÍ ===");
  console.log(`konzolových zpráv: ${messages.length} | errorů: ${errors.length} | CSP porušení: ${csp.length}`);

  if (csp.length) {
    console.log("\n--- unikátní CSP hlášky (route × počet) ---");
    const byText = new Map();
    for (const m of csp) {
      const key = m.text.split("\n")[0].trim();
      const e = byText.get(key) || { count: 0, routes: new Set() };
      e.count++;
      e.routes.add(m.route);
      byText.set(key, e);
    }
    for (const [text, e] of byText) console.log(`  [${e.count}× | ${[...e.routes].join(",")}] ${text}`);
  }

  if (errors.length) {
    console.log("\n--- errory ---");
    for (const m of errors.slice(0, 20)) console.log(`  [${m.route}] ${m.text.split("\n")[0]}`);
  }
}

main();
