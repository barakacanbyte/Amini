#!/usr/bin/env bash
# Compare local supabase/migrations/* with the remote database state
#
# Requires:
#   - Supabase CLI (`npx supabase`)
#   - Linked project (`npx supabase link`)
#
# This script helps you avoid "memory-based" migrations by identifying:
#   1. Local migrations that haven't been pushed yet.
#   2. Remote changes that haven't been captured in local migrations.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "🔍 Checking migration status..."

# 1. Check for local pending migrations
echo "--- Pending Local Migrations (not yet on remote) ---"
npx supabase migration list

echo ""
echo "--- Database Drift Check ---"
echo "Checking if the remote database has schema changes not found in your local files..."
# This requires a linked project and password in .env or interactive
npx supabase db remote changes || echo "ℹ️  Could not check remote changes. Ensure you have run 'npx supabase link'."

echo ""
echo "✅ Summary complete. Use 'npx supabase db push' to apply pending local migrations."
