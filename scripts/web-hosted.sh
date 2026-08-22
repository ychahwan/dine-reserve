#!/usr/bin/env bash
#
# Kamix — Run the web app against the hosted Convex backend.
#
# Loads .env, verifies VITE_CONVEX_URL points at a hosted (non-local)
# deployment, checks that the backend is reachable, then starts the Vite
# dev server bound to all interfaces so other devices can reach it.
#
#   npm run web:hosted
#
set -euo pipefail
cd "$(dirname "$0")/.."

# ─── Colors ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}→ $1${NC}"; }
ok()    { echo -e "${GREEN}✅ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠  $1${NC}"; }
fail()  { echo -e "${RED}❌ $1${NC}" >&2; exit 1; }

# ─── 0. Load .env ──────────────────────────────────────────────────────
# Strip CR characters: .env may be saved with CRLF line endings, which
# would otherwise leak a trailing \r into every sourced variable.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source /dev/stdin <<< "$(sed 's/\r$//' .env)"
  set +a
fi

# ─── 1. Preflight ───────────────────────────────────────────────────────
info "Preflight checks…"

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
  warn "Make sure your Convex deployment is running and the URL is correct."
fi

echo ""
echo -e "${CYAN}═══ Kamix web (hosted Convex) ═══${NC}"
echo -e "  VITE_CONVEX_URL : ${VITE_CONVEX_URL}"
echo ""

# ─── 2. Start the dev server ──────────────────────────────────────────
# Use `npm run` so the project's pinned vite (devDependency) is used
# instead of whatever `npx` would fetch from the registry.
exec npm run dev -- --host
