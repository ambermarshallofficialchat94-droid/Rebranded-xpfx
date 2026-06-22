#!/usr/bin/env bash
# =============================================================================
# VPS Deploy Script — XpressPro FX API Server
# =============================================================================
# Run this on the VPS after pulling the latest code:
#
#   git pull origin main
#   bash deploy.sh
#
# Prerequisites on the VPS:
#   - Node 20 (nvm or system package)
#   - pnpm 9 (corepack enable && corepack prepare pnpm@9.15.4 --activate)
#   - PM2   (npm install -g pm2)
#   - Required env vars exported in the shell OR written to /etc/xpressfx.env
#     and sourced below (see LOAD ENV section).
#
# Rollback procedure:
#   git log --oneline -10                    # find the previous-good SHA
#   git checkout <previous-sha>              # revert code
#   bash deploy.sh                           # rebuild and reload
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "========================================="
echo " XpressPro FX — VPS Deploy"
echo " $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "========================================="
echo ""

# ---------------------------------------------------------------------------
# LOAD ENV
# ---------------------------------------------------------------------------
# Load a machine-level env file if present.
# To create one: sudo cp .env.example /etc/xpressfx.env && sudo nano /etc/xpressfx.env
if [ -f "/etc/xpressfx.env" ]; then
  echo "[env] Loading /etc/xpressfx.env"
  set -a
  # shellcheck disable=SC1091
  source /etc/xpressfx.env
  set +a
elif [ -f ".env" ]; then
  echo "[env] Loading .env (local fallback)"
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
else
  echo "[env] No .env or /etc/xpressfx.env found — relying on exported shell vars"
fi

# ---------------------------------------------------------------------------
# PRE-DEPLOY VALIDATION
# Fails loudly with a clear message if required env vars are missing.
# This runs BEFORE install/build so a misconfigured deploy is caught early.
# ---------------------------------------------------------------------------
echo ""
echo "[predeploy] Running validation checks..."
node scripts/predeploy.mjs
echo "[predeploy] All checks passed."

# ---------------------------------------------------------------------------
# INSTALL
# --frozen-lockfile ensures no accidental lockfile mutations on the VPS.
# If this fails, your lockfile is out of sync — run pnpm install locally,
# commit the updated lockfile, and push.
# ---------------------------------------------------------------------------
echo ""
echo "[install] pnpm install --frozen-lockfile"
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# BUILD
# ---------------------------------------------------------------------------
echo ""
echo "[build] pnpm --filter @workspace/api-server build"
pnpm --filter @workspace/api-server build

echo ""
echo "[build] Verifying output..."
if [ ! -f "artifacts/api-server/dist/index.mjs" ]; then
  echo "[build] ERROR: artifacts/api-server/dist/index.mjs not found after build!"
  exit 1
fi
echo "[build] artifacts/api-server/dist/index.mjs — OK"

# ---------------------------------------------------------------------------
# RELOAD (zero-downtime via PM2)
# ---------------------------------------------------------------------------
echo ""
if pm2 describe xpressfx-api > /dev/null 2>&1; then
  echo "[pm2] Reloading existing process (zero-downtime)..."
  pm2 reload ecosystem.config.cjs --update-env
else
  echo "[pm2] Starting new process..."
  mkdir -p /var/log/xpressfx
  pm2 start ecosystem.config.cjs
  pm2 save
fi

echo ""
echo "========================================="
echo " Deploy complete."
echo " Check status : pm2 status"
echo " Tail logs    : pm2 logs xpressfx-api"
echo " Healthcheck  : curl http://localhost:\${PORT:-8080}/healthz"
echo "========================================="
echo ""
