#!/usr/bin/env bash
#
# Seed demo data into the Convex backend.
#
# Auto-detects the target:
#   1. If --url is passed, use that.
#   2. If VITE_CONVEX_URL is set in .env, use that (hosted mode).
#   3. If the local Docker backend is running, seed inside the container.
#   4. Otherwise, fall back to whatever convex CLI has configured.
#
# Usage:
#   npm run seed
#   npm run seed -- --url https://your-convex.onrender.com
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
  # Check .env for VITE_CONVEX_URL
  if [ -f .env ]; then
    set -a; . ./.env; set +a
  fi

  if [ -n "${VITE_CONVEX_URL:-}" ]; then
    URL="$VITE_CONVEX_URL"
  fi
fi

# Local Docker backend — seed inside the container to avoid deployment conflicts
if docker ps --format '{{.Names}}' | grep -q '^kamix-convex$'; then
  echo "→ Seeding local Docker backend (inside container)…"
  docker exec kamix-convex npx convex run seed:resetData
elif [ -n "$URL" ]; then
  echo "→ Seeding: ${URL}"
  npx convex run seed:resetData --url "$URL"
else
  echo "→ No backend found. Starting local backend first…"
  docker compose up -d convex
  echo "→ Waiting for backend…"
  for i in $(seq 1 30); do
    if curl -sf http://127.0.0.1:3210/ >/dev/null 2>&1; then break; fi
    sleep 10
  done
  docker exec kamix-convex npx convex run seed:resetData
fi
