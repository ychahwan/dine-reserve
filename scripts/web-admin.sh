#!/usr/bin/env bash
#
# Kamix — Start the web app for the platform ADMIN console.
#
#   npm run admin
#
set -euo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${CYAN}→ $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}" >&2; exit 1; }

# Load .env
if [ -f .env ]; then
  set -a; source /dev/stdin <<< "$(sed 's/\r$//' .env)"; set +a
fi

[ -n "${VITE_CONVEX_URL:-}" ] || fail "VITE_CONVEX_URL not set in .env"

echo ""
echo -e "${CYAN}═══ Kamix — Admin console ═══${NC}"
echo ""
echo -e "  Backend    : ${VITE_CONVEX_URL}"
echo -e "  App        : http://localhost:5173 → /admin"
echo -e "  Admin phone: ${GREEN}+96176683661${NC}"
echo -e "  Login      : enter phone at /auth → PASSWORD screen"
echo ""

exec npm run dev -- --host
