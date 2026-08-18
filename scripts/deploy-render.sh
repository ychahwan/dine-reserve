#!/usr/bin/env bash
#
# Kamix — Deploy Convex backend to Render.
#
# Usage:
#   npm run deploy:render
#   ./scripts/deploy-render.sh
#
# After deployment, update your .env:
#   VITE_CONVEX_URL=https://convex-kamix.onrender.com
#
# Then build the APK:
#   npm run mobile:hosted
#
set -euo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}→ $1${NC}"; }
ok()    { echo -e "${GREEN}✅ $1${NC}"; }
fail()  { echo -e "${RED}❌ $1${NC}" >&2; exit 1; }

# Preflight
command -v render >/dev/null 2>&1 || fail "Render CLI not installed. Install: brew install render"

info "Deploying Convex backend to Render…"
render blueprint apply render.yaml

echo ""
ok "Deployment initiated!"
echo ""
echo "  Next steps:"
echo "  1. Check deployment status:  render services list"
echo "  2. Once 'live', copy the service URL (e.g. https://convex-kamix.onrender.com)"
echo "  3. Update .env:"
echo "     VITE_CONVEX_URL=https://convex-kamix.onrender.com"
echo "  4. Seed demo data:"
echo "     npx convex run seed:resetData --url https://convex-kamix.onrender.com"
echo "  5. Build and install APK:"
echo "     npm run mobile:hosted"
echo ""
