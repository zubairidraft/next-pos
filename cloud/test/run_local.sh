#!/bin/sh
# Fresh local database with the cloud migrations, then the parity test.
set -e
C="${NP_PG_ADMIN:-host=127.0.0.1 port=54329 user=postgres}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
psql "$C" -qc "drop database if exists np" 2>/dev/null
psql "$C" -qc "create database np"
for f in "$DIR/test/local_supabase_stub.sql" "$DIR"/supabase/migrations/*.sql; do
  case "$f" in *0004_storage*) continue ;; esac
  psql -v ON_ERROR_STOP=1 -q "$C dbname=np" -f "$f" 2>&1 | grep -v NOTICE || true
done
python3 "$DIR/test/parity_test.py"
