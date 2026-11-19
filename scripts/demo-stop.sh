#!/usr/bin/env bash
# Stops the DIGI-VOTE demo stack (ports 5174, 8082 and the emulator on 9099). The emulator exports its
# accounts to .local/demo/firebase-emulator when it shuts down.
source "$(dirname "$0")/demo-lib.sh"
stop_port 5174
stop_port 8082
if pkill -INT -f "export-on-exit $ROOT/.local/demo/firebase-emulator" 2>/dev/null; then
  echo "Stopping Firebase Auth emulator (exporting accounts)..."
fi
