#!/usr/bin/env bash
#
# Kamix — Full local mobile automation.
#
# Starts the Convex backend in Docker, builds a debug APK wired to the
# local backend (http://10.0.2.2:3210 from the emulator), installs it
# on a running emulator, and launches the app.
#
#   npm run mobile:local              # full pipeline
#   ./scripts/mobile-local.sh         # same thing
#
# Prerequisites:
#   - Docker running
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

# ─── Constants ──────────────────────────────────────────────────────────
BACKEND_PORT=3210
# Android emulator maps host loopback to 10.0.2.2
EMULATOR_CONVEX_URL="http://10.0.2.2:${BACKEND_PORT}"
HOST_CONVEX_URL="http://127.0.0.1:${BACKEND_PORT}"

# ─── 0. Preflight ───────────────────────────────────────────────────────
info "Preflight checks…"

command -v docker >/dev/null 2>&1 || fail "Docker is not installed or not in PATH."
docker info >/dev/null 2>&1       || fail "Docker daemon is not running."

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
# Prefer JAVA_HOME if already set, otherwise scan common locations.
find_jdk() {
  local min_major=${1:-21}
  # If JAVA_HOME is set and meets the requirement, use it.
  if [ -n "${JAVA_HOME:-}" ]; then
    local ver; ver="$( "$JAVA_HOME/bin/java" -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/' )"
    local vendor; vendor="$( "$JAVA_HOME/bin/java" -version 2>&1 | tr '[:upper:]' '[:lower:]' )"
    if [[ "$vendor" != *graalvm* ]] && [ "${ver:-0}" -ge "$min_major" ]; then return 0; fi
  fi
  # Scan macOS JDK locations. GraalVM fails Gradle's jlink-based
  # "androidJdkImage" transform, so prefer plain OpenJDK/Temurin/Zulu and
  # explicitly skip GraalVM even if it reports a satisfying version.
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
  fail "JDK 21+ required (for AGP 8.13+). Install: brew install --cask temurin@21"
fi
info "Using JAVA_HOME=${JAVA_HOME}"
java -version 2>&1 | head -1

command -v adb >/dev/null 2>&1 || fail "adb not found. Check ANDROID_HOME/platform-tools."

# Emulator
EMULATOR_DEVICE=$(adb devices 2>/dev/null | grep -w "device" | head -1 | awk '{print $1}' || true)
if [ -z "$EMULATOR_DEVICE" ]; then
  fail "No Android emulator/device found. Start an emulator first:\n  emulator -avd <avd_name> &"
fi
info "Using device: ${EMULATOR_DEVICE}"

# ─── 1. Start Convex backend in Docker ──────────────────────────────────
info "Starting Convex backend in Docker…"

# Check if already running
if docker ps --format '{{.Names}}' | grep -q '^kamix-convex$'; then
  warn "kamix-convex container already running — reusing."
else
  # Stop any stale container
  docker rm -f kamix-convex 2>/dev/null || true

  info "Building Convex backend image (first run takes ~2 min)…"
  docker build -f Dockerfile.convex -t kamix-convex:latest . 2>&1 | tail -3

  info "Starting Convex backend container…"
  docker run -d \
    --name kamix-convex \
    -p "${BACKEND_PORT}:3210" \
    -v kamix-convex-data:/app/data \
    -e CONVEX_SITE_URL="${HOST_CONVEX_URL}" \
    kamix-convex:latest >/dev/null
fi

# Wait for health
info "Waiting for Convex backend to be healthy (port ${BACKEND_PORT})…"
RETRIES=0
MAX_RETRIES=120
until curl -sf "http://127.0.0.1:${BACKEND_PORT}/" >/dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    fail "Convex backend failed to start within 2 minutes.\n  Check: docker logs kamix-convex"
  fi
  sleep 1
  # Print progress every 10 seconds
  if [ $((RETRIES % 10)) -eq 0 ]; then
    echo -ne "  waiting… (${RETRIES}s)\r"
  fi
done
ok "Convex backend is healthy on ${HOST_CONVEX_URL}"

# ─── 2. Build the web bundle ───────────────────────────────────────────
info "Building web bundle with VITE_CONVEX_URL=${EMULATOR_CONVEX_URL}"
export VITE_CONVEX_URL="${EMULATOR_CONVEX_URL}"
npm run build

# ─── 3. Create Android platform (once) ──────────────────────────────────
if [ ! -d android ]; then
  info "Creating Android platform (npx cap add android)…"
  npx cap add android
fi

# ─── 4. Sync web assets into the native project ────────────────────────
info "Syncing web assets (KAMIX_LOCAL=1)…"
export KAMIX_LOCAL=1
npx cap sync android

# ─── 4b. Patch manifest for cleartext HTTP (Android 9+) ───────────────
# Capacitor's allowMixedContent handles WebView mixed content mode,
# but Android 9+ blocks cleartext HTTP at the network level by default.
# We must add android:usesCleartextTraffic="true" after cap sync
# (since cap sync regenerates the manifest from the template).
MANIFEST="android/app/src/main/AndroidManifest.xml"
if [ -f "$MANIFEST" ] && ! grep -q "usesCleartextTraffic" "$MANIFEST"; then
  info "Patching AndroidManifest.xml for cleartext HTTP…"
  sed -i.bak 's|<application|<application android:usesCleartextTraffic="true"|' "$MANIFEST"
  rm -f "${MANIFEST}.bak"
  ok "Manifest patched (cleartext HTTP allowed for local backend)."
fi

# ─── 5. Gradle build ───────────────────────────────────────────────────
info "Building APK with Gradle (first run downloads deps)…"
(
  cd android
  ./gradlew assembleDebug
)

# ─── 6. Copy the artifact ──────────────────────────────────────────────
mkdir -p apk
cp android/app/build/outputs/apk/debug/app-debug.apk apk/kamix-debug.apk
ok "APK built: apk/kamix-debug.apk"

# ─── 7. Install on emulator ────────────────────────────────────────────
info "Installing on ${EMULATOR_DEVICE}…"
adb -s "${EMULATOR_DEVICE}" install -r apk/kamix-debug.apk 2>&1 | tail -1
ok "Installed."

# ─── 8. Launch the app ─────────────────────────────────────────────────
info "Launching Kamix…"
adb -s "${EMULATOR_DEVICE}" shell am start -n com.kamix.app/.MainActivity 2>&1 | tail -1
ok "App launched!"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Kamix is running on ${EMULATOR_DEVICE}${NC}"
echo -e "${GREEN}     Backend: ${HOST_CONVEX_URL} (Docker)${NC}"
echo -e "${GREEN}     App URL: ${EMULATOR_CONVEX_URL} (from emulator)${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "  The Convex backend is running in Docker (container: kamix-convex)."
echo "  To stop it:  docker stop kamix-convex"
echo "  To view logs: docker logs -f kamix-convex"
echo "  To seed demo data:  npx convex run seed:resetData --url ${HOST_CONVEX_URL}"
echo ""
