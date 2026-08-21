#!/usr/bin/env bash
#
# Kamix — Start the web app for the platform ADMIN console.
#
# The admin panel is part of the same web app, at /admin. This script runs
# the same preflight + Vite dev server as `web:hosted` (hosted Convex
# backend), and prints the admin sign-in details up front.
#
#   npm run web:admin
#
set -euo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${CYAN}→ $1${NC}"; }
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠  $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}" >&2; exit 1; }

# ─── 0. Load .env (strip CR for CRLF-safe sourcing) ────────────────────
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source <(sed 's/\r$//' .env)
  set +a
fi

# ─── 1. Preflight ───────────────────────────────────────────────────────
[ -n "${VITE_CONVEX_URL:-}" ] || fail "VITE_CONVEX_URL not set. Add it to .env:\n  VITE_CONVEX_URL=https://<project>.convex.site"

case "$VITE_CONVEX_URL" in
  *localhost*|*127.0.0.1*|*0.0.0.0*|http://*)
    warn "VITE_CONVEX_URL looks like a LOCAL backend (${VITE_CONVEX_URL})."
    warn "This is 'hosted' mode — make sure you meant to run against the hosted Convex deployment."
    ;;
esac

info "Checking Convex backend at ${VITE_CONVEX_URL}…"
if curl -sf --max-time 10 "${VITE_CONVEX_URL}/" >/dev/null 2>&1; then
  ok "Backend reachable."
else
  warn "Backend not reachable at ${VITE_CONVEX_URL} — the app may not load data."
fi

# ─── 2. Admin sign-in details ───────────────────────────────────────────
echo ""
echo -e "${CYAN}═══ Kamix — Admin console ═══${NC}"
echo ""
echo -e "  Console URL   : ${VITE_CONVEX_URL%/} is the backend (no UI here)"
echo -e "  Start the app : http://localhost:5173  →  sign in → /admin"
echo -e "  Admin phone   : ${GREEN}+96176683661${NC}"
echo -e "  Admin login   : enter the phone at /auth → PASSWORD screen (existing"
echo -e "                  user, no OTP) → you land on /admin automatically."
echo -e "                  Forgot the password? Use 'Forgot password?' → OTP reset."
echo ""

# ─── 3. Start the dev server ───────────────────────────────────────────
exec npm run dev -- --host
