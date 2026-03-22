# Supabase schema and migrations

## Layout

| Path | Purpose |
|------|---------|
| [`migrations/`](./migrations/) | Ordered SQL migrations (timestamp prefix `YYYYMMDDHHMMSS_*`). Apply in lexicographic order. |
| [`schema.sql`](./schema.sql) | **Reference snapshot** of the expected `public` schema after all migrations—use for docs/reviews. Update when you add a migration, or regenerate via [`../scripts/dump-supabase-schema.sh`](../scripts/dump-supabase-schema.sh). |

## Applying migrations

### Supabase SQL editor (manual)

1. Open the Supabase project → **SQL Editor**.
2. Run each file under `migrations/` **in order** (oldest timestamp first), or paste the combined contents if you prefer a single run.

### Existing database (Arweave-era `impact_posts`)

If your table still has `arweave_tx_id` / `arweave_url` / `attachment_tx_id`, ensure migration **`20250101000004_legacy_rename_arweave_columns_to_ipfs.sql`** runs after core tables exist. It is **idempotent** and safe if columns are already renamed.

### Fresh database

Running all migrations in order recreates the full schema. Migration `20250101000001_initial_core.sql` creates `impact_posts` with **IPFS** column names; `0004` is then a no-op.

## Keeping `schema.sql` in sync

After adding or changing a migration:

1. **Preferred:** Update [`schema.sql`](./schema.sql) by hand to reflect the new end state, **or**
2. Run `./scripts/dump-supabase-schema.sh` against a database that has all migrations applied (requires Postgres connection string—see script).

## Supabase CLI (optional)

If you use the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref <your-project-ref>
# Inspect diff / pull remote schema per CLI docs for your workflow
```

This repo does not commit `config.toml` by default; add one if you standardize on CLI-driven deploys.
