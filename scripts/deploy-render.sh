#!/usr/bin/env bash
#
# Kamix — Deploy to Render.
#
#   npm run deploy
#
# Reads RENDER_API_KEY and RENDER_PROJECT_ID from .env.render.
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
[ -n "${RENDER_PROJECT_ID:-}" ] || fail "RENDER_PROJECT_ID not set in .env.render"

# Ensure convex is deployed first
info "Deploying Convex functions…"
npx convex deploy

# Trigger Render deploy via API
info "Triggering Render deploy for project ${RENDER_PROJECT_ID}…"
RESPONSE=$(curl -s -X POST \
  "https://api.render.com/v1/services?project_id=${RENDER_PROJECT_ID}" \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  2>&1) || true

echo ""
ok "Convex deployed. Check Render dashboard for web service status."
echo ""
echo "  Render dashboard: https://dashboard.render.com/project/${RENDER_PROJECT_ID}"
echo ""
