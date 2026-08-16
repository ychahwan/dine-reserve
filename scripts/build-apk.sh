#!/usr/bin/env bash
#
# Builds Kamix into an installable Android APK (debug).
#
#   ./scripts/build-apk.sh            # local build (needs JDK 17+ and Android SDK)
#   ./scripts/build-apk.sh --docker   # skip local tool checks (used inside Dockerfile.mobile)
#   npm run build:apk                 # same as the local build
#
# Output: apk/kamix-debug.apk  (install with: adb install apk/kamix-debug.apk)
#
# Requirements (local builds only):
#   - JDK 17+        macOS: brew install --cask temurin@17   Ubuntu: sudo apt install openjdk-17-jdk
#   - Android SDK    Install Android Studio, or use the Docker build (no SDK needed):
#                    docker compose run --rm apk
set -euo pipefail
cd "$(dirname "$0")/.."

DOCKER_MODE="${1:-}"

# --- 0. Preflight -------------------------------------------------------------
if [ "$DOCKER_MODE" != "--docker" ]; then
  if ! command -v java >/dev/null 2>&1; then
    echo "❌ Java (JDK 17+) is required to build the APK." >&2
    echo "   Install Android Studio, or use the Docker build: docker compose run --rm apk" >&2
    exit 1
  fi
  JAVA_MAJOR="$(java -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/')"
  if [ "${JAVA_MAJOR:-0}" -lt 17 ]; then
    echo "❌ JDK 17+ required, found Java ${JAVA_MAJOR}." >&2
    echo "   macOS: brew install --cask temurin@17   Ubuntu: sudo apt install openjdk-17-jdk" >&2
    exit 1
  fi
  if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
    echo "❌ Android SDK not found. Install Android Studio, or use the Docker build:" >&2
    echo "   docker compose run --rm apk" >&2
    exit 1
  fi
fi

# --- 1. Web build (bakes VITE_CONVEX_URL into the bundle) ----------------------
echo "→ Building the web bundle (npm run build)…"
npm run build

# --- 2. Create the Android platform once ----------------------------------------
if [ ! -d android ]; then
  echo "→ Creating the Android platform (npx cap add android)…"
  npx cap add android
fi

# --- 3. Copy the latest web build into the platform ------------------------------
echo "→ Syncing web assets into the Android project (npx cap sync)…"
npx cap sync android

# --- 4. Gradle build --------------------------------------------------------------
echo "→ Building the APK with Gradle (first run downloads dependencies — be patient)…"
(
  cd android
  ./gradlew assembleDebug
)

# --- 5. Copy the artifact out ------------------------------------------------------
mkdir -p apk
cp android/app/build/outputs/apk/debug/app-debug.apk apk/kamix-debug.apk
echo ""
echo "✅ APK ready: apk/kamix-debug.apk"
echo "   Install on a device/emulator:  adb install apk/kamix-debug.apk"
echo "   Open in Android Studio:        npm run mobile:open android"
