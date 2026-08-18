#!/usr/bin/env bash
#
# Kamix — Full hosted mobile automation.
#
# Builds a debug APK wired to a hosted Convex backend (e.g. Render),
# installs it on a running emulator, and launches the app.
#
#   npm run mobile:hosted                # debug APK
#   KAMIX_RELEASE=1 npm run mobile:hosted  # signed release APK
#
# Prerequisites:
#   - VITE_CONVEX_URL set in .env (your Render Convex backend URL)
#   - Android emulator running (emulator-5554)
#   - ANDROID_HOME set (or Android SDK at ~/Library/Android/sdk)
#   - JDK 17+
#
set -euo pipefail
cd "$(dirname "$0")/.."

# ─── Colors ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}→ $1${NC}"; }
ok()    { echo -e "${GREEN}✅ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠  $1${NC}"; }
fail()  { echo -e "${RED}❌ $1${NC}" >&2; exit 1; }

RELEASE="${KAMIX_RELEASE:-0}"

# ─── 0. Load .env ──────────────────────────────────────────────────────
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

# ─── 1. Preflight ───────────────────────────────────────────────────────
info "Preflight checks…"

[ -n "${VITE_CONVEX_URL:-}" ] || fail "VITE_CONVEX_URL not set. Add it to .env:\n  VITE_CONVEX_URL=https://your-convex.onrender.com"

# Android SDK
if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  if [ -d "$HOME/Library/Android/sdk" ]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
    export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
  elif [ -d "$HOME/Android/Sdk" ]; then
    export ANDROID_HOME="$HOME/Android/Sdk"
    export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
  else
    fail "Android SDK not found. Set ANDROID_HOME or install Android Studio."
  fi
fi

# AGP 8.13+ requires JDK 21+; detect the best available JDK.
find_jdk() {
  local min_major=${1:-21}
  if [ -n "${JAVA_HOME:-}" ]; then
    local ver; ver="$( "$JAVA_HOME/bin/java" -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/' )"
    if [ "${ver:-0}" -ge "$min_major" ]; then return 0; fi
  fi
  for dir in \
    /Library/Java/JavaVirtualMachines/*/Contents/Home \
    "$HOME/Library/Java/JavaVirtualMachines"/*/Contents/Home \
    /opt/homebrew/opt/openjdk*/libexec/openjdk.jdk/Contents/Home; do
    if [ -x "$dir/bin/java" ]; then
      local ver; ver="$( "$dir/bin/java" -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/' )"
      if [ "${ver:-0}" -ge "$min_major" ]; then
        export JAVA_HOME="$dir"
        return 0
      fi
    fi
  done
  return 1
}

if ! find_jdk 21; then
  fail "JDK 21+ required (for AGP 8.13+). Install: brew install --cask temurin@21"
fi
info "Using JAVA_HOME=${JAVA_HOME}"

command -v adb >/dev/null 2>&1 || fail "adb not found. Check ANDROID_HOME/platform-tools."

EMULATOR_DEVICE=$(adb devices 2>/dev/null | grep -w "device" | head -1 | awk '{print $1}' || true)
if [ -z "$EMULATOR_DEVICE" ]; then
  fail "No Android emulator/device found. Start an emulator first:\n  emulator -avd <avd_name> &"
fi
info "Using device: ${EMULATOR_DEVICE}"

# Verify the backend is reachable
info "Checking Convex backend at ${VITE_CONVEX_URL}…"
if curl -sf --max-time 10 "${VITE_CONVEX_URL}/" >/dev/null 2>&1; then
  ok "Backend reachable."
else
  warn "Backend not reachable at ${VITE_CONVEX_URL} — the app may not load data."
  warn "Make sure your Render service is running and the URL is correct."
fi

echo ""
echo -e "${CYAN}═══ Kamix hosted mobile build ═══${NC}"
echo -e "  VITE_CONVEX_URL : ${VITE_CONVEX_URL}"
echo -e "  Build type      : $([ "$RELEASE" = "1" ] && echo "release (signed)" || echo "debug")"
echo ""

# ─── 2. Build the web bundle ───────────────────────────────────────────
info "Building web bundle…"
# Hosted mode: KAMIX_LOCAL unset → https scheme, no mixed content
unset KAMIX_LOCAL 2>/dev/null || true
npm run build

# ─── 3. Create Android platform (once) ──────────────────────────────────
if [ ! -d android ]; then
  info "Creating Android platform (npx cap add android)…"
  npx cap add android
fi

# ─── 4. Sync web assets into the native project ────────────────────────
info "Syncing web assets (hosted mode)…"
npx cap sync android

# ─── 5. Gradle build ───────────────────────────────────────────────────
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

  GRADLE=android/app/build.gradle
  if ! grep -q "kamixSigning" "$GRADLE"; then
    cat >> "$GRADLE" <<'GRADLE_EOF'

// ---- Kamix release signing (injected by scripts/mobile-hosted.sh) ----
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
android {
    signingConfigs {
        kamixSigning {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties["storeFile"])
                storePassword keystoreProperties["storePassword"]
                keyAlias keystoreProperties["keyAlias"]
                keyPassword keystoreProperties["keyPassword"]
            }
        }
    }
    buildTypes {
        release {
            signingConfig keystorePropertiesFile.exists() ? signingConfigs.kamixSigning : signingConfigs.debug
        }
    }
}
GRADLE_EOF
  fi

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

# ─── 6. Install on emulator ────────────────────────────────────────────
info "Installing on ${EMULATOR_DEVICE}…"
adb -s "${EMULATOR_DEVICE}" install -r "$APK_OUT" 2>&1 | tail -1
ok "Installed."

# ─── 7. Launch the app ─────────────────────────────────────────────────
info "Launching Kamix…"
adb -s "${EMULATOR_DEVICE}" shell am start -n com.kamix.app/.MainActivity 2>&1 | tail -1
ok "App launched!"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Kamix is running on ${EMULATOR_DEVICE}${NC}"
echo -e "${GREEN}     Backend: ${VITE_CONVEX_URL} (hosted)${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
