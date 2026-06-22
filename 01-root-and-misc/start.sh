#!/bin/bash
# NeXTrade — Universal Start Script
# Works on any Linux/Mac system or VPS
set -e

echo "Starting NeXTrade API server..."

# Load .env file if it exists (local/VPS usage)
if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  echo "✅ Loaded .env file"
fi

export PORT="${PORT:-8080}"
export NODE_ENV="${NODE_ENV:-production}"

echo "Port:     $PORT"
echo "Mode:     $NODE_ENV"

# Ensure the pre-built bundle exists; if not, attempt to restore from ZIP
if [ ! -f "artifacts/api-server/dist/index.mjs" ]; then
  echo "⚠️  Pre-built bundle not found — running build.cjs to restore..."
  node build.cjs
fi

exec node artifacts/api-server/dist/index.mjs
