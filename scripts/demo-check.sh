#!/usr/bin/env bash
# Self-check of the demo setup on a THROWAWAY copy: separate emulator (:9199, not persisted), separate backend
# (:8083) and the scratch database digivote_democheck (recreated each run). Runs the same setup as
# demo-setup.sh, then the full lifecycle (vote, duplicate rejection, receipts, publication, audit) with the five
# demo accounts. The real demo stack and its data are not touched.
set -euo pipefail
source "$(dirname "$0")/demo-lib.sh"
CHECK="$ROOT/.local/democheck"
rm -rf "$CHECK" && mkdir -p "$CHECK" && chmod 700 "$CHECK"
"$ROOT/scripts/dev-mysql.sh" start >/dev/null
"$ROOT/scripts/dev-mysql.sh" reset-democheck >/dev/null
ensure_jar

cat > "$CHECK/firebase.json" <<JSON
{ "emulators": { "auth": { "host": "127.0.0.1", "port": 9199 }, "hub": { "port": 4410 }, "logging": { "port": 4510 },
  "ui": { "enabled": false }, "singleProjectMode": true } }
JSON
cleanup() {
  stop_port 8083 >/dev/null
  pkill -f "emulators:start --only auth --project $PROJECT_ID --config $CHECK/firebase.json" 2>/dev/null
  rm -f "$CHECK/credentials.json"
  true
}
trap cleanup EXIT

(cd "$CHECK" && nohup npx --yes "$FIREBASE_TOOLS" emulators:start --only auth --project "$PROJECT_ID" \
   --config "$CHECK/firebase.json" > "$CHECK/emulator.log" 2>&1 &)
wait_for http://127.0.0.1:9199/ 90 || { echo "Check emulator did not start; see $CHECK/emulator.log"; exit 1; }
start_backend 8083 digivote_democheck 127.0.0.1:9199 "$CHECK/backend" http://localhost:5174 "$CHECK/backend.log"
wait_for http://localhost:8083/api/public/health 90 || { echo "Check backend did not start; see $CHECK/backend.log"; exit 1; }

node "$ROOT/frontend-react/scripts/demo-accounts.mjs" --api http://localhost:8083 --emulator 127.0.0.1:9199 \
  --credentials "$CHECK/credentials.json" --verify-lifecycle
echo "Demo self-check finished; throwaway environment removed."
