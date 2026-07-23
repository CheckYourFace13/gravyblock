#!/usr/bin/env bash
# GravyBlock self-deploy poller — runs ON the VPS via cron.
#
# Checks GitHub for new commits on main every run; if found, deploys.
# Pull-based: only outbound HTTPS, works regardless of SSH firewall rules.
#
# One-time install (paste on the VPS as the deploy user):
#   chmod +x /home/deploy/gravyblock/scripts/self-deploy.sh
#   ( crontab -l 2>/dev/null | grep -v self-deploy ; echo "*/2 * * * * /home/deploy/gravyblock/scripts/self-deploy.sh >> /home/deploy/logs/self-deploy.log 2>&1" ) | crontab -
#
# Logs: /home/deploy/logs/self-deploy.log

set -e

REPO_DIR="/home/deploy/gravyblock"
LOCK_FILE="/tmp/gravyblock-self-deploy.lock"

# Prevent overlapping runs (build takes ~2 min, cron fires every 2 min)
if [ -f "$LOCK_FILE" ]; then
  # Stale lock (>15 min old) gets cleared; otherwise another deploy is running
  if [ "$(find "$LOCK_FILE" -mmin +15 2>/dev/null)" ]; then
    rm -f "$LOCK_FILE"
  else
    exit 0
  fi
fi

cd "$REPO_DIR"

# Compare local HEAD to remote main — exit quietly if nothing new
git fetch origin main --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
[ "$LOCAL" = "$REMOTE" ] && exit 0

echo "[self-deploy] $(date) — new commit detected: $LOCAL -> $REMOTE"
touch "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# Load node via nvm (cron has a minimal environment)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# VPS is a deploy mirror — force-sync (never touches untracked files like .env)
git reset --hard origin/main

npm install --production=false

# DB migrations. IMPORTANT: never pipe "y" here. drizzle-kit push shows an
# interactive prompt whenever it can't tell an added+removed column pair
# apart from a rename ("is X renamed to Y?"). Blindly answering "y" accepts
# whatever choice is highlighted, which can silently reset a column's
# existing values to its default instead of preserving them — this is what
# wiped businesses.account_type back to "customer" on 2026-07-19. Running
# with no piped input instead makes an ambiguous change fail loudly (falls
# through to the warning below, deploy continues on stale-but-safe schema)
# rather than silently guessing wrong on live data.
npx drizzle-kit push --config=drizzle.config.ts < /dev/null 2>&1 || echo "[self-deploy] migration warning — schema change needs manual review, see log above (non-fatal)"

# Stripe annual prices (idempotent)
node scripts/setup-annual-prices.mjs 2>&1 || echo "[self-deploy] annual price warning (non-fatal)"

npm run build

pm2 startOrRestart ecosystem.config.js --update-env
pm2 save

echo "[self-deploy] $(date) — deploy complete at $(git rev-parse --short HEAD)"
