#!/usr/bin/env bash
# Boot the dev server, run the AI concierge browser test, then clean up.
set -u
cd "$(dirname "$0")/.."

pkill -f "vite --host" 2>/dev/null || true
sleep 1

nohup npx vite --host > /tmp/vite.log 2>&1 &
VITE_PID=$!

for i in $(seq 1 60); do
  if curl -s -o /dev/null http://localhost:5173/ 2>/dev/null; then
    echo "vite up after ${i}s"
    break
  fi
  sleep 1
  if [ "$i" = "60" ]; then
    echo "vite failed to start:"; tail -20 /tmp/vite.log
    kill "$VITE_PID" 2>/dev/null
    exit 1
  fi
done

node scripts/test-ai-browser.mjs
RC=$?

kill "$VITE_PID" 2>/dev/null
exit $RC
