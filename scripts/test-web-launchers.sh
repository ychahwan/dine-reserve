#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/kamix-web-launchers.XXXXXX")"
trap 'rm -rf "$FIXTURE_DIR"' EXIT

mkdir -p "$FIXTURE_DIR/scripts" "$FIXTURE_DIR/bin"
cp "$ROOT_DIR/scripts/web-hosted.sh" "$FIXTURE_DIR/scripts/"
cp "$ROOT_DIR/scripts/web-admin.sh" "$FIXTURE_DIR/scripts/"

cat > "$FIXTURE_DIR/.env" <<'EOF'
VITE_CONVEX_URL=https://example.convex.cloud
EOF

cat > "$FIXTURE_DIR/bin/curl" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

cat > "$FIXTURE_DIR/bin/npm" <<'EOF'
#!/usr/bin/env bash
printf 'vite-started\n'
EOF

chmod +x "$FIXTURE_DIR/bin/curl" "$FIXTURE_DIR/bin/npm"

for launcher in web-hosted.sh web-admin.sh; do
  output="$(PATH="$FIXTURE_DIR/bin:$PATH" bash "$FIXTURE_DIR/scripts/$launcher" 2>&1)" || {
    printf '%s failed:\n%s\n' "$launcher" "$output" >&2
    exit 1
  }

  if [[ "$output" != *"vite-started"* ]]; then
    printf '%s did not reach Vite startup:\n%s\n' "$launcher" "$output" >&2
    exit 1
  fi
done

printf 'web launchers load .env and reach Vite startup\n'
