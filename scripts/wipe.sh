#!/usr/bin/env bash
#
# Wipe all data from the Convex backend.
#
# Auto-detects the target (same as seed.sh):
#   1. --url argument
#   2. VITE_CONVEX_URL in .env
#   3. Local Docker backend (seed inside container)
#   4. Configured deployment
#
# Usage:
#   npm run wipe
#   npm run wipe -- --url https://your-convex.onrender.com
#
set -euo pipefail
cd "$(dirname "$0")/.."

URL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [ -z "$URL" ]; then
  if [ -f .env ]; then
    set -a; . ./.env; set +a
  fi
  if [ -n "${VITE_CONVEX_URL:-}" ]; then
    URL="$VITE_CONVEX_URL"
  fi
fi

if docker ps --format '{{.Names}}' | grep -q '^kamix-convex$'; then
  echo "→ Wiping local Docker backend (inside container)…"
  docker exec kamix-convex npx convex run seed:wipeAllData
elif [ -n "$URL" ]; then
  echo "→ Wiping: ${URL}"
  npx convex run seed:wipeAllData --url "$URL"
else
  echo "→ No backend found. Starting local backend first…"
  docker compose up -d convex
  for i in $(seq 1 30); do
    if curl -sf http://127.0.0.1:3210/ >/dev/null 2>&1; then break; fi
    sleep 10
  done
  docker exec kamix-convex npx convex run seed:wipeAllData
fi
