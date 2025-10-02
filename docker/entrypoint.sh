#!/bin/bash
set -euo pipefail

# Ensure cron log file exists for tailing.
touch /var/log/cron.log

PYTHON_BIN="${PYTHON_BIN:-/opt/pyenv/bin/python}"
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-devuser}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-devpass}"
POSTGRES_DB="${POSTGRES_DB:-insta-followers}"

echo "Waiting for PostgreSQL at ${POSTGRES_HOST}:${POSTGRES_PORT}..."
for attempt in $(seq 1 30); do
  if "$PYTHON_BIN" - <<'PYTHON'
import os
import psycopg

try:
    psycopg.connect(
        host=os.getenv('POSTGRES_HOST', 'postgres'),
        port=int(os.getenv('POSTGRES_PORT', '5432')),
        user=os.getenv('POSTGRES_USER', 'devuser'),
        password=os.getenv('POSTGRES_PASSWORD', 'devpass'),
        dbname=os.getenv('POSTGRES_DB', 'insta-followers'),
    ).close()
except psycopg.OperationalError as exc:
    raise SystemExit(f"Database not ready: {exc}")
PYTHON
  then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "ERROR: PostgreSQL did not become available in time" >&2
    exit 1
  fi
  sleep 2
done

echo "Ensuring database schema and importing legacy JSON data (if any)..."
if ! "$PYTHON_BIN" /app/scripts/import_data.py; then
  echo "WARNING: Initial data import failed. Continuing startup." >&2
fi

# Start cron in the background so scheduled jobs run.
cron

# Stream cron output to container logs for observability.
tail -f /var/log/cron.log &

# Start the Next.js production server as the main process.
PORT="${PORT:-3000}"
HOST="${HOST:-0.0.0.0}"
exec npm run start -- --hostname "$HOST" --port "$PORT"
