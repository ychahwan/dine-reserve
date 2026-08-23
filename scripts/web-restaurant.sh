#!/usr/bin/env bash
#
# Kamix — Start the web app for the RESTAURANT OWNER view.
#
#   npm run restaurant
#
set -euo pipefail
cd "$(dirname "$0")/.."

CYAN='\033[0;36m'; NC='\033[0m'
fail() { echo -e "\033[0;31m❌ $1${NC}" >&2; exit 1; }

if [ -f .env ]; then
  set -a; source /dev/stdin <<< "$(sed 's/\r$//' .env)"; set +a
fi

[ -n "${VITE_CONVEX_URL:-}" ] || fail "VITE_CONVEX_URL not set in .env"

echo ""
echo -e "${CYAN}═══ Kamix — Restaurant owner app ═══${NC}"
echo -e "  Backend : ${VITE_CONVEX_URL}"
echo -e "  App     : http://localhost:5173/owner"
echo ""

exec npm run dev -- --host
