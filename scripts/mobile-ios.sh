#!/usr/bin/env bash
#
# Kamix — iOS mobile build + simulator install, wired to a hosted Convex
# backend (Convex Cloud or Render).
#
#   npm run mobile:ios                 # build + install + launch on a booted simulator
#   KAMIX_IOS_DEST="platform=iOS Simulator,name=iPhone 16" npm run mobile:ios
#
# Prerequisites:
#   - macOS + Xcode installed (xcodebuild, xcrun)
#   - VITE_CONVEX_URL set in .env (Convex Cloud or Render URL)
#   - CocoaPods (installed automatically by `npx cap sync ios` if missing)
#
set -euo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}→ $1${NC}"; }
ok()    { echo -e "${GREEN}✅ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠  $1${NC}"; }
fail()  { echo -e "${RED}❌ $1${NC}" >&2; exit 1; }

# ─── 0. Load .env ──────────────────────────────────────────────────────
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

# ─── 1. Preflight ───────────────────────────────────────────────────────
[ "$(uname)" = "Darwin" ] || fail "iOS builds require macOS + Xcode."
command -v xcodebuild >/dev/null 2>&1 || fail "Xcode command line tools not found."
command -v xcrun >/dev/null 2>&1 || fail "xcrun not found (install Xcode)."
[ -n "${VITE_CONVEX_URL:-}" ] || fail "VITE_CONVEX_URL not set. Add it to .env."

info "Checking Convex backend at ${VITE_CONVEX_URL}…"
if curl -sf --max-time 10 "${VITE_CONVEX_URL}/" >/dev/null 2>&1; then
  ok "Backend reachable."
else
  warn "Backend not reachable at ${VITE_CONVEX_URL} — the app may not load data."
fi

# ─── 2. Build the web bundle ────────────────────────────────────────────
info "Building web bundle…"
unset KAMIX_LOCAL 2>/dev/null || true
npm run build

# ─── 3. Create iOS platform (once) ──────────────────────────────────────
if [ ! -d ios ]; then
  info "Creating iOS platform (npx cap add ios)…"
  npx cap add ios
fi

# ─── 4. Sync web assets into the native project ─────────────────────────
info "Syncing web assets into iOS project…"
npx cap sync ios

# ─── 5. Pick a simulator ─────────────────────────────────────────────────
SIM_UDID=$(xcrun simctl list devices booted | grep -Eo '[0-9A-F-]{36}' | head -1 || true)
if [ -z "$SIM_UDID" ]; then
  info "No booted simulator found — booting the default iPhone simulator…"
  DEFAULT_SIM=$(xcrun simctl list devices available | grep -E "iPhone (1[5-9]|[2-9][0-9])" | head -1 | grep -Eo '[0-9A-F-]{36}' || true)
  [ -n "$DEFAULT_SIM" ] || fail "No iPhone simulator available. Create one in Xcode > Devices."
  xcrun simctl boot "$DEFAULT_SIM"
  open -a Simulator
  sleep 5
  SIM_UDID="$DEFAULT_SIM"
fi
info "Using simulator: ${SIM_UDID}"

# ─── 6. Build for the simulator ──────────────────────────────────────────
DEST="${KAMIX_IOS_DEST:-id=${SIM_UDID}}"
info "Building iOS app (xcodebuild, destination: ${DEST})…"
(
  cd ios/App
  xcodebuild \
    -project App.xcodeproj \
    -scheme App \
    -configuration Debug \
    -destination "${DEST}" \
    -derivedDataPath build \
    build
)

APP_PATH=$(find ios/App/build -name "App.app" -path "*Debug-iphonesimulator*" | head -1)
[ -n "$APP_PATH" ] || fail "Built .app not found under ios/App/build."
ok "Built: ${APP_PATH}"

# ─── 7. Install + launch on simulator ────────────────────────────────────
info "Installing on simulator…"
xcrun simctl install "$SIM_UDID" "$APP_PATH"
ok "Installed."

info "Launching Kamix…"
xcrun simctl launch "$SIM_UDID" com.kamix.app
ok "App launched!"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Kamix is running on simulator ${SIM_UDID}${NC}"
echo -e "${GREEN}     Backend: ${VITE_CONVEX_URL}${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
