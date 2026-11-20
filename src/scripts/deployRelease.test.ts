/**
 * Pojistky scripts/deploy/deploy-release.sh (ADR-0002, #154). Skript se spouští naostro v bashi
 * s falešnými příkazy (npm, npx, pm2, crontab, curl…) v dočasném adresáři; každé volání se
 * zapíše do logu. Chybný cíl musí skončit hláškou DEPLOY GUARD dřív, než se cokoli spustí
 * nebo vytvoří. Na Windows se přeskakuje (skript běží na Linuxu, ověřuje ho CI).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SCRIPT = path.resolve("scripts/deploy/deploy-release.sh");
const FAKE_COMMANDS = ["npm", "npx", "pm2", "pg_dump", "crontab", "curl", "fuser"];

type Env = Record<string, string>;

const stagingEnv: Env = {
  DEPLOY_TARGET: "staging",
  PM2_NAME: "chata-staging",
  APP_PORT: "3100",
  SOURCE_REF: "refs/heads/main",
  RELEASE_TAG: "main-0123456789abcdef0123456789abcdef01234567",
};
const stagingDotEnv: Env = {
  DEPLOY_TARGET: "staging",
  PORT: "3100",
  DATABASE_URL: "postgresql://staging_app:pw@localhost:5432/kdynachatu_staging?schema=public",
  FRONTEND_URL: "https://staging.kdynachatu.cz",
};
const productionEnv: Env = {
  PM2_NAME: "chata-app",
  APP_PORT: "3000",
  SOURCE_REF: "refs/tags/v1.2.0",
  RELEASE_TAG: "v1.2.0",
};
const productionDotEnv: Env = {
  DEPLOY_TARGET: "production",
  PORT: "3000",
  DATABASE_URL: "postgresql://cabin:pw@localhost:5432/kdynachatu",
  FRONTEND_URL: "https://kdynachatu.cz",
};

function runDeploy(env: Env, dotEnv: Env) {
  const root = mkdtempSync(path.join(tmpdir(), "deploy-release-"));
  const app = path.join(root, "app");
  const bin = path.join(root, "bin");
  const calls = path.join(root, "calls.log");
  const bundle = path.join(root, "release.tgz");
  mkdirSync(app);
  mkdirSync(bin);
  writeFileSync(calls, "");
  writeFileSync(path.join(app, ".env"), Object.entries(dotEnv).map(([k, v]) => `${k}=${v}\n`).join(""));
  writeFileSync(path.join(root, "RELEASE"), "test\n");
  spawnSync("tar", ["-czf", bundle, "-C", root, "RELEASE"]);
  for (const cmd of FAKE_COMMANDS) {
    const file = path.join(bin, cmd);
    const output = cmd === "curl" ? `echo '{"status":"ok"}'` : cmd === "crontab" ? "cat >/dev/null || true" : "";
    writeFileSync(file, `#!/usr/bin/env bash\necho "${cmd} $*" >> "${calls}"\n${output}\n`);
    chmodSync(file, 0o755);
  }
  const result = spawnSync("bash", [SCRIPT], {
    encoding: "utf8",
    env: { APP_PATH: app, RELEASE_BUNDLE: bundle, ...env, PATH: `${bin}:${process.env.PATH}`, HOME: root },
  });
  const callLines = readFileSync(calls, "utf8").split("\n").filter(Boolean);
  return { ...result, app, bundle, calls: callLines };
}

function assertRefusedUntouched(env: Env, dotEnv: Env, message: RegExp) {
  const run = runDeploy(env, dotEnv);
  assert.notEqual(run.status, 0, `expected failure, stdout: ${run.stdout}`);
  assert.match(run.stderr, /DEPLOY GUARD/);
  assert.match(run.stderr, message);
  assert.deepEqual(run.calls, [], "no command may run before the guards pass");
  assert.deepEqual(readdirSync(run.app), [".env"], "APP_PATH must stay untouched");
  assert.ok(existsSync(run.bundle), "the uploaded bundle must stay in place");
}

describe("deploy-release.sh", { skip: process.platform === "win32" ? "bash deploy script, runs in CI on Linux" : false }, () => {
  describe("staging target", () => {
    test("deploys with only npm ci --omit=dev, prisma migrate deploy and a PM2 restart", () => {
      const run = runDeploy(stagingEnv, stagingDotEnv);
      assert.equal(run.status, 0, run.stderr);
      const current = path.join(run.app, "current");
      assert.deepEqual(run.calls.filter((c) => !c.startsWith("curl ")), [
        "npm ci --omit=dev --no-audit --no-fund",
        "npx --no-install prisma migrate deploy",
        "pm2 delete chata-staging",
        "fuser -k 3100/tcp",
        `pm2 start npm --name chata-staging --cwd ${current} -- run start`,
        "pm2 save",
      ]);
      assert.ok(run.calls.some((c) => c.includes("http://localhost:3100/api/health")));
    });

    test("refuses the production directory, also via .. or a subdirectory", () => {
      for (const appPath of ["/home/reathyze/chata", "/home/reathyze/chata-staging/../chata", "/home/reathyze/chata/current"]) {
        assertRefusedUntouched({ ...stagingEnv, APP_PATH: appPath }, stagingDotEnv, /production directory/);
      }
    });

    test("refuses the production PM2 process", () => {
      assertRefusedUntouched({ ...stagingEnv, PM2_NAME: "chata-app" }, stagingDotEnv, /chata-staging/);
    });

    test("refuses the production port, in the workflow or in .env", () => {
      assertRefusedUntouched({ ...stagingEnv, APP_PORT: "3000" }, { ...stagingDotEnv, PORT: "3000" }, /3100/);
      assertRefusedUntouched(stagingEnv, { ...stagingDotEnv, PORT: "3000" }, /PORT in \.env must be 3100/);
    });

    test("refuses a database that does not end in _staging", () => {
      for (const db of ["kdynachatu", "kdynachatu_staging_old", "cabin_reservation"]) {
        const url = `postgresql://u:p@localhost:5432/${db}?schema=public`;
        assertRefusedUntouched(stagingEnv, { ...stagingDotEnv, DATABASE_URL: url }, /_staging/);
      }
    });

    test("refuses a .env that is not marked DEPLOY_TARGET=staging", () => {
      assertRefusedUntouched(stagingEnv, { ...stagingDotEnv, DEPLOY_TARGET: "production" }, /DEPLOY_TARGET=staging/);
    });

    test("refuses anything but main", () => {
      assertRefusedUntouched({ ...stagingEnv, SOURCE_REF: "refs/heads/feat/x" }, stagingDotEnv, /only main/);
      assertRefusedUntouched({ ...stagingEnv, SOURCE_REF: "refs/tags/v1.2.0", RELEASE_TAG: "v1.2.0" }, stagingDotEnv, /only main|staging build/);
    });
  });

  describe("production target (default when DEPLOY_TARGET is unset)", () => {
    test("keeps the DB backup before migrations and the backup cron", () => {
      const run = runDeploy(productionEnv, productionDotEnv);
      assert.equal(run.status, 0, run.stderr);
      const steps = run.calls.filter((c) => !c.startsWith("curl "));
      assert.deepEqual(steps.slice(0, 3), [
        "npm ci --omit=dev --no-audit --no-fund",
        "npm run backup:db",
        "npx --no-install prisma migrate deploy",
      ]);
      assert.ok(steps.includes("pm2 start npm --name chata-app --cwd " + path.join(run.app, "current") + " -- run start"));
      assert.ok(steps.includes("crontab -"), "backup cron must still be installed");
    });

    test("still accepts only release tags", () => {
      assertRefusedUntouched({ ...productionEnv, SOURCE_REF: "refs/heads/main" }, productionDotEnv, /only release tags/);
      assertRefusedUntouched({ ...productionEnv, RELEASE_TAG: "main-0123456" }, productionDotEnv, /not a release tag/);
    });

    test("refuses a staging .env", () => {
      assertRefusedUntouched(productionEnv, { ...productionDotEnv, DEPLOY_TARGET: "staging" }, /DEPLOY_TARGET=production/);
    });

    test("refuses an unknown DEPLOY_TARGET", () => {
      assertRefusedUntouched({ ...productionEnv, DEPLOY_TARGET: "prod" }, productionDotEnv, /unknown DEPLOY_TARGET/);
    });
  });
});
