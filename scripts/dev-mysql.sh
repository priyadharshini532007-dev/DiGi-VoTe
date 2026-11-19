#!/usr/bin/env bash
# DIGI-VOTE local development MySQL.
#
# Runs a private MySQL server owned by your user, with its data in ./.local/mysql-data,
# listening only on 127.0.0.1:3307. It does not touch any MySQL server you already run.
#
#   scripts/dev-mysql.sh start   # initialize (first run) and start
#   scripts/dev-mysql.sh stop
#   scripts/dev-mysql.sh status
#
# On first start it creates the databases `digivote` and `digivote_test` and an application
# user `digivote` with a random password, written to ./.env (git-ignored).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL="$ROOT/.local"
DATA="$LOCAL/mysql-data"
SOCK="$LOCAL/mysql.sock"
PORT="${DIGIVOTE_DEV_MYSQL_PORT:-3307}"
MYSQL_BASE="${MYSQL_BASE:-$(dirname "$(dirname "$(command -v mysqld || echo /usr/local/mysql/bin/mysqld)")")}"
MYSQLD="$MYSQL_BASE/bin/mysqld"
MYSQL="$MYSQL_BASE/bin/mysql"

mkdir -p "$LOCAL"

client() { "$MYSQL" --socket="$SOCK" -uroot "$@"; }

case "${1:-start}" in
  start)
    if [ ! -d "$DATA/mysql" ]; then
      echo "Initializing private MySQL data directory in $DATA"
      "$MYSQLD" --no-defaults --initialize-insecure --basedir="$MYSQL_BASE" --datadir="$DATA" >"$LOCAL/mysql-init.log" 2>&1
      FIRST_RUN=1
    fi
    if [ -S "$SOCK" ] && client -e "SELECT 1" >/dev/null 2>&1; then
      echo "DIGI-VOTE dev MySQL already running on 127.0.0.1:$PORT"
    else
      "$MYSQLD" --no-defaults --basedir="$MYSQL_BASE" --datadir="$DATA" --port="$PORT" \
        --bind-address=127.0.0.1 --socket="$SOCK" --mysqlx=OFF \
        --pid-file="$LOCAL/mysql.pid" --log-error="$LOCAL/mysql.err" \
        --log-bin-trust-function-creators=1 >/dev/null 2>&1 &
      for _ in $(seq 1 60); do
        client -e "SELECT 1" >/dev/null 2>&1 && break
        sleep 1
      done
      client -e "SELECT 1" >/dev/null || { echo "MySQL failed to start; see $LOCAL/mysql.err"; exit 1; }
      echo "DIGI-VOTE dev MySQL started on 127.0.0.1:$PORT"
    fi
    if ! client -e "SELECT 1 FROM mysql.user WHERE user='digivote'" 2>/dev/null | grep -q 1; then
      PASS="$(openssl rand -hex 18)"
      client <<SQL
CREATE DATABASE IF NOT EXISTS digivote CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS digivote_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'digivote'@'localhost' IDENTIFIED BY '$PASS';
CREATE USER 'digivote'@'127.0.0.1' IDENTIFIED BY '$PASS';
GRANT ALL PRIVILEGES ON digivote.* TO 'digivote'@'localhost', 'digivote'@'127.0.0.1';
GRANT ALL PRIVILEGES ON digivote_test.* TO 'digivote'@'localhost', 'digivote'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
      ENV="$ROOT/.env"
      touch "$ENV"
      grep -v -E '^(DB_URL|DB_USERNAME|DB_PASSWORD|TEST_DB_URL)=' "$ENV" > "$ENV.tmp" || true
      {
        echo "DB_URL=jdbc:mysql://127.0.0.1:$PORT/digivote"
        echo "TEST_DB_URL=jdbc:mysql://127.0.0.1:$PORT/digivote_test"
        echo "DB_USERNAME=digivote"
        echo "DB_PASSWORD=$PASS"
      } >> "$ENV.tmp"
      mv "$ENV.tmp" "$ENV"
      chmod 600 "$ENV"
      echo "Created databases digivote, digivote_test and user 'digivote' (credentials in .env)"
    fi
    # Isolated databases for the demo accounts (digivote_demo) and their throwaway self-check (digivote_democheck).
    client <<SQL
CREATE DATABASE IF NOT EXISTS digivote_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS digivote_democheck CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON digivote_demo.* TO 'digivote'@'localhost', 'digivote'@'127.0.0.1';
GRANT ALL PRIVILEGES ON digivote_democheck.* TO 'digivote'@'localhost', 'digivote'@'127.0.0.1';
SQL
    ;;
  stop)
    if [ -f "$LOCAL/mysql.pid" ]; then kill "$(cat "$LOCAL/mysql.pid")" && echo "Stopped"; else echo "Not running"; fi
    ;;
  reset-democheck)
    # Drops and recreates ONLY the throwaway self-check database used by scripts/demo-check.sh.
    client -e "DROP DATABASE IF EXISTS digivote_democheck; CREATE DATABASE digivote_democheck CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
    echo "Recreated digivote_democheck"
    ;;
  status)
    client -e "SELECT VERSION() AS version" 2>/dev/null || echo "Not running"
    ;;
  *)
    echo "usage: $0 start|stop|status|reset-democheck"; exit 2;;
esac
