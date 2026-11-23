/**
 * Noční off-site záloha scripts/backup/offsite-backup.sh (#95). Skript běží naostro v bashi
 * s falešnými příkazy npm, rclone a curl v dočasném adresáři; každé volání se zapíše do logu.
 * Falešné `npm run backup:all` založí nový dump a archiv uploadů jako skutečný backupManager.
 * Na Windows se přeskakuje (skript běží na Linuxu, ověřuje ho CI).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SCRIPT = path.resolve("scripts/backup/offsite-backup.sh");
const PING = "https://hc-ping.com/test-uuid";
const REMOTE = "b2:kdynachatu-backups/production";

type Options = { dotEnv?: Record<string, string>; dayOfWeek?: string; rcloneFails?: boolean; npmCreatesFiles?: boolean };

function runBackup({ dotEnv = { OFFSITE_REMOTE: REMOTE, HEALTHCHECKS_PING_URL: PING }, dayOfWeek = "3", rcloneFails = false, npmCreatesFiles = true }: Options = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "offsite-backup-"));
  const app = path.join(root, "app");
  const backups = path.join(root, "backups");
  const bin = path.join(root, "bin");
  const calls = path.join(root, "calls.log");
  mkdirSync(path.join(app, "current"), { recursive: true });
  mkdirSync(bin);
  writeFileSync(calls, "");
  writeFileSync(path.join(app, ".env"), Object.entries(dotEnv).map(([k, v]) => `${k}=${v}\n`).join(""));

  const npmBody = npmCreatesFiles
    ? `mkdir -p "$BACKUP_ROOT/db" "$BACKUP_ROOT/uploads"; touch "$BACKUP_ROOT/db/db_2026-11-23T03-00-00.dump" "$BACKUP_ROOT/uploads/uploads_2026-11-23T03-00-00.tar.gz"`
    : "";
  const fakes: Record<string, string> = {
    npm: npmBody,
    rclone: rcloneFails ? 'case "$1" in copyto) exit 1;; esac' : "",
    curl: "",
  };
  for (const [cmd, body] of Object.entries(fakes)) {
    const file = path.join(bin, cmd);
    writeFileSync(file, `#!/usr/bin/env bash\necho "${cmd} $*" >> "${calls}"\n${body}\n`);
    chmodSync(file, 0o755);
  }

  const result = spawnSync("bash", [SCRIPT], {
    encoding: "utf8",
    env: {
      APP_PATH: app,
      BACKUP_ROOT: backups,
      OFFSITE_DAY_OF_WEEK: dayOfWeek,
      PATH: `${bin}:${process.env.PATH}`,
      HOME: root,
    },
  });
  const callLines = readFileSync(calls, "utf8").split("\n").filter(Boolean);
  const pings = callLines.filter((c) => c.startsWith("curl ")).map((c) => c.split(" ").pop());
  return { ...result, calls: callLines, rclone: callLines.filter((c) => c.startsWith("rclone ")), pings, backups };
}

describe("offsite-backup.sh", { skip: process.platform === "win32" ? "bash backup script, runs in CI on Linux" : false }, () => {
  test("runs the local backup, copies dump and uploads to daily/, prunes and pings success", () => {
    const run = runBackup();
    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.calls.includes("npm run backup:all"), "local backup must run first");
    const db = path.join(run.backups, "db", "db_2026-11-23T03-00-00.dump");
    const uploads = path.join(run.backups, "uploads", "uploads_2026-11-23T03-00-00.tar.gz");
    assert.deepEqual(run.rclone, [
      `rclone copyto ${db} ${REMOTE}/daily/db_2026-11-23T03-00-00.dump`,
      `rclone copyto ${uploads} ${REMOTE}/daily/uploads_2026-11-23T03-00-00.tar.gz`,
      `rclone delete --min-age 7d ${REMOTE}/daily`,
      `rclone delete --min-age 28d ${REMOTE}/weekly`,
    ]);
    assert.deepEqual(run.pings, [`${PING}/start`, PING]);
  });

  test("on Sunday also keeps a weekly copy", () => {
    const run = runBackup({ dayOfWeek: "7" });
    assert.equal(run.status, 0, run.stderr);
    const weekly = run.rclone.filter((c) => c.includes(`${REMOTE}/weekly/`));
    assert.equal(weekly.length, 2, run.rclone.join("\n"));
  });

  test("a failed upload pings /fail, never success, and exits non-zero", () => {
    const run = runBackup({ rcloneFails: true });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /OFFSITE BACKUP FAILED/);
    assert.deepEqual(run.pings, [`${PING}/start`, `${PING}/fail`]);
    assert.ok(!run.rclone.some((c) => c.startsWith("rclone delete")), "nothing may be pruned after a failed upload");
  });

  test("without OFFSITE_REMOTE the local backup still runs, but the run fails loudly", () => {
    const run = runBackup({ dotEnv: { HEALTHCHECKS_PING_URL: PING } });
    assert.notEqual(run.status, 0);
    assert.ok(run.calls.includes("npm run backup:all"));
    assert.deepEqual(run.rclone, []);
    assert.match(run.stderr, /OFFSITE_REMOTE/);
    assert.deepEqual(run.pings, [`${PING}/start`, `${PING}/fail`]);
  });

  test("fails when the local backup produced no new dump", () => {
    const run = runBackup({ npmCreatesFiles: false });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /no new DB dump/);
    assert.deepEqual(run.rclone, []);
  });

  test("works without a Healthchecks URL (no pings at all)", () => {
    const run = runBackup({ dotEnv: { OFFSITE_REMOTE: REMOTE } });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(run.pings, []);
  });
});
