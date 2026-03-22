-- Legacy upgrade only: databases created with Arweave column names on impact_posts.
-- Idempotent: no-op if columns are already ipfs_* (e.g. after 20250101000001_initial_core).
-- Run once on older Supabase projects that still have arweave_tx_id / arweave_url.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'impact_posts'
      AND column_name = 'arweave_tx_id'
  ) THEN
    ALTER TABLE public.impact_posts RENAME COLUMN arweave_tx_id TO ipfs_cid;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'impact_posts'
      AND column_name = 'arweave_url'
  ) THEN
    ALTER TABLE public.impact_posts RENAME COLUMN arweave_url TO ipfs_url;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'impact_posts'
      AND column_name = 'attachment_tx_id'
  ) THEN
    ALTER TABLE public.impact_posts RENAME COLUMN attachment_tx_id TO attachment_cid;
  END IF;
END $$;
