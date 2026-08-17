#!/usr/bin/env bash
#
# Kamix mobile build wrapper.
#
#   ./scripts/build-mobile.sh apk     # Android APK (local or Docker)
#   ./scripts/build-mobile.sh ios     # iOS (macOS + Xcode only)
#   ./scripts/build-mobile.sh all     # both (iOS part requires macOS)
#
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-apk}"

case "$TARGET" in
  apk | android)
    exec bash scripts/build-apk.sh
    ;;
  ios | iphone)
    exec bash scripts/build-ios.sh
    ;;
  all | both)
    bash scripts/build-apk.sh
    bash scripts/build-ios.sh
    ;;
  *)
    echo "Usage: $0 {apk|ios|all}" >&2
    exit 1
    ;;
esac
