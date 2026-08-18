#!/bin/sh
set -e

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Kamix — Combined Render deployment"
echo "  Frontend: nginx on :80"
echo "  Backend:  Convex on :3210"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Start nginx in background
nginx &
NGINX_PID=$!

# Start Convex backend in background
export VLY_CONVEX_AUTH_ISSUER="${VLY_CONVEX_AUTH_ISSUER:-https://freebuff.com}"
npx convex dev --typecheck disable --codegen enable &
CONVEX_PID=$!

# Wait for Convex backend to be healthy
echo "→ Waiting for Convex backend on :3210…"
RETRIES=0
MAX_RETRIES=120
until wget -q -O /dev/null http://localhost:3210/ 2>/dev/null; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "⚠ Convex not ready after 2 min, frontend still available on :80"
    break
  fi
  sleep 1
done
echo "✅ Convex backend healthy."

# Wait for either process
wait $CONVEX_PID $NGINX_PID
