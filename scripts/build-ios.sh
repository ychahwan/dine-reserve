#!/usr/bin/env bash
#
# Builds Kamix for iOS (macOS + Xcode required — Apple licensing prevents iOS
# builds on other OSes or inside Docker).
#
#   ./scripts/build-ios.sh                   # simulator build (no code signing)
#   KAMIX_IOS_DEST="generic/platform=iOS" ./scripts/build-ios.sh   # device/App Store build
#   npm run build:ios                        # same as the simulator build
#
# Before a device/App Store build, open the project once in Xcode
# (npm run mobile:open ios), select your Team + bundle id under
# Signing & Capabilities, then re-run with KAMIX_IOS_DEST="generic/platform=iOS".
# The signed .app lands in DerivedData; Archive (Product ▸ Archive) produces
# the distributable .ipa for App Store / TestFlight.
set -euo pipefail
cd "$(dirname "$0")/.."

# --- Preflight -------------------------------------------------------------------
if [ "$(uname -s)" != "Darwin" ]; then
  echo "❌ iOS builds require macOS with Xcode." >&2
  echo "   On Linux/Windows use the Docker APK build: docker compose run --rm apk" >&2
  exit 1
fi
if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "❌ Xcode not found. Install it from the Mac App Store, then open it once to accept the license." >&2
  exit 1
fi

# --- Web build --------------------------------------------------------------------
echo "→ Building the web bundle (npm run build)…"
npm run build

# --- Create the iOS platform once ---------------------------------------------------
if [ ! -d ios ]; then
  echo "→ Creating the iOS platform (npx cap add ios)…"
  npx cap add ios
fi

# --- Sync ----------------------------------------------------------------------------
echo "→ Syncing web assets into the iOS project (npx cap sync)…"
npx cap sync ios

# --- Build ----------------------------------------------------------------------------
DEST="${KAMIX_IOS_DEST:-generic/platform=iOS Simulator}"
echo "→ Building with xcodebuild (destination: ${DEST})…"
(
  cd ios/App
  xcodebuild \
    -workspace App.xcworkspace \
    -scheme App \
    -configuration Release \
    -destination "${DEST}" \
    build
)

echo ""
echo "✅ iOS build finished."
echo "   Run in the simulator:  npm run mobile:open ios   (then Cmd+R)"
echo "   Archive for the App Store: open Xcode ▸ Product ▸ Archive"
