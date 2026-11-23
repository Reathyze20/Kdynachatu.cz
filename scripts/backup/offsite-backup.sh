#!/usr/bin/env bash
# Nightly backup (#95): local DB dump + uploads archive (npm run backup:all),
# then an off-site copy to Backblaze B2 via rclone and a Healthchecks.io ping.
# The cron job installed by deploy-release.sh (production only) runs this from
# $APP_PATH/current. Setup and restore: docs/OPERATIONS-RUNBOOK.md §7.
#
# Config in $APP_PATH/.env (the app ignores these keys):
#   OFFSITE_REMOTE          rclone remote and path, e.g. b2:kdynachatu-backups/production
#   HEALTHCHECKS_PING_URL   https://hc-ping.com/<uuid>; gets /start, then success or /fail
# B2 credentials live only in rclone's own config (~/.config/rclone/rclone.conf, chmod 600).
#
# Remote layout: daily/ (kept 7 days), weekly/ (Sunday copies, kept 4 weeks).
set -euo pipefail

APP_PATH="${APP_PATH:-/home/reathyze/chata}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/reathyze/backups/cabin}"
LOCAL_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
DAY_OF_WEEK="${OFFSITE_DAY_OF_WEEK:-$(date +%u)}" # override only for tests

env_value() { sed -n "s/^$1=//p" "$APP_PATH/.env" 2>/dev/null | tail -n 1 | tr -d '"' | tr -d "'" | tr -d '[:space:]'; }
REMOTE="$(env_value OFFSITE_REMOTE)"
PING_URL="$(env_value HEALTHCHECKS_PING_URL)"

ping() { [ -z "$PING_URL" ] || curl -fsS -m 10 --retry 3 -o /dev/null "$PING_URL$1" || true; }
fail() {
  trap - ERR
  echo "OFFSITE BACKUP FAILED: $*" >&2
  ping /fail
  exit 1
}
trap 'fail "command [$BASH_COMMAND] exited with $? at line $LINENO"' ERR

# Newest file matching $2 in $BACKUP_ROOT/$1 created by this run.
newest() {
  find "$BACKUP_ROOT/$1" -maxdepth 1 -type f -name "$2" -newer "$STAMP" -printf '%T@ %p\n' 2>/dev/null \
    | sort -n | tail -n 1 | cut -d' ' -f2- || true
}

echo "=== $(date -Is) backup start ==="
ping /start

mkdir -p "$BACKUP_ROOT"
STAMP="$BACKUP_ROOT/.offsite-run"
touch -d "@$(($(date +%s) - 1))" "$STAMP"

echo "=== Local backup ==="
(cd "$APP_PATH/current" && BACKUP_ROOT="$BACKUP_ROOT" BACKUP_RETENTION_DAYS="$LOCAL_RETENTION_DAYS" npm run backup:all)

DB_DUMP="$(newest db 'db_*.dump')"
UPLOADS_TAR="$(newest uploads 'uploads_*.tar.gz')"
rm -f "$STAMP"
[ -n "$DB_DUMP" ] || fail "backup:all produced no new DB dump in $BACKUP_ROOT/db"
[ -n "$UPLOADS_TAR" ] || fail "backup:all produced no new uploads archive in $BACKUP_ROOT/uploads"

[ -n "$REMOTE" ] || fail "OFFSITE_REMOTE is not set in $APP_PATH/.env: local backup done, off-site copy skipped (docs/OPERATIONS-RUNBOOK.md §7)"

echo "=== Off-site copy to $REMOTE ==="
for file in "$DB_DUMP" "$UPLOADS_TAR"; do
  rclone copyto "$file" "$REMOTE/daily/$(basename "$file")"
done
if [ "$DAY_OF_WEEK" = "7" ]; then
  for file in "$DB_DUMP" "$UPLOADS_TAR"; do
    rclone copyto "$file" "$REMOTE/weekly/$(basename "$file")"
  done
fi

echo "=== Pruning off-site copies ==="
rclone delete --min-age 7d "$REMOTE/daily"
rclone delete --min-age 28d "$REMOTE/weekly"

ping ""
echo "=== $(date -Is) backup done: $(basename "$DB_DUMP"), $(basename "$UPLOADS_TAR") ==="
