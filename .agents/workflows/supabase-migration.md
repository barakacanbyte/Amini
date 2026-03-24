---
description: How to manage Supabase migrations without relying on memory or manual tracking.
---

# Supabase Migration Workflow (No-Memory Method)

This workflow ensures that your database schema remains in sync across all environments without requiring you to remember which migrations you've applied. It relies on the **Supabase CLI** and the database's internal tracking table.

## 1. Prerequisites
Ensure you have the Supabase CLI installed:
```bash
npm install supabase --save-dev
```

## 2. Creating a New Migration
Never edit the database schema directly in the UI for production changes. Instead:
// turbo
1. Create a new timestamped migration file:
   ```bash
   npx supabase migration new your_feature_name
   ```
2. Open the new file in `supabase/migrations/<timestamp>_your_feature_name.sql`.
3. Add your SQL changes (DDL).

## 3. Syncing with Remote (Branching/Production)
To apply pending migrations to your remote project without manual prompting:
// turbo
```bash
npx supabase db push
```
> [!NOTE]
> This command identifies which files in `supabase/migrations/` haven't been run on the remote database yet and applies only the new ones.

## 4. Verifying Migration Status
If you are unsure if your local migrations are in sync with the remote database, run:
// turbo
```bash
./scripts/check-database-drift.sh
```
This script (included in the repository) compares your local `migrations/` folder with the remote `supabase_migrations` table.

## 5. Golden Rules
- **Rule 1**: Never edit an existing migration file that has already been pushed to the remote. If you made a mistake, create a *new* migration to fix it.
- **Rule 2**: `supabase/schema.sql` is a **read-only reflection**. Do not edit it manually. It's updated via `./scripts/dump-supabase-schema.sh`.
- **Rule 3**: Use `npx supabase db reset` locally to test your migrations from scratch before pushing.
