#!/usr/bin/env bash
#
# Kamix — Deploy to Render.
#
#   npm run deploy
#
# Reads RENDER_API_KEY and RENDER_SERVICE_ID from .env.render.
#
set -euo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}→ $1${NC}"; }
ok()    { echo -e "${GREEN}✅ $1${NC}"; }
fail()  { echo -e "${RED}❌ $1${NC}" >&2; exit 1; }

# Load Render credentials
if [ -f .env.render ]; then
  set -a; source /dev/stdin <<< "$(sed 's/\r$//' .env.render)"; set +a
fi

[ -n "${RENDER_API_KEY:-}" ] || fail "RENDER_API_KEY not set in .env.render"
[ -n "${RENDER_SERVICE_ID:-}" ] || fail "RENDER_SERVICE_ID not set in .env.render"

# Ensure convex is deployed first
info "Deploying Convex functions…"
npx convex deploy

# Trigger Render deploy via API
info "Triggering Render deploy for service ${RENDER_SERVICE_ID}…"
RESPONSE=$(curl -s -X POST \
  "https://api.render.com/v1/services/${RENDER_SERVICE_ID}/deploys" \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{}' \
  2>&1)

DEPLOY_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('deploy',{}).get('id',''))" 2>/dev/null || true)

if [ -n "$DEPLOY_ID" ]; then
  ok "Deploy triggered: ${DEPLOY_ID}"
else
  echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
  fail "Deploy trigger failed."
fi

echo ""
echo "  Dashboard: https://dashboard.render.com/web/${RENDER_SERVICE_ID}"
echo "  Status:    check the Deploy tab for build progress"
echo ""
