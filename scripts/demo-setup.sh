#!/usr/bin/env bash
# Creates (or re-checks) the five DIGI-VOTE demo accounts and the minimal demo election on the demo stack.
#   scripts/demo-setup.sh                 # safe to repeat; prints passwords only for newly created accounts
#   scripts/demo-setup.sh --open-voting   # also move the demo election to VOTING
#   scripts/demo-setup.sh --reset-passwords  # new random passwords for the emulator accounts
set -euo pipefail
source "$(dirname "$0")/demo-lib.sh"
"$ROOT/scripts/demo-start.sh"
node "$ROOT/frontend-react/scripts/demo-accounts.mjs" --api http://localhost:8082 --emulator 127.0.0.1:9099 "$@"
# Persist emulator accounts now, so they survive even if the emulator is not stopped cleanly.
(cd "$ROOT" && npx --yes "$FIREBASE_TOOLS" emulators:export "$ROOT/.local/demo/firebase-emulator" \
   --project "$PROJECT_ID" --force > "$ROOT/.local/demo/export.log" 2>&1) && echo "Emulator accounts saved to .local/demo/firebase-emulator"
