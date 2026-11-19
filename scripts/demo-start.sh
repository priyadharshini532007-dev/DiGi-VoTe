#!/usr/bin/env bash
# Starts the isolated DIGI-VOTE DEMO stack (does not touch the normal dev stack on :8080/:5173):
#   Firebase Auth emulator  127.0.0.1:9099  (accounts persisted in .local/demo/firebase-emulator)
#   Backend                 http://localhost:8082  (database digivote_demo, verifies emulator tokens only)
#   Frontend                http://localhost:5174  (signs in against the emulator)
set -euo pipefail
source "$(dirname "$0")/demo-lib.sh"
DEMO="$ROOT/.local/demo"
mkdir -p "$DEMO/firebase-emulator" && chmod 700 "$DEMO"

"$ROOT/scripts/dev-mysql.sh" start >/dev/null
ensure_jar

if ! curl -s -o /dev/null http://127.0.0.1:9099/; then
  echo "Starting Firebase Auth emulator..."
  IMPORT=()
  [ -f "$DEMO/firebase-emulator/firebase-export-metadata.json" ] && IMPORT=(--import "$DEMO/firebase-emulator")
  (cd "$ROOT" && nohup npx --yes "$FIREBASE_TOOLS" emulators:start --only auth --project "$PROJECT_ID" \
     ${IMPORT[@]+"${IMPORT[@]}"} --export-on-exit "$DEMO/firebase-emulator" > "$DEMO/emulator.log" 2>&1 &)
  wait_for http://127.0.0.1:9099/ 90 || { echo "Emulator did not start; see $DEMO/emulator.log"; exit 1; }
fi

if ! curl -s -o /dev/null http://localhost:8082/api/public/health; then
  echo "Starting demo backend on :8082..."
  start_backend 8082 digivote_demo 127.0.0.1:9099 "$DEMO/backend" http://localhost:5174 "$DEMO/backend.log"
  wait_for http://localhost:8082/api/public/health 90 || { echo "Backend did not start; see $DEMO/backend.log"; exit 1; }
fi

if ! curl -s -o /dev/null http://localhost:5174/; then
  echo "Starting demo frontend on :5174..."
  (cd "$ROOT/frontend-react" && DIGIVOTE_API_PROXY=http://localhost:8082 VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
    nohup npx vite --host localhost --port 5174 --strictPort > "$DEMO/frontend.log" 2>&1 &)
  wait_for http://localhost:5174/ 60 || { echo "Frontend did not start; see $DEMO/frontend.log"; exit 1; }
fi

echo "DIGI-VOTE demo stack is up: open http://localhost:5174 (emulator auth, demo database)."
