#!/bin/sh
set -e

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Kamix — Self-hosted Convex backend"
echo "  CONVEX_SITE_URL = ${CONVEX_SITE_URL:-http://localhost:3210}"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ------------------------------------------------------------------
# 1. Start the Convex dev server in the background.
#
#    `npx convex dev` without login automatically:
#      a) Downloads the Convex backend binary (first run).
#      b) Starts the backend on http://0.0.0.0:3210.
#      c) Pushes all functions from src/convex/.
#      d) Generates types in convex/_generated/.
#      e) Watches for file changes (idle in Docker).
# ------------------------------------------------------------------
echo "→ Starting Convex dev server (pushes functions + starts API)…"
# VLY_CONVEX_AUTH_ISSUER is referenced in auth.config.ts with a fallback,
# but Convex env validation still complains if it's not set.
export VLY_CONVEX_AUTH_ISSUER="${VLY_CONVEX_AUTH_ISSUER:-https://freebuff.com}"
npx convex dev --typecheck disable --codegen enable &

CONVEX_PID=$!

# ------------------------------------------------------------------
# 2. Wait for the backend to be healthy before proceeding.
# ------------------------------------------------------------------
echo "→ Waiting for Convex backend on :3210…"
RETRIES=0
MAX_RETRIES=120  # 2 minutes
until wget -q -O /dev/null http://localhost:3210/ 2>/dev/null; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "❌ Convex backend failed to start within 2 minutes."
    exit 1
  fi
  sleep 1
done
echo "✅ Convex backend is healthy."

# ------------------------------------------------------------------
# 3. Set environment variables on the deployment (best-effort).
#
#    These are needed for Convex Auth (OIDC) to work.  If this fails
#    (e.g. env set not supported for local), guest-only auth still works.
# ------------------------------------------------------------------
echo "→ Configuring deployment environment…"
npx convex env set CONVEX_SITE_URL "${CONVEX_SITE_URL}" 2>/dev/null \
  && echo "  ✓ CONVEX_SITE_URL set" \
  || echo "  ⚠ Could not set CONVEX_SITE_URL (guest auth still works)"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ Convex backend running on http://0.0.0.0:3210"
echo "     From Android emulator: http://10.0.2.2:3210"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ------------------------------------------------------------------
# 4. Keep the process alive — wait for the background convex dev.
# ------------------------------------------------------------------
wait "$CONVEX_PID"
