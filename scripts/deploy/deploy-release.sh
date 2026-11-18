#!/usr/bin/env bash
# Production deploy of a release artifact built by .github/workflows/deploy.yml
# (ADR-0002). Nothing is built here: only `npm ci --omit=dev`, a DB backup,
# `prisma migrate deploy` and a PM2 restart.
#
# Layout under APP_PATH (/home/reathyze/chata):
#   .env, data/                  shared by all releases, deploy never touches them
#   releases/<tag>_<timestamp>/  unpacked artifact + production node_modules
#   current -> releases/...      PM2 runs the app with cwd=current
#
# If /api/health fails after the switch, `current` goes back to the previous
# release. Migrations are not reverted: they are additive (docs/SDLC.md §6)
# and a DB dump is taken right before them.
#
# Required env: APP_PATH PM2_NAME APP_PORT SOURCE_REF RELEASE_TAG RELEASE_BUNDLE
set -euo pipefail

fail() { echo "DEPLOY GUARD: $*" >&2; exit 1; }

: "${APP_PATH:?}" "${PM2_NAME:?}" "${APP_PORT:?}" "${SOURCE_REF:?}" "${RELEASE_TAG:?}" "${RELEASE_BUNDLE:?}"

BACKUP_ROOT="/home/reathyze/backups/cabin"
KEEP_RELEASES=3

# ── Guards (before anything on the server changes) ─────────────────────
[[ "$RELEASE_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "not a release tag: '$RELEASE_TAG'"
[ "$SOURCE_REF" = "refs/tags/$RELEASE_TAG" ] || fail "production accepts only release tags (got $SOURCE_REF)"
[ -f "$APP_PATH/.env" ] || fail "$APP_PATH/.env is missing (create it from .env.production.example)"
[ -f "$RELEASE_BUNDLE" ] || fail "release bundle $RELEASE_BUNDLE was not uploaded"
[ ! -e "$APP_PATH/current" ] || [ -L "$APP_PATH/current" ] || fail "$APP_PATH/current exists and is not a symlink"

env_value() { sed -n "s/^$1=//p" "$APP_PATH/.env" | tail -n 1 | tr -d '"' | tr -d "'" | tr -d '[:space:]'; }

[ "$(env_value DEPLOY_TARGET)" = "production" ] || fail ".env in $APP_PATH must contain DEPLOY_TARGET=production"
[ "$(env_value PORT)" = "$APP_PORT" ] || fail "PORT in .env must be $APP_PORT"
case "$(env_value FRONTEND_URL)" in
  ""|http://localhost*|https://localhost*|http://127.0.0.1*|https://127.0.0.1*|http://\[::1\]*|https://\[::1\]*)
    fail "FRONTEND_URL in .env is missing or points to localhost" ;;
esac

export NVM_DIR="/home/reathyze/.nvm"
export PM2_HOME="/home/reathyze/.pm2"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
command -v pm2 >/dev/null || fail "pm2 not found after sourcing NVM"
command -v pg_dump >/dev/null || fail "pg_dump not found (needed for the pre-migration backup)"

CURRENT="$APP_PATH/current"
NAME="${RELEASE_TAG}_$(date +%Y%m%d%H%M%S)"
NEW="$APP_PATH/releases/$NAME"
PREVIOUS="$(readlink "$CURRENT" || true)" # relative target, empty on the first deploy
echo "Guards passed: tag=$RELEASE_TAG release=$NAME previous=${PREVIOUS:-none}"

LIVE=0
cleanup() {
  rm -f "$RELEASE_BUNDLE"
  if [ "$LIVE" != 1 ]; then rm -rf "$NEW"; fi
}
trap cleanup EXIT

point_current_to() { ln -sfn "$1" "$CURRENT.tmp" && mv -T "$CURRENT.tmp" "$CURRENT"; }

restart_app() {
  pm2 delete "$PM2_NAME" >/dev/null 2>&1 || true
  fuser -k "${APP_PORT}/tcp" 2>/dev/null || true
  pm2 start npm --name "$PM2_NAME" --cwd "$CURRENT" -- run start && pm2 save
}

healthy() {
  for i in $(seq 1 20); do
    if curl -fsS "http://localhost:${APP_PORT}/api/health" | grep -q '"status":"ok"'; then
      echo "Healthy after $((i * 3))s"
      return 0
    fi
    sleep 3
  done
  return 1
}

# ── Prepare the new release (the running app is not touched yet) ───────
echo "=== Unpacking $NAME ==="
mkdir -p "$NEW" "$APP_PATH/data/uploads" "$APP_PATH/data/logs"
tar -xzf "$RELEASE_BUNDLE" -C "$NEW"
ln -s ../../.env "$NEW/.env"
ln -s ../../data "$NEW/data"
cd "$NEW"

echo "=== Installing production dependencies ==="
npm ci --omit=dev --no-audit --no-fund

echo "=== Backing up database ==="
BACKUP_ROOT="$BACKUP_ROOT" npm run backup:db

echo "=== Running database migrations ==="
npx --no-install prisma migrate deploy

# ── Switch, verify, roll back on failure ────────────────────────────────
echo "=== Switching to $NAME ==="
point_current_to "releases/$NAME"
if restart_app && healthy; then
  LIVE=1
else
  echo "=== /api/health failed for $NAME ===" >&2
  if [ -n "$PREVIOUS" ]; then
    echo "=== Rolling back to $PREVIOUS ===" >&2
    point_current_to "$PREVIOUS"
    if restart_app && healthy; then echo "Rollback OK, $PREVIOUS is live again." >&2
    else echo "ROLLBACK FAILED: check 'pm2 logs $PM2_NAME'" >&2; fi
  else
    LIVE=1 # first deploy: nothing to roll back to, keep the release for debugging
  fi
  exit 1
fi

echo "=== Installing backup cron ==="
CRON_LINE="0 3 * * * /usr/bin/flock -n /tmp/cabin-backup.lock /bin/bash -lc '. $NVM_DIR/nvm.sh && cd $CURRENT && BACKUP_ROOT=$BACKUP_ROOT BACKUP_RETENTION_DAYS=14 npm run backup:all >> $APP_PATH/data/logs/backup-cron.log 2>&1'"
{ crontab -l 2>/dev/null | grep -v 'cabin-backup.lock' || true; echo "$CRON_LINE"; } | crontab -

echo "=== Pruning old releases (keeping $KEEP_RELEASES) ==="
cd "$APP_PATH/releases"
# shellcheck disable=SC2012 # release names are vX.Y.Z_<timestamp>, newest first by mtime
ls -1t | tail -n +"$((KEEP_RELEASES + 1))" | while read -r old; do
  [ "releases/$old" = "$(readlink "$CURRENT")" ] || rm -rf "$old"
done

echo "Deployed $RELEASE_TAG ($NAME)."
