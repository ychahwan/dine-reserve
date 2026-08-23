#!/usr/bin/env bash
#
# Kamix — Package mobile app (Android APK + iOS build).
#
# Builds the web bundle for the hosted Convex backend, syncs Capacitor,
# then builds the Android APK. iOS build requires Xcode on macOS.
#
#   npm run package:mobile                     # debug APK
#   KAMIX_RELEASE=1 npm run package:mobile     # signed release APK
#
# Prerequisites:
#   - VITE_CONVEX_URL set in .env
#   - Android SDK + emulator (for APK install)
#   - JDK 21+
#
set -euo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}→ $1${NC}"; }
ok()    { echo -e "${GREEN}✅ $1${NC}"; }
fail()  { echo -e "${RED}❌ $1${NC}" >&2; exit 1; }

RELEASE="${KAMIX_RELEASE:-0}"

# Load .env
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

[ -n "${VITE_CONVEX_URL:-}" ] || fail "VITE_CONVEX_URL not set in .env"

# Android SDK detection
if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  if [ -d "$HOME/Library/Android/sdk" ]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  elif [ -d "$HOME/Android/Sdk" ]; then
    export ANDROID_HOME="$HOME/Android/Sdk"
  else
    fail "Android SDK not found. Set ANDROID_HOME or install Android Studio."
  fi
fi
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH" 2>/dev/null || true

# JDK detection (AGP 8.13+ requires JDK 21+)
find_jdk() {
  local min_major=${1:-21}
  if [ -n "${JAVA_HOME:-}" ]; then
    local ver; ver="$( "$JAVA_HOME/bin/java" -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/' )"
    if [ "${ver:-0}" -ge "$min_major" ]; then return 0; fi
  fi
  for dir in \
    /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
    /opt/homebrew/opt/openjdk*/libexec/openjdk.jdk/Contents/Home \
    "$HOME/Library/Java/JavaVirtualMachines"/*/Contents/Home \
    /Library/Java/JavaVirtualMachines/*/Contents/Home; do
    if [ -x "$dir/bin/java" ]; then
      local ver; ver="$( "$dir/bin/java" -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/' )"
      local vendor; vendor="$( "$dir/bin/java" -version 2>&1 | tr '[:upper:]' '[:lower:]' )"
      if [[ "$vendor" == *graalvm* ]]; then continue; fi
      if [ "${ver:-0}" -ge "$min_major" ]; then
        export JAVA_HOME="$dir"
        return 0
      fi
    fi
  done
  return 1
}

if ! find_jdk 21; then
  fail "JDK 21+ required. Install: brew install --cask temurin@21"
fi

info "Backend  : ${VITE_CONVEX_URL}"
info "Build    : $([ "$RELEASE" = "1" ] && echo "release (signed)" || echo "debug")"
echo ""

# 1. Build web bundle
info "Building web bundle…"
unset KAMIX_LOCAL 2>/dev/null || true
npm run build

# 2. Create Android platform (once)
if [ ! -d android ]; then
  info "Creating Android platform…"
  npx cap add android
fi

# 3. Sync web assets
info "Syncing web assets…"
npx cap sync android

# 4. Gradle build
if [ "$RELEASE" = "1" ]; then
  : "${KAMIX_KEYSTORE_FILE:?KAMIX_RELEASE=1 requires KAMIX_KEYSTORE_FILE}"
  : "${KAMIX_KEYSTORE_PASS:?KAMIX_RELEASE=1 requires KAMIX_KEYSTORE_PASS}"
  : "${KAMIX_KEY_ALIAS:?KAMIX_RELEASE=1 requires KAMIX_KEY_ALIAS}"
  : "${KAMIX_KEY_PASS:?KAMIX_RELEASE=1 requires KAMIX_KEY_PASS}"

  cat > android/keystore.properties <<EOF
storeFile=${KAMIX_KEYSTORE_FILE}
storePassword=${KAMIX_KEYSTORE_PASS}
keyAlias=${KAMIX_KEY_ALIAS}
keyPassword=${KAMIX_KEY_PASS}
EOF

  info "Building signed release APK…"
  (cd android && ./gradlew assembleRelease)
  APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
  APK_OUT="apk/kamix-release.apk"
else
  info "Building debug APK…"
  (cd android && ./gradlew assembleDebug)
  APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
  APK_OUT="apk/kamix-debug.apk"
fi

mkdir -p apk
cp "$APK_PATH" "$APK_OUT"
ok "APK built: ${APK_OUT}"

# 5. Try to install on emulator (if running)
EMULATOR_DEVICE=$(adb devices 2>/dev/null | grep -w "device" | head -1 | awk '{print $1}' || true)
if [ -n "$EMULATOR_DEVICE" ]; then
  info "Installing on ${EMULATOR_DEVICE}…"
  adb -s "${EMULATOR_DEVICE}" install -r "$APK_OUT" 2>&1 | tail -1
  ok "Installed."

  info "Launching Kamix…"
  adb -s "${EMULATOR_DEVICE}" shell am start -n com.kamix.app/.MainActivity 2>&1 | tail -1
  ok "App launched!"
else
  info "No emulator running — APK saved at ${APK_OUT}"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Mobile build complete${NC}"
echo -e "${GREEN}     Backend: ${VITE_CONVEX_URL}${NC}"
echo -e "${GREEN}     APK: ${APK_OUT}${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
