#!/usr/bin/env bash
# Dump public schema from Supabase Postgres into supabase/schema.sql
#
# Requires:
#   - `pg_dump` (PostgreSQL client tools)
#   - Connection string with direct DB access (Settings → Database → URI in Supabase),
#     NOT the REST URL. Use the "Transaction" or "Session" pooler URI as documented.
#
# Usage:
#   export SUPABASE_DB_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
#   ./scripts/dump-supabase-schema.sh
#
# Or:
#   DATABASE_URL="postgresql://..." ./scripts/dump-supabase-schema.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/supabase/schema.sql"
URL="${SUPABASE_DB_URL:-${DATABASE_URL:-}}"

if [[ -z "$URL" ]]; then
  echo "Set SUPABASE_DB_URL or DATABASE_URL to your Supabase Postgres connection string." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not found. Install PostgreSQL client tools." >&2
  exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

pg_dump "$URL" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --schema=public \
  -f "$TMP"

mv "$TMP" "$OUT"
trap - EXIT
echo "Wrote $OUT"
