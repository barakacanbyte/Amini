-- Migration: Campaign metadata columns (explorer / API enrichment)
-- Safe to run on existing DBs (IF NOT EXISTS).

ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS image_url text,
ADD COLUMN IF NOT EXISTS region text,
ADD COLUMN IF NOT EXISTS cause text;

CREATE INDEX IF NOT EXISTS idx_campaigns_region ON public.campaigns(region);
CREATE INDEX IF NOT EXISTS idx_campaigns_cause ON public.campaigns(cause);
