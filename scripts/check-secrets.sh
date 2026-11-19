#!/usr/bin/env bash
# Scans tracked files for things that must never be committed. Exits non-zero on findings.
set -uo pipefail
cd "$(dirname "$0")/.."
status=0
tracked=$(git ls-files)
for f in $tracked; do
  case "$f" in
    .env|*/.env|*.pem|*.p12|*.jks|*service-account*.json|firebase-adminsdk*.json|.local/*)
      echo "FORBIDDEN FILE TRACKED: $f"; status=1;;
  esac
done
if git grep -nIE "BEGIN (RSA |EC )?PRIVATE KEY|\"private_key\"\s*:|AIza[0-9A-Za-z_-]{35}|DB_PASSWORD=[^c$\{]" -- . ':!scripts/check-secrets.sh' ':!*.md'; then
  echo "Possible secret found in tracked content"; status=1
fi
if [ $status -eq 0 ]; then echo "No secrets found in tracked files."; fi
exit $status
