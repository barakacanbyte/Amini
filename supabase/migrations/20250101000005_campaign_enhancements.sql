-- Migration: Campaign creation enhancements
-- Adds new metadata columns for richer campaign information.

ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS deadline timestamptz,
ADD COLUMN IF NOT EXISTS contact_email text,
ADD COLUMN IF NOT EXISTS beneficiary_description text,
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS milestone_data jsonb,
ADD COLUMN IF NOT EXISTS social_links jsonb,
ADD COLUMN IF NOT EXISTS impact_metrics jsonb,
ADD COLUMN IF NOT EXISTS tags text[];

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_deadline ON public.campaigns(deadline);
CREATE INDEX IF NOT EXISTS idx_campaigns_tags ON public.campaigns USING GIN (tags);
