#!/usr/bin/env bash
#
# Kamix — Convex-aware mobile build (Android APK).
#
# The one-command production pipeline: pushes the Convex backend functions to
# the configured deployment, bakes the live Convex URL into the web bundle,
# wraps it with Capacitor and compiles an installable Android APK.
#
#   npm run mobile:convex                       # debug APK → apk/kamix-debug.apk
#   KAMIX_RELEASE=1 npm run mobile:convex       # signed release APK → apk/kamix-release.apk
#
# Requirements (local build):
#   - Node 20+ / npm
#   - JDK 17+ and Android SDK (or build in Docker: `npm run mobile:docker`)
#   - Convex CLI auth — CONVEX_DEPLOY_KEY set, or `npx convex login` done once
#   - VITE_CONVEX_URL (from .env, see .env.example) — the URL the app talks to
#
# Environment variables:
#   KAMIX_RELEASE=1          build a signed release APK instead of debug
#   KAMIX_KEYSTORE_FILE      path to the .jks/.keystore (release only)
#   KAMIX_KEYSTORE_PASS      keystore password          (release only)
#   KAMIX_KEY_ALIAS          key alias                   (release only)
#   KAMIX_KEY_PASS           key password                (release only)
#
set -euo pipefail
cd "$(dirname "$0")/.."

RELEASE="${KAMIX_RELEASE:-0}"

# --- 0. Preflight ---------------------------------------------------------------
# Load .env (VITE_CONVEX_URL, TWILIO_*, …) when present so the build works
# from a plain checkout without exporting anything.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [ -z "${VITE_CONVEX_URL:-}" ]; then
  echo "❌ VITE_CONVEX_URL is not set — the app needs to know where its Convex backend lives." >&2
  echo "   cp .env.example .env  →  set VITE_CONVEX_URL=https://<project>.convex.site" >&2
  exit 1
fi

if ! command -v java >/dev/null 2>&1; then
  echo "❌ Java (JDK 17+) not found. Install Android Studio, or build in Docker:" >&2
  echo "   npm run mobile:docker" >&2
  exit 1
fi
JAVA_MAJOR="$(java -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/')"
if [ "${JAVA_MAJOR:-0}" -lt 17 ]; then
  echo "❌ JDK 17+ required, found Java ${JAVA_MAJOR}." >&2
  echo "   macOS: brew install --cask temurin@17   Ubuntu: sudo apt install openjdk-17-jdk" >&2
  exit 1
fi

echo ""
echo "═══ Kamix mobile build (Convex pipeline) ═══"
echo "  VITE_CONVEX_URL : ${VITE_CONVEX_URL}"
echo "  Build type      : $([ "$RELEASE" = "1" ] && echo "release (signed)" || echo "debug")"
echo ""

# --- 1. Push the backend ----------------------------------------------------------
echo "→ [1/5] Pushing Convex functions + regenerating types (convex dev --once)…"
npx convex dev --once

# --- 2. Web bundle (VITE_CONVEX_URL is baked in by Vite) ----------------------------
echo "→ [2/5] Building the web bundle (npm run build)…"
npm run build

# --- 3. Android platform (created once) ----------------------------------------------
if [ ! -d android ]; then
  echo "→ [3/5] Creating the Android platform (npx cap add android)…"
  npx cap add android
else
  echo "→ [3/5] Android platform already present."
fi

# --- 4. Sync web assets into the native project ----------------------------------------
echo "→ [4/5] Syncing web assets (npx cap sync android)…"
npx cap sync android

# --- 5. Gradle build ---------------------------------------------------------------------
if [ "$RELEASE" = "1" ]; then
  # Signed release build — fail fast if any signing credential is missing.
  : "${KAMIX_KEYSTORE_FILE:?KAMIX_RELEASE=1 requires KAMIX_KEYSTORE_FILE (path to .jks)}"
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
    echo "→ Wiring the signing config into ${GRADLE}…"
    cat >> "$GRADLE" <<'GRADLE_EOF'

// ---- Kamix release signing (injected by scripts/build-mobile-convex.sh) ----
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

  echo "→ [5/5] Building the signed release APK (Gradle assembleRelease)…"
  (cd android && ./gradlew assembleRelease)
  mkdir -p apk
  cp android/app/build/outputs/apk/release/app-release.apk apk/kamix-release.apk
  echo ""
  echo "✅ Release APK ready: apk/kamix-release.apk"
  echo "   Install on a device:  adb install apk/kamix-release.apk"
  echo "   Upload to the Play Store via Play Console ▸ Release ▸ Production."
else
  echo "→ [5/5] Building the debug APK (Gradle assembleDebug)…"
  (cd android && ./gradlew assembleDebug)
  mkdir -p apk
  cp android/app/build/outputs/apk/debug/app-debug.apk apk/kamix-debug.apk
  echo ""
  echo "✅ Debug APK ready: apk/kamix-debug.apk"
  echo "   Install on a device/emulator:  adb install apk/kamix-debug.apk"
  echo "   For a signed release: KAMIX_RELEASE=1 KAMIX_KEYSTORE_FILE=… npm run mobile:convex"
fi
