# Shared settings for the DIGI-VOTE demo scripts (sourced, not executed).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
export JAVA_HOME PATH="$JAVA_HOME/bin:$PATH"
FIREBASE_TOOLS="firebase-tools@15.33.0"
PROJECT_ID="digi-vote-be516"
JAR="$ROOT/backend/target/digivote-backend-1.0.0.jar"

wait_for() { # url, seconds
  for _ in $(seq 1 "$2"); do curl -s -o /dev/null "$1" && return 0; sleep 1; done
  return 1
}

ensure_jar() {
  if [ ! -f "$JAR" ]; then
    echo "Building backend jar (first run)..."
    (cd "$ROOT/backend" && mvn -q -DskipTests package) || exit 1
  fi
}

# start_backend <port> <database> <emulator host> <local dir> <frontend origin> <log>
start_backend() {
  local db_url
  db_url="jdbc:mysql://127.0.0.1:3307/$2"
  (cd "$ROOT/backend" && PORT="$1" DB_URL="$db_url" FIREBASE_ENABLED=true FIREBASE_AUTH_EMULATOR_HOST="$3" \
    DIGIVOTE_LOCAL_DIR="$4" DIGIVOTE_PUBLIC_BASE_URL="$5" DIGIVOTE_CORS_ORIGINS="$5" \
    DIGIVOTE_STORAGE_PROVIDER=local FIREBASE_APP_CHECK_ENABLED=false \
    nohup "$JAVA_HOME/bin/java" -jar "$JAR" > "$6" 2>&1 &)
}

# Stops whatever DIGI-VOTE demo process listens on a demo-only port.
stop_port() {
  local pids
  pids=$(lsof -t -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true)
  [ -n "$pids" ] && kill $pids 2>/dev/null && echo "Stopped process on :$1"
  return 0
}
